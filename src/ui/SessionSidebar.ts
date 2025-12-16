import { SessionManager } from '../core/SessionManager';
import { SessionListItem } from '../types';
import { t } from '../i18n';

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

    // Session manager events
    this.sessionManager.on('sessionChange', () => {
      this.loadSessions();
    });

    this.sessionManager.on('sessionListChange', () => {
      this.loadSessions();
    });

    this.sessionManager.on('sessionTitleChange', () => {
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
            <button class="session-delete-btn" data-id="${session.id}" title="${t('deleteSession')}">×</button>
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
        // Don't trigger if clicking delete button or input
        if (target.classList.contains('session-delete-btn') ||
            target.classList.contains('session-title-input')) {
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
    this.isCollapsed = true;
    this.updateSidebarState();
    localStorage.setItem('sidebar-collapsed', 'true');
  }

  private expandSidebar(): void {
    this.isCollapsed = false;
    this.updateSidebarState();
    localStorage.setItem('sidebar-collapsed', 'false');
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

    if (id && newTitle && id === this.sessionManager.currentSessionId) {
      await this.sessionManager.setTitle(newTitle);
    }

    this.editingSessionId = null;
    this.loadSessions();
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
