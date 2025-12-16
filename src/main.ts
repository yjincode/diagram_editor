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
      console.log('[DiagramEditor] MCP 세션 목록 변경 -> 사이드바 새로고침');
      this.sessionSidebar.refreshSessions();
    });

    // Initial render (empty canvas)
    this.canvas.render();

    // Save initial state to history
    this.state.saveToHistory();

    // SSE로 MCP 서버와 실시간 동기화
    console.log('[DiagramEditor] MCP 서버 SSE 연결 시작...');
    this.mcpClient.connectSSE();

    // Initialize session (load most recent or create new)
    this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    console.log('[DiagramEditor] 세션 초기화...');
    await this.sessionManager.initialize();
    console.log('[DiagramEditor] 세션 초기화 완료');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new DiagramEditor();
});
