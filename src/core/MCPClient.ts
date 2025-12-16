import { State } from './State';
import { DiagramElement } from '../types';
import { EventEmitter } from './EventEmitter';
import { config } from '../config';

export class MCPClient extends EventEmitter {
  private state: State;
  private ws: WebSocket | null = null;
  private isSyncingFromServer = false;
  private isSyncingToServer = false;
  private isConnected = false;

  constructor(state: State) {
    super();
    this.state = state;
    this.bindStateEvents();
    this.tryConnect();
  }

  private bindStateEvents(): void {
    this.state.on('elementsChange', () => {
      if (!this.isSyncingFromServer && this.isConnected) {
        this.syncToServer();
      }
    });
  }

  // 시작 시 한 번만 연결 시도
  private tryConnect(): void {
    this.ws = new WebSocket(config.wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.showMCPBanner();
      this.emit('mcpConnected');
    };

    this.ws.onmessage = (event) => {
      if (this.isSyncingToServer) return;

      try {
        const message = JSON.parse(event.data);

        if (message.type === 'loadingStart') {
          this.showLoadingModal();
        } else if (message.type === 'loadingEnd') {
          this.hideLoadingModal();
        } else if (message.type === 'diagram') {
          const data = message.data;
          this.isSyncingFromServer = true;

          if (data.sessionId) {
            this.state.setSessionMetadata({
              id: data.sessionId,
              title: data.sessionTitle || ''
            });
          }

          this.state.fromJSON(JSON.stringify({
            elements: data.elements,
            canvasSize: data.canvasSize
          }));
          this.state.expandCanvasToFitElements();

          this.isSyncingFromServer = false;
        } else if (message.type === 'sessionListChange') {
          this.emit('sessionListChange');
        }
      } catch (error) {
        this.isSyncingFromServer = false;
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.isConnected = false;
      this.hideMCPBanner();
      this.emit('mcpDisconnected');
      // 재연결 시도 없음 - MCP 종료 시 그냥 끝
    };

    this.ws.onerror = () => {
      // MCP 서버 없음 - 무시
    };
  }

  // MCP 연결 배너 표시
  private showMCPBanner(): void {
    let banner = document.getElementById('mcpBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'mcpBanner';
      banner.className = 'mcp-banner';
      banner.innerHTML = `
        <span class="mcp-banner-dot"></span>
        <span>AI Connected</span>
      `;
      document.body.appendChild(banner);
    }
    banner.classList.add('visible');

    // 3초 후 자동 숨김
    setTimeout(() => {
      banner.classList.remove('visible');
    }, 3000);
  }

  // MCP 연결 배너 숨김
  private hideMCPBanner(): void {
    const banner = document.getElementById('mcpBanner');
    if (banner) {
      banner.classList.remove('visible');
    }
  }

  // 하위 호환성
  connectSSE(): void {}
  disconnectSSE(): void {}

  // Sync diagram to MCP server
  async syncToServer(): Promise<void> {
    if (this.isSyncingFromServer || this.isSyncingToServer || !this.isConnected) return;
    this.isSyncingToServer = true;

    try {
      const diagramData = {
        elements: Array.from(this.state.elements.values()),
        canvasSize: this.state.canvasSize
      };

      await fetch(`${config.apiBase}/diagram`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diagramData)
      });
    } catch (error) {
      // Silent fail
    } finally {
      this.isSyncingToServer = false;
    }
  }

  async addElement(element: DiagramElement): Promise<void> {
    if (!this.isConnected) return;
    try {
      await fetch(`${config.apiBase}/elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(element)
      });
    } catch (error) {}
  }

  async updateElement(id: string, updates: Partial<DiagramElement>): Promise<void> {
    if (!this.isConnected) return;
    try {
      await fetch(`${config.apiBase}/elements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (error) {}
  }

  async deleteElement(id: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await fetch(`${config.apiBase}/elements/${id}`, {
        method: 'DELETE'
      });
    } catch (error) {}
  }

  async clearDiagram(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await fetch(`${config.apiBase}/diagram`, {
        method: 'DELETE'
      });
    } catch (error) {}
  }

  private showLoadingModal(): void {
    const modal = document.getElementById('aiLoadingModal');
    if (modal) {
      modal.classList.add('visible');
    }
  }

  private hideLoadingModal(): void {
    const modal = document.getElementById('aiLoadingModal');
    if (modal) {
      modal.classList.remove('visible');
    }
  }

  // Cleanup
  destroy(): void {
    if (this.ws) {
      this.ws.close();
    }
  }
}
