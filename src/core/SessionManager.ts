import { State } from './State';
import { EventEmitter } from './EventEmitter';
import { SessionData, SessionListItem } from '../types';

const API_BASE = 'http://localhost:3001/api';

export class SessionManager extends EventEmitter {
  private state: State;
  private saveDebounceTimer: number | null = null;
  private autoSaveInterval: number | null = null;
  private readonly DEBOUNCE_MS = 500;
  private readonly AUTO_SAVE_INTERVAL_MS = 30000; // 30초마다 자동 저장

  constructor(state: State) {
    super();
    this.state = state;
    this.bindStateEvents();
    this.bindWindowEvents();
    this.startAutoSaveInterval();
  }

  private bindStateEvents(): void {
    // Auto-save on element changes (debounced)
    this.state.on('elementsChange', () => {
      if (this.state.sessionId && this.hasElements()) {
        this.scheduleSave();
      }
    });
  }

  private bindWindowEvents(): void {
    // 페이지 떠날 때 저장
    window.addEventListener('beforeunload', () => {
      if (this.hasElements()) {
        this.saveCurrentSessionSync();
      }
    });

    // 탭 숨김/표시 시 저장
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.sessionId && this.hasElements()) {
        this.cancelScheduledSave();
        this.saveCurrentSession();
      }
    });
  }

  private startAutoSaveInterval(): void {
    this.autoSaveInterval = window.setInterval(() => {
      if (this.state.sessionId && this.hasElements()) {
        this.saveCurrentSession();
      }
    }, this.AUTO_SAVE_INTERVAL_MS);
  }

  // 정리 (필요 시 호출)
  destroy(): void {
    if (this.autoSaveInterval !== null) {
      window.clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    this.cancelScheduledSave();
  }

  // 요소가 있는지 확인
  private hasElements(): boolean {
    return this.state.elements.size > 0;
  }

  // 동기적 저장 (beforeunload용)
  private saveCurrentSessionSync(): void {
    if (!this.state.sessionId || !this.hasElements()) return;

    const sessionData = this.state.toSessionJSON();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${API_BASE}/sessions/${this.state.sessionId}`, false); // sync
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(sessionData));
  }

  // Generate default session title (date + time in minutes)
  getDefaultTitle(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  // Generate session ID
  private generateSessionId(): string {
    return `session_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Schedule a save operation (debounced)
  private scheduleSave(): void {
    this.cancelScheduledSave();
    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveCurrentSession();
    }, this.DEBOUNCE_MS);
  }

  // Cancel pending save
  private cancelScheduledSave(): void {
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
  }

  // Get session list from server
  async getSessionList(): Promise<SessionListItem[]> {
    try {
      const response = await fetch(`${API_BASE}/sessions`);
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error('Failed to get session list:', error);
      return [];
    }
  }

  // Load a specific session
  async loadSession(id: string): Promise<boolean> {
    try {
      // 기존 세션 저장은 자동 저장에 맡기고, 여기서는 하지 않음
      // (세션 클릭만으로 순서가 바뀌는 것 방지)
      this.cancelScheduledSave();

      const response = await fetch(`${API_BASE}/sessions/${id}`);
      if (!response.ok) {
        console.error('Session not found:', id);
        return false;
      }

      const session: SessionData = await response.json();
      this.state.fromSessionData(session);

      // Update server about current session
      await fetch(`${API_BASE}/session/current`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          sessionTitle: session.title
        })
      });

      this.emit('sessionChange', session.id);
      return true;
    } catch (error) {
      console.error('Failed to load session:', error);
      return false;
    }
  }

  // Create a new session
  async createNewSession(): Promise<string | null> {
    try {
      // Save current session first if it has elements
      if (this.state.sessionId && this.hasElements()) {
        this.cancelScheduledSave();
        await this.saveCurrentSession();
        console.log('[SessionManager] 기존 세션 저장 완료:', this.state.sessionId);
      }

      // Clear state for new session
      this.state.clearForNewSession();

      const now = new Date().toISOString();
      const sessionData: SessionData = {
        id: this.generateSessionId(),
        title: this.getDefaultTitle(),
        createdAt: now,
        lastSavedAt: now,
        elements: [],
        canvasSize: { width: 1400, height: 900 }
      };

      // Create session on server
      const response = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });

      if (!response.ok) {
        console.error('Failed to create session');
        return null;
      }

      const result = await response.json();
      const session = result.session || sessionData;

      // Update state with session metadata
      this.state.setSessionMetadata({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        lastSavedAt: session.lastSavedAt
      });

      this.emit('sessionChange', session.id);
      this.emit('sessionListChange');
      return session.id;
    } catch (error) {
      console.error('Failed to create new session:', error);
      return null;
    }
  }

  // Save current session
  async saveCurrentSession(): Promise<boolean> {
    if (!this.state.sessionId) {
      // No active session, create one
      const newId = await this.createNewSession();
      return newId !== null;
    }

    try {
      const sessionData = this.state.toSessionJSON();

      const response = await fetch(`${API_BASE}/sessions/${this.state.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });

      if (response.ok) {
        const now = new Date().toISOString();
        this.state.setSessionMetadata({ lastSavedAt: now });
        this.emit('sessionSaved', this.state.sessionId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save session:', error);
      return false;
    }
  }

  // Delete a session
  async deleteSession(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // If deleted session is current, create new session
        if (this.state.sessionId === id) {
          await this.createNewSession();
        }
        this.emit('sessionListChange');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  }

  // Update session title
  async setTitle(title: string): Promise<boolean> {
    if (!this.state.sessionId) return false;

    this.state.setSessionMetadata({ title });

    try {
      // Update on server
      const sessionData = this.state.toSessionJSON();
      const response = await fetch(`${API_BASE}/sessions/${this.state.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });

      if (response.ok) {
        this.emit('sessionTitleChange', title);
        this.emit('sessionListChange');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to update session title:', error);
      return false;
    }
  }

  // Get current session ID
  get currentSessionId(): string | null {
    return this.state.sessionId;
  }

  // Get current session title
  get currentSessionTitle(): string {
    return this.state.sessionTitle;
  }

  // Initialize - load most recent session or create new one
  async initialize(): Promise<void> {
    const sessions = await this.getSessionList();

    if (sessions.length > 0) {
      // Load most recent session
      await this.loadSession(sessions[0].id);
    } else {
      // 세션이 없지만 이미 MCP 서버에서 받은 데이터가 있으면
      // 데이터를 보존하면서 세션 메타데이터만 설정
      if (this.state.elements.size > 0) {
        console.log('[SessionManager] MCP 데이터가 있어서 세션 메타데이터만 설정');
        await this.createSessionForExistingData();
      } else {
        // Create new session if none exist
        await this.createNewSession();
      }
    }
  }

  // MCP 서버에서 받은 기존 데이터를 보존하면서 세션 생성
  private async createSessionForExistingData(): Promise<string | null> {
    try {
      const now = new Date().toISOString();
      const sessionId = this.generateSessionId();
      const title = this.getDefaultTitle();

      // 세션 메타데이터만 설정 (데이터는 보존)
      this.state.setSessionMetadata({
        id: sessionId,
        title: title,
        createdAt: now,
        lastSavedAt: now
      });

      // 서버에 세션 생성 (기존 데이터 포함)
      const sessionData = this.state.toSessionJSON();
      const response = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
      });

      if (!response.ok) {
        console.warn('Failed to create session on server, continuing locally');
      }

      this.emit('sessionChange', sessionId);
      this.emit('sessionListChange');
      return sessionId;
    } catch (error) {
      console.error('Failed to create session for existing data:', error);
      return null;
    }
  }
}
