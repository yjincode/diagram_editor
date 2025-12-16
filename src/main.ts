import './styles/main.css';
import { State } from './core/State';
import { Canvas } from './core/Canvas';
import { InteractionManager } from './core/InteractionManager';
import { Toolbar } from './ui/Toolbar';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { MCPClient } from './core/MCPClient';
import { SessionManager } from './core/SessionManager';
import { SessionSidebar } from './ui/SessionSidebar';

class DiagramEditor {
  private state: State;
  private canvas: Canvas;
  private mcpClient: MCPClient;
  private sessionManager: SessionManager;
  private sessionSidebar: SessionSidebar;

  constructor() {
    // Initialize core
    this.state = new State();
    this.canvas = new Canvas(this.state);
    // These are intentionally not stored - they set up event handlers
    new InteractionManager(this.state, this.canvas);

    // Initialize UI
    new Toolbar(this.state, this.canvas);
    new PropertiesPanel(this.state);

    // Initialize Session Manager
    this.sessionManager = new SessionManager(this.state);
    this.sessionSidebar = new SessionSidebar(this.sessionManager);

    // Initialize MCP client
    this.mcpClient = new MCPClient(this.state);

    // MCP에서 세션 목록 변경 시 사이드바 업데이트
    this.mcpClient.on('sessionListChange', () => {
      this.sessionSidebar.refreshSessions();
    });

    // MCP에서 데이터 수신 시 캐시에 저장
    this.mcpClient.on('dataReceived', () => {
      this.sessionManager.saveReceivedDataToCache();
    });

    // Initial render (empty canvas)
    this.canvas.render();

    // Save initial state to history
    this.state.saveToHistory();

    // MCP 서버와 실시간 동기화
    this.mcpClient.connectSSE();

    // Initialize session (load most recent or create new)
    this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    await this.sessionManager.initialize();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new DiagramEditor();
});
