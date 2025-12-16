import { SessionManager } from '../core/SessionManager';
import { SessionListItem } from '../types';
import { t, i18n } from '../i18n';

export class SessionSidebar {
  private sessionManager: SessionManager;
  private sidebarContainer: HTMLElement;
  private listContainer: HTMLElement;
  private newDiagramBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;
  private expandBtn: HTMLElement;
  private sessions: SessionListItem[] = [];
  private editingSessionId: string | null = null;
  private isCollapsed = false;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;

    this.sidebarContainer = document.getElementById('sessionSidebar') as HTMLElement;
    this.listContainer = document.getElementById('sessionList') as HTMLElement;
    this.newDiagramBtn = document.getElementById('newDiagramBtn') as HTMLButtonElement;
    this.closeBtn = document.getElementById('sidebarCloseBtn') as HTMLButtonElement;
    this.expandBtn = document.getElementById('sidebarExpandBtn') as HTMLElement;

    // Load collapsed state from localStorage
    this.isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    this.updateSidebarState();

    this.bindEvents();
    this.loadSessions();
  }

  private bindEvents(): void {
    // New diagram button
    this.newDiagramBtn.addEventListener('click', () => this.handleNewDiagram());

    // Close button (hide sidebar)
    this.closeBtn.addEventListener('click', () => this.collapseSidebar());

    // Expand button (show sidebar)
    this.expandBtn.addEventListener('click', () => this.expandSidebar());

    // Update button text based on language
    this.updateButtonText();

    // 언어 변경 시 버튼 텍스트 및 리스트 업데이트
    i18n.onChange(() => {
      this.updateButtonText();
      this.render();
    });

    // Session manager events
    this.sessionManager.on('sessionChange', () => {
      this.loadSessions();
    });

    this.sessionManager.on('sessionListChange', () => {
      this.loadSessions();
    });

    this.sessionManager.on('sessionTitleChange', (newTitle: string) => {
      // 현재 세션의 제목이 변경된 경우 로컬 배열도 업데이트
      const currentId = this.sessionManager.currentSessionId;
      if (currentId) {
        const idx = this.sessions.findIndex(s => s.id === currentId);
        if (idx >= 0) {
          this.sessions[idx].title = newTitle;
        }
      }
      this.render();
    });
  }

  private updateButtonText(): void {
    this.newDiagramBtn.textContent = `+ ${t('newDiagram')}`;
  }

  private async loadSessions(): Promise<void> {
    this.sessions = await this.sessionManager.getSessionList();
    this.render();
  }

  // 외부에서 호출 가능한 세션 목록 새로고침
  async refreshSessions(): Promise<void> {
    await this.loadSessions();
  }

  private render(): void {
    if (this.sessions.length === 0) {
      this.listContainer.innerHTML = `<div class="session-empty">${t('noSessions')}</div>`;
      return;
    }

    const currentId = this.sessionManager.currentSessionId;

    this.listContainer.innerHTML = this.sessions.map(session => {
      const isActive = session.id === currentId;
      const isEditing = session.id === this.editingSessionId;
      const formattedDate = this.formatDate(session.lastSavedAt);

      if (isEditing) {
        return `
          <div class="session-item ${isActive ? 'active' : ''}" data-id="${session.id}">
            <input type="text" class="session-title-input" value="${this.escapeHtml(session.title)}" data-id="${session.id}">
            <div class="session-date">${formattedDate}</div>
          </div>
        `;
      }

      return `
        <div class="session-item ${isActive ? 'active' : ''}" data-id="${session.id}">
          <div class="session-item-header">
            <div class="session-title" data-id="${session.id}">${this.escapeHtml(session.title)}</div>
            <div class="session-actions">
              <button class="session-edit-btn" data-id="${session.id}" title="${t('editTitle')}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="session-delete-btn" data-id="${session.id}" title="${t('deleteSession')}">×</button>
            </div>
          </div>
          <div class="session-date">${formattedDate}</div>
        </div>
      `;
    }).join('');

    this.bindItemEvents();
  }

  private bindItemEvents(): void {
    // Click on session item to load
    this.listContainer.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Don't trigger if clicking buttons or input
        if (target.classList.contains('session-delete-btn') ||
            target.classList.contains('session-edit-btn') ||
            target.classList.contains('session-title-input') ||
            target.closest('.session-edit-btn') ||
            target.closest('.session-actions')) {
          return;
        }
        const id = item.getAttribute('data-id');
        if (id) this.handleSessionClick(id);
      });
    });

    // Double click on title to edit
    this.listContainer.querySelectorAll('.session-title').forEach(title => {
      title.addEventListener('dblclick', (e) => {
        const id = (e.target as HTMLElement).getAttribute('data-id');
        if (id) this.startEditingTitle(id);
      });
    });

    // Edit button
    this.listContainer.querySelectorAll('.session-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const id = target.getAttribute('data-id');
        if (id) this.startEditingTitle(id);
      });
    });

    // Delete button
    this.listContainer.querySelectorAll('.session-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (e.target as HTMLElement).getAttribute('data-id');
        if (id) this.handleDeleteSession(id);
      });
    });

    // Title input events
    this.listContainer.querySelectorAll('.session-title-input').forEach(input => {
      const inputEl = input as HTMLInputElement;

      inputEl.addEventListener('blur', () => {
        this.finishEditingTitle(inputEl);
      });

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          inputEl.blur();
        } else if (e.key === 'Escape') {
          this.editingSessionId = null;
          this.render();
        }
      });

      // Auto-focus the input
      inputEl.focus();
      inputEl.select();
    });
  }

  private updateSidebarState(): void {
    this.sidebarContainer.classList.toggle('collapsed', this.isCollapsed);
    this.expandBtn.classList.toggle('visible', this.isCollapsed);
  }

  private collapseSidebar(): void {
    // Add collapsing class first to hide content immediately
    this.sidebarContainer.classList.add('collapsing');

    // Small delay to let content fade out before width animates
    requestAnimationFrame(() => {
      this.isCollapsed = true;
      this.updateSidebarState();
      localStorage.setItem('sidebar-collapsed', 'true');

      // Remove collapsing class after animation completes
      setTimeout(() => {
        this.sidebarContainer.classList.remove('collapsing');
      }, 250);
    });
  }

  private expandSidebar(): void {
    // Add expanding class to keep content hidden during width animation
    this.sidebarContainer.classList.add('expanding');
    this.isCollapsed = false;
    this.updateSidebarState();
    localStorage.setItem('sidebar-collapsed', 'false');

    // Remove expanding class after width animation completes to show content
    setTimeout(() => {
      this.sidebarContainer.classList.remove('expanding');
    }, 250);
  }

  private async handleNewDiagram(): Promise<void> {
    await this.sessionManager.createNewSession();
  }

  private async handleSessionClick(id: string): Promise<void> {
    if (id === this.sessionManager.currentSessionId) return;
    await this.sessionManager.loadSession(id);
  }

  private startEditingTitle(id: string): void {
    this.editingSessionId = id;
    this.render();
  }

  private async finishEditingTitle(input: HTMLInputElement): Promise<void> {
    const id = input.getAttribute('data-id');
    const newTitle = input.value.trim();

    if (id && newTitle) {
      await this.sessionManager.setTitle(id, newTitle);
      // 로컬 sessions 배열도 직접 업데이트 (서버 동기화 지연 문제 방지)
      const sessionIdx = this.sessions.findIndex(s => s.id === id);
      if (sessionIdx >= 0) {
        this.sessions[sessionIdx].title = newTitle;
      }
    }

    this.editingSessionId = null;
    this.render();  // loadSessions 대신 render만 호출 (캐시 이미 업데이트됨)
  }

  private async handleDeleteSession(id: string): Promise<void> {
    const session = this.sessions.find(s => s.id === id);
    if (!session) return;

    const confirmed = window.confirm(`${t('deleteSessionConfirm')}\n\n"${session.title}"`);
    if (confirmed) {
      await this.sessionManager.deleteSession(id);
    }
  }

  private formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();

      const timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });

      if (isToday) {
        return `${t('today')} ${timeStr}`;
      } else if (isYesterday) {
        return `${t('yesterday')} ${timeStr}`;
      } else {
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        }) + ' ' + timeStr;
      }
    } catch {
      return isoString;
    }
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
