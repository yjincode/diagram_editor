#!/usr/bin/env node
/**
 * HTTP/WebSocket Server (runs in Docker)
 * - Serves REST API for diagram operations
 * - WebSocket for real-time sync with frontend (lazy start, auto shutdown)
 * - Communicates with MCP handler via shared cache files
 */

import express from "express";
import cors from "cors";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, "..", "..", "cache");

// Diagram state
interface DiagramElement {
  id: string;
  type: string;
  [key: string]: any;
}

interface DiagramState {
  elements: DiagramElement[];
  canvasSize: { width: number; height: number };
  sessionId?: string;
  sessionTitle?: string;
}

let diagram: DiagramState = {
  elements: [],
  canvasSize: { width: 1400, height: 900 }
};

// Ensure cache directory exists
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Ignore if exists
  }
}

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// WebSocket (lazy initialization)
let wss: WebSocketServer | null = null;
const wsClients: Set<WebSocket> = new Set();

// Auto-shutdown timer
let autoShutdownTimer: ReturnType<typeof setTimeout> | null = null;

function resetAutoShutdownTimer() {
  if (autoShutdownTimer) {
    clearTimeout(autoShutdownTimer);
  }
  autoShutdownTimer = setTimeout(() => {
    console.log('[WebSocket] 1분간 활동 없음 - 서버 종료');
    stopWebSocketServer();
  }, config.autoShutdownMs);
}

function startWebSocketServer() {
  if (wss) {
    console.log('[WebSocket] 이미 실행 중');
    resetAutoShutdownTimer();
    return;
  }

  wss = new WebSocketServer({ port: config.wsPort });
  console.log(`[WebSocket] 서버 시작 - 포트 ${config.wsPort}`);

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`[WebSocket] 클라이언트 연결됨, 총: ${wsClients.size}`);
    resetAutoShutdownTimer();

    // Send current state
    ws.send(JSON.stringify({
      type: 'diagram',
      data: diagram
    }));

    ws.on('close', () => {
      wsClients.delete(ws);
      console.log(`[WebSocket] 클라이언트 연결 해제, 총: ${wsClients.size}`);
    });

    ws.on('error', () => {
      wsClients.delete(ws);
    });
  });

  resetAutoShutdownTimer();
}

function stopWebSocketServer() {
  if (!wss) return;

  wsClients.forEach(client => client.close());
  wsClients.clear();
  wss.close();
  wss = null;

  if (autoShutdownTimer) {
    clearTimeout(autoShutdownTimer);
    autoShutdownTimer = null;
  }

  console.log('[WebSocket] 서버 종료됨');
}

// Broadcast to all clients
function broadcast(message: object) {
  if (!wss) return;

  const data = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
  resetAutoShutdownTimer();
}

// Watch for MCP updates (via file)
const MCP_SYNC_FILE = join(CACHE_DIR, '.mcp-sync.json');

async function watchMCPSync() {
  await ensureCacheDir();

  // Check for MCP sync file periodically
  setInterval(async () => {
    try {
      const content = await fs.readFile(MCP_SYNC_FILE, 'utf-8');
      const syncData = JSON.parse(content);

      // Start WebSocket if MCP requests it
      if (syncData.startWs) {
        startWebSocketServer();
      }

      // Update diagram state
      if (syncData.diagram) {
        diagram = syncData.diagram;
        broadcast({ type: 'diagram', data: diagram });
      }

      if (syncData.loadingStart) {
        startWebSocketServer(); // Ensure WS is running
        broadcast({ type: 'loadingStart' });
      }

      if (syncData.loadingEnd) {
        broadcast({ type: 'loadingEnd' });
      }

      // Clear sync file after processing
      await fs.unlink(MCP_SYNC_FILE).catch(() => {});
    } catch (error) {
      // No sync file or invalid - ignore
    }
  }, 100); // Check every 100ms
}

// REST API endpoints
app.get('/api/diagram', (req, res) => {
  res.json(diagram);
});

app.put('/api/diagram', (req, res) => {
  diagram = { ...diagram, ...req.body };
  broadcast({ type: 'diagram', data: diagram });
  res.json({ success: true });
});

app.delete('/api/diagram', (req, res) => {
  diagram = { elements: [], canvasSize: { width: 1400, height: 900 } };
  broadcast({ type: 'diagram', data: diagram });
  res.json({ success: true });
});

app.post('/api/elements', (req, res) => {
  diagram.elements.push(req.body);
  broadcast({ type: 'diagram', data: diagram });
  res.json({ success: true });
});

app.put('/api/elements/:id', (req, res) => {
  const idx = diagram.elements.findIndex(e => e.id === req.params.id);
  if (idx >= 0) {
    diagram.elements[idx] = { ...diagram.elements[idx], ...req.body };
    broadcast({ type: 'diagram', data: diagram });
  }
  res.json({ success: true });
});

app.delete('/api/elements/:id', (req, res) => {
  diagram.elements = diagram.elements.filter(e => e.id !== req.params.id);
  broadcast({ type: 'diagram', data: diagram });
  res.json({ success: true });
});

// Session endpoints
app.get('/api/sessions', async (req, res) => {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(CACHE_DIR);
    const sessions = [];

    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('.')) continue;
      try {
        const content = await fs.readFile(join(CACHE_DIR, file), 'utf-8');
        const session = JSON.parse(content);
        sessions.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          lastSavedAt: session.lastSavedAt
        });
      } catch (e) {
        // Skip invalid files
      }
    }

    sessions.sort((a, b) =>
      new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime()
    );

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read sessions' });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const filePath = join(CACHE_DIR, `${req.params.id}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (error) {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    await ensureCacheDir();
    const session = req.body;
    const filePath = join(CACHE_DIR, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    await ensureCacheDir();
    const filePath = join(CACHE_DIR, `${req.params.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save session' });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const filePath = join(CACHE_DIR, `${req.params.id}.json`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.put('/api/session/current', (req, res) => {
  diagram.sessionId = req.body.sessionId;
  diagram.sessionTitle = req.body.sessionTitle;
  res.json({ success: true });
});

// Start server
const httpServer = app.listen(config.httpPort, () => {
  console.log(`[HTTP] 서버 시작 - 포트 ${config.httpPort}`);
});

// Start watching for MCP updates
watchMCPSync();

console.log('[Server] Diagram Editor 서버 실행 중');
console.log(`  - HTTP API: http://localhost:${config.httpPort}`);
console.log(`  - WebSocket: ws://localhost:${config.wsPort} (MCP 요청 시 시작, 1분 후 자동 종료)`);
