#!/usr/bin/env node
/**
 * MCP Handler (lightweight, for Docker exec)
 * - Handles MCP stdio protocol from Claude Desktop
 * - Communicates with HTTP server via REST API
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";

const API_BASE = `http://localhost:${config.httpPort}/api`;

// Helper to call HTTP API
async function apiCall(path: string, method = 'GET', body?: any) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE}${path}`, options);
  return response.json();
}

// Sync file for communication with http-server
import { promises as fsPromises } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, '..', '..', 'cache');
const SYNC_FILE = join(CACHE_DIR, '.mcp-sync.json');

// Write sync data to file
async function writeSyncFile(data: object) {
  try {
    await fsPromises.mkdir(CACHE_DIR, { recursive: true });
    await fsPromises.writeFile(SYNC_FILE, JSON.stringify(data));
  } catch (e) {
    // Ignore errors
  }
}

// Start WebSocket server
async function startWebSocket() {
  await writeSyncFile({ startWs: true });
}

// Notify loading state
async function notifyLoading(start: boolean) {
  const data = start
    ? { loadingStart: true, startWs: true }
    : { loadingEnd: true };
  await writeSyncFile(data);
}

// MCP Server
const server = new Server(
  { name: "diagram-editor-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "add_component",
      description: "Add a component to the diagram",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Component name" },
          icon: { type: "string", description: "Emoji icon" },
          color: { type: "string", description: "Background color (hex)" },
          x: { type: "number", description: "X position" },
          y: { type: "number", description: "Y position" },
        },
        required: ["name"],
      },
    },
    {
      name: "add_arrow",
      description: "Add an arrow between components",
      inputSchema: {
        type: "object",
        properties: {
          fromId: { type: "string", description: "Source component ID" },
          toId: { type: "string", description: "Target component ID" },
          label: { type: "string", description: "Arrow label" },
          color: { type: "string", description: "Arrow color" },
        },
        required: ["fromId", "toId"],
      },
    },
    {
      name: "clear_diagram",
      description: "Clear all elements from the diagram",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_diagram",
      description: "Get current diagram state",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "set_session_title",
      description: "Set the current session title",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Session title" },
        },
        required: ["title"],
      },
    },
  ],
}));

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    await notifyLoading(true);

    switch (name) {
      case "add_component": {
        const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const element = {
          id,
          type: "component",
          name: (args as any).name || "Component",
          icon: (args as any).icon || "📦",
          color: (args as any).color || "#e3f2fd",
          x: (args as any).x || 100,
          y: (args as any).y || 100,
          width: 120,
          height: 80,
        };
        await apiCall("/elements", "POST", element);
        await notifyLoading(false);
        return { content: [{ type: "text", text: `Added component: ${element.name} (ID: ${id})` }] };
      }

      case "add_arrow": {
        const id = `arrow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const element = {
          id,
          type: "arrow",
          fromId: (args as any).fromId,
          toId: (args as any).toId,
          label: (args as any).label || "",
          color: (args as any).color || "#333333",
        };
        await apiCall("/elements", "POST", element);
        await notifyLoading(false);
        return { content: [{ type: "text", text: `Added arrow from ${element.fromId} to ${element.toId}` }] };
      }

      case "clear_diagram": {
        await apiCall("/diagram", "DELETE");
        await notifyLoading(false);
        return { content: [{ type: "text", text: "Diagram cleared" }] };
      }

      case "get_diagram": {
        const diagram = await apiCall("/diagram");
        await notifyLoading(false);
        return { content: [{ type: "text", text: JSON.stringify(diagram, null, 2) }] };
      }

      case "set_session_title": {
        const title = (args as any).title;
        await apiCall("/session/current", "PUT", { sessionTitle: title });
        await notifyLoading(false);
        return { content: [{ type: "text", text: `Session title set to: ${title}` }] };
      }

      default:
        await notifyLoading(false);
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error) {
    await notifyLoading(false);
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

// Start MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Handler started");
}

main().catch(console.error);
