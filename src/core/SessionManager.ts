import { State } from './State';
import { EventEmitter } from './EventEmitter';
import { SessionData, SessionListItem } from '../types';

// Use relative URL - works with Vite dev server directly
const API_BASE = '/api';
const SESSIONS_CACHE_KEY = 'diagram-editor-sessions';
const SESSIONS_DATA_KEY = 'diagram-editor-session-data';

export class SessionManager extends EventEmitter {
  private state: State;
  private saveDebounceTimer: number | null = null;
  private autoSaveInterval: number | null = null;
  private readonly DEBOUNCE_MS = 500;
  private readonly AUTO_SAVE_INTERVAL_MS = 30000; // 30초마다 자동 저장
  private isServerAvailable = false;

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

  // Get session list (server first, then localStorage fallback)
  async getSessionList(): Promise<SessionListItem[]> {
    try {
      const response = await fetch(`${API_BASE}/sessions`, {
        signal: AbortSignal.timeout(2000) // 2초 타임아웃
      });
      if (!response.ok) throw new Error('Server error');

      const sessions = await response.json();
      this.isServerAvailable = true;

      // 서버 데이터를 localStorage에 캐시
      this.cacheSessionList(sessions);
      return sessions;
    } catch (error) {
      console.log('[SessionManager] 서버 연결 실패, localStorage에서 로드');
      this.isServerAvailable = false;
      return this.getCachedSessionList();
    }
  }

  // localStorage에 세션 목록 캐시
  private cacheSessionList(sessions: SessionListItem[]): void {
    try {
      localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Failed to cache session list:', e);
    }
  }

  // localStorage에서 세션 목록 가져오기
  private getCachedSessionList(): SessionListItem[] {
    try {
      const cached = localStorage.getItem(SESSIONS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  }

  // localStorage에 세션 데이터 저장
  private cacheSessionData(session: SessionData): void {
    try {
      const dataStr = localStorage.getItem(SESSIONS_DATA_KEY);
      const data: Record<string, SessionData> = dataStr ? JSON.parse(dataStr) : {};
      data[session.id] = session;
      localStorage.setItem(SESSIONS_DATA_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to cache session data:', e);
    }
  }

  // localStorage에서 세션 데이터 가져오기
  private getCachedSessionData(id: string): SessionData | null {
    try {
      const dataStr = localStorage.getItem(SESSIONS_DATA_KEY);
      if (!dataStr) return null;
      const data: Record<string, SessionData> = JSON.parse(dataStr);
      return data[id] || null;
    } catch (e) {
      return null;
    }
  }

  // localStorage에서 세션 데이터 삭제
  private removeCachedSessionData(id: string): void {
    try {
      const dataStr = localStorage.getItem(SESSIONS_DATA_KEY);
      if (!dataStr) return;
      const data: Record<string, SessionData> = JSON.parse(dataStr);
      delete data[id];
      localStorage.setItem(SESSIONS_DATA_KEY, JSON.stringify(data));

      // 세션 목록도 업데이트
      const sessions = this.getCachedSessionList().filter(s => s.id !== id);
      this.cacheSessionList(sessions);
    } catch (e) {
      console.warn('Failed to remove cached session:', e);
    }
  }

  // Load a specific session
  async loadSession(id: string): Promise<boolean> {
    this.cancelScheduledSave();
    let session: SessionData | null = null;

    // 서버에서 먼저 시도
    try {
      const response = await fetch(`${API_BASE}/sessions/${id}`, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        session = await response.json();
        this.isServerAvailable = true;

        // 서버에서 가져온 데이터를 캐시
        if (session) {
          this.cacheSessionData(session);
        }
      }
    } catch (error) {
      console.log('[SessionManager] 서버에서 세션 로드 실패, localStorage 시도');
      this.isServerAvailable = false;
    }

    // 서버 실패 시 localStorage에서 시도
    if (!session) {
      session = this.getCachedSessionData(id);
    }

    if (!session) {
      console.error('Session not found:', id);
      return false;
    }

    this.state.fromSessionData(session);

    // Update server about current session (if available)
    if (this.isServerAvailable) {
      try {
        await fetch(`${API_BASE}/session/current`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            sessionTitle: session.title
          })
        });
      } catch (e) {
        // 무시
      }
    }

    this.emit('sessionChange', session.id);
    return true;
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

      // 서버에 생성 시도
      let serverSuccess = false;
      try {
        const response = await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData),
          signal: AbortSignal.timeout(2000)
        });
        serverSuccess = response.ok;
        this.isServerAvailable = serverSuccess;
      } catch (e) {
        console.log('[SessionManager] 서버 연결 실패, localStorage에만 저장');
        this.isServerAvailable = false;
      }

      // localStorage에 캐시 (항상)
      this.cacheSessionData(sessionData);
      const cachedList = this.getCachedSessionList();
      cachedList.unshift({
        id: sessionData.id,
        title: sessionData.title,
        createdAt: sessionData.createdAt,
        lastSavedAt: sessionData.lastSavedAt
      });
      this.cacheSessionList(cachedList);

      // Update state with session metadata
      this.state.setSessionMetadata({
        id: sessionData.id,
        title: sessionData.title,
        createdAt: sessionData.createdAt,
        lastSavedAt: sessionData.lastSavedAt
      });

      this.emit('sessionChange', sessionData.id);
      this.emit('sessionListChange');
      return sessionData.id;
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

    const now = new Date().toISOString();
    const sessionData = this.state.toSessionJSON();
    sessionData.lastSavedAt = now;

    // 항상 localStorage에 저장
    this.cacheSessionData(sessionData);

    // 세션 목록의 lastSavedAt도 업데이트
    const cachedList = this.getCachedSessionList();
    const idx = cachedList.findIndex(s => s.id === sessionData.id);
    if (idx >= 0) {
      cachedList[idx].lastSavedAt = now;
      // 최근 저장된 세션을 맨 위로
      const [updated] = cachedList.splice(idx, 1);
      cachedList.unshift(updated);
      this.cacheSessionList(cachedList);
    }

    // 서버에도 저장 시도
    try {
      const response = await fetch(`${API_BASE}/sessions/${this.state.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
        signal: AbortSignal.timeout(3000)
      });
      this.isServerAvailable = response.ok;
    } catch (error) {
      console.log('[SessionManager] 서버 저장 실패, localStorage에만 저장됨');
      this.isServerAvailable = false;
    }

    this.state.setSessionMetadata({ lastSavedAt: now });
    this.emit('sessionSaved', this.state.sessionId);
    return true;
  }

  // Delete a session
  async deleteSession(id: string): Promise<boolean> {
    // localStorage에서 삭제
    this.removeCachedSessionData(id);

    // 서버에서도 삭제 시도
    try {
      await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(2000)
      });
    } catch (error) {
      console.log('[SessionManager] 서버 삭제 실패, localStorage에서만 삭제됨');
    }

    // If deleted session is current, create new session
    if (this.state.sessionId === id) {
      await this.createNewSession();
    }

    this.emit('sessionListChange');
    return true;
  }

  // Update session title
  async setTitle(title: string): Promise<boolean> {
    if (!this.state.sessionId) return false;

    this.state.setSessionMetadata({ title });

    // localStorage 업데이트
    const sessionData = this.state.toSessionJSON();
    this.cacheSessionData(sessionData);

    // 세션 목록도 업데이트
    const cachedList = this.getCachedSessionList();
    const idx = cachedList.findIndex(s => s.id === this.state.sessionId);
    if (idx >= 0) {
      cachedList[idx].title = title;
      this.cacheSessionList(cachedList);
    }

    // 서버에도 업데이트 시도
    try {
      await fetch(`${API_BASE}/sessions/${this.state.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
        signal: AbortSignal.timeout(2000)
      });
    } catch (error) {
      console.log('[SessionManager] 서버 제목 업데이트 실패');
    }

    this.emit('sessionTitleChange', title);
    this.emit('sessionListChange');
    return true;
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

      const sessionData = this.state.toSessionJSON();

      // localStorage에 저장
      this.cacheSessionData(sessionData);
      const cachedList = this.getCachedSessionList();
      cachedList.unshift({
        id: sessionId,
        title: title,
        createdAt: now,
        lastSavedAt: now
      });
      this.cacheSessionList(cachedList);

      // 서버에도 세션 생성 시도
      try {
        await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData),
          signal: AbortSignal.timeout(2000)
        });
      } catch (e) {
        console.warn('Failed to create session on server, saved locally');
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
