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
  private isAILoading = false;  // AI 로딩 중 플래그
  private pendingDiagram: any = null;  // 로딩 중 받은 다이어그램 데이터

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
    }

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      if (this.isSyncingToServer) return;

      try {
        const message = JSON.parse(event.data);

        if (message.type === 'loadingStart') {
          this.isAILoading = true;
          this.pendingDiagram = null;
          this.showLoadingModal();
        } else if (message.type === 'loadingEnd') {
          // 로딩 완료 - 대기 중인 다이어그램이 있으면 렌더링
          if (this.pendingDiagram) {
            this.applyDiagramData(this.pendingDiagram);
            this.pendingDiagram = null;
          }
          this.isAILoading = false;
          this.hideLoadingModal();
        } else if (message.type === 'diagram') {
          const data = message.data;

          if (this.isAILoading) {
            // 로딩 중이면 데이터를 저장만 하고 렌더링하지 않음
            this.pendingDiagram = data;
          } else {
            // 로딩 중이 아니면 즉시 렌더링
            this.applyDiagramData(data);
          }
        } else if (message.type === 'sessionListChange') {
          this.emit('sessionListChange');
        }
      } catch (error) {
        console.warn('WebSocket 데이터 파싱 실패:', error);
        this.isSyncingFromServer = false;
      }
    };

    this.ws.onclose = () => {
      this.ws = null;

      // 자동 재연결 시도
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connectWebSocket(), this.reconnectDelay);
      }
    };

    this.ws.onerror = () => {
      // WebSocket 오류 무시
    };
  }

  // WebSocket 연결 해제
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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

  // 다이어그램 데이터 적용
  private applyDiagramData(data: any): void {
    this.isSyncingFromServer = true;

    // 세션 정보가 있으면 state에 설정
    if (data.sessionId) {
      this.state.setSessionMetadata({
        id: data.sessionId,
        title: data.sessionTitle || ''
      });
    }

    const result = this.state.fromJSON(JSON.stringify({
      elements: data.elements,
      canvasSize: data.canvasSize
    }));
    if (!result.success) {
      console.warn('서버 데이터 파싱 실패:', result.error);
    }
    this.state.expandCanvasToFitElements();

    // 데이터 수신 후 캐시 저장을 위해 이벤트 발생
    this.emit('dataReceived', {
      sessionId: data.sessionId,
      sessionTitle: data.sessionTitle,
      elements: data.elements,
      canvasSize: data.canvasSize
    });

    this.isSyncingFromServer = false;
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
