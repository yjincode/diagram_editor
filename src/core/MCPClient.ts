import { State } from './State';
import { DiagramElement } from '../types';
import { EventEmitter } from './EventEmitter';
import config from '../../config.json';

const API_BASE = `http://localhost:${config.httpPort}/api`;
const WS_URL = `ws://localhost:${config.wsPort}`;

export class MCPClient extends EventEmitter {
  private state: State;
  private ws: WebSocket | null = null;
  private isSyncingFromServer = false;
  private isSyncingToServer = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  constructor(state: State) {
    super();
    this.state = state;
    this.bindStateEvents();
  }

  private bindStateEvents(): void {
    // Sync to server when elements change (but not when syncing from server)
    this.state.on('elementsChange', () => {
      if (!this.isSyncingFromServer) {
        this.syncToServer();
      }
    });
  }

  // WebSocket으로 서버 변경사항 실시간 수신
  async connectWebSocket(): Promise<void> {
    // 기존 연결 정리
    this.disconnectWebSocket();

    // WebSocket 서버 시작 요청 시도 (실패해도 무시 - MCP가 자동으로 시작함)
    try {
      await fetch(`${API_BASE}/ws-start`, { method: 'POST' });
    } catch (e) {
      // HTTP 서버가 없어도 MCP가 WebSocket을 자동 시작하므로 무시
      console.log('[MCP] HTTP API 사용 불가 - MCP WebSocket 자동 시작 모드');
    }

    console.log('[MCP] WebSocket 연결 시도...');
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('[MCP] WebSocket 연결됨');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      if (this.isSyncingToServer) return;

      try {
        const message = JSON.parse(event.data);

        if (message.type === 'loadingStart') {
          console.log('[MCP] AI 다이어그램 생성 시작');
          this.showLoadingModal();
        } else if (message.type === 'loadingEnd') {
          console.log('[MCP] AI 다이어그램 생성 완료');
          this.hideLoadingModal();
        } else if (message.type === 'diagram') {
          const data = message.data;
          this.isSyncingFromServer = true;

          console.log('[MCP] 서버에서 데이터 수신:', data.elements?.length || 0, '개 요소');

          // 세션 정보가 있으면 state에 설정
          if (data.sessionId) {
            this.state.setSessionMetadata({
              id: data.sessionId,
              title: data.sessionTitle || ''
            });
            console.log('[MCP] 세션 정보 업데이트:', data.sessionId, data.sessionTitle);
          }

          const result = this.state.fromJSON(JSON.stringify({
            elements: data.elements,
            canvasSize: data.canvasSize
          }));
          if (!result.success) {
            console.warn('서버 데이터 파싱 실패:', result.error);
          }
          this.state.expandCanvasToFitElements();

          this.isSyncingFromServer = false;
        } else if (message.type === 'sessionListChange') {
          console.log('[MCP] 세션 목록 변경 알림 수신');
          this.emit('sessionListChange');
        }
      } catch (error) {
        console.warn('WebSocket 데이터 파싱 실패:', error);
        this.isSyncingFromServer = false;
      }
    };

    this.ws.onclose = () => {
      console.log('[MCP] WebSocket 연결 종료');
      this.ws = null;

      // 자동 재연결 시도
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[MCP] ${this.reconnectDelay}ms 후 재연결 시도 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connectWebSocket(), this.reconnectDelay);
      }
    };

    this.ws.onerror = (error) => {
      console.warn('[MCP] WebSocket 오류:', error);
    };
  }

  // WebSocket 연결 해제
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      console.log('[MCP] WebSocket 연결 해제');
    }
  }

  // 하위 호환성을 위한 SSE 메서드들 (WebSocket으로 리다이렉트)
  connectSSE(): void {
    this.connectWebSocket();
  }

  disconnectSSE(): void {
    this.disconnectWebSocket();
  }

  // Sync diagram from frontend to server
  async syncToServer(): Promise<void> {
    if (this.isSyncingFromServer || this.isSyncingToServer) return;
    this.isSyncingToServer = true;

    try {
      const diagramData = {
        elements: Array.from(this.state.elements.values()),
        canvasSize: this.state.canvasSize
      };

      await fetch(`${API_BASE}/diagram`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diagramData)
      });
    } catch (error) {
      // Silent fail - offline mode
    } finally {
      this.isSyncingToServer = false;
    }
  }

  // Add element to server
  async addElement(element: DiagramElement): Promise<void> {
    try {
      await fetch(`${API_BASE}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(element)
      });
    } catch (error) {
      console.error('요소 추가 실패:', error);
    }
  }

  // Update element on server
  async updateElement(id: string, updates: Partial<DiagramElement>): Promise<void> {
    try {
      await fetch(`${API_BASE}/elements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (error) {
      console.error('요소 업데이트 실패:', error);
    }
  }

  // Delete element from server
  async deleteElement(id: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/elements/${id}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('요소 삭제 실패:', error);
    }
  }

  // Clear diagram on server
  async clearDiagram(): Promise<void> {
    try {
      await fetch(`${API_BASE}/diagram`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('다이어그램 초기화 실패:', error);
    }
  }

  // Show loading modal
  private showLoadingModal(): void {
    const modal = document.getElementById('aiLoadingModal');
    if (modal) {
      modal.classList.add('visible');
    }
  }

  // Hide loading modal
  private hideLoadingModal(): void {
    const modal = document.getElementById('aiLoadingModal');
    if (modal) {
      modal.classList.remove('visible');
    }
  }

}
