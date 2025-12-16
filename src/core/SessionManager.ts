import { State } from './State';
import { EventEmitter } from './EventEmitter';
import { SessionData, SessionListItem } from '../types';
import { t } from '../i18n';

// Use relative URL - works with Vite dev server directly
const API_BASE = '/api';
const SESSIONS_CACHE_KEY = 'diagram-editor-sessions';
const SESSIONS_DATA_KEY = 'diagram-editor-session-data';

export class SessionManager extends EventEmitter {
  private state: State;
  private autoSaveInterval: number | null = null;
  private readonly AUTO_SAVE_INTERVAL_MS = 30000; // 30초마다 로컬스토리지 저장
  private isServerAvailable = false;
  private isDirty = false; // 변경사항 추적
  private saveDebounceTimer: number | null = null;
  private readonly SAVE_DEBOUNCE_MS = 1500; // 1.5초 debounce

  constructor(state: State) {
    super();
    this.state = state;
    this.bindStateEvents();
    this.bindWindowEvents();
    this.startAutoSaveInterval();
  }

  private bindStateEvents(): void {
    // 요소 변경 시 dirty 플래그 설정 및 로컬스토리지에만 저장 (debounce 적용)
    this.state.on('elementsChange', () => {
      if (this.state.sessionId && this.hasElements()) {
        this.isDirty = true;
        this.debouncedSaveToLocalStorage();
      }
    });
  }

  private debouncedSaveToLocalStorage(): void {
    // 기존 타이머 취소
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
    }
    // 새 타이머 설정 (1.5초 후 저장)
    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveToLocalStorage();
      this.saveDebounceTimer = null;
    }, this.SAVE_DEBOUNCE_MS);
  }

  private bindWindowEvents(): void {
    // 페이지 떠날 때 서버에 저장
    window.addEventListener('beforeunload', () => {
      // pending debounce가 있으면 즉시 저장
      if (this.saveDebounceTimer !== null) {
        window.clearTimeout(this.saveDebounceTimer);
        this.saveToLocalStorage();
      }
      if (this.hasElements() && this.isDirty) {
        this.saveToServerSync();
      }
    });

    // 탭 숨김 시 서버에 저장
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.sessionId && this.hasElements() && this.isDirty) {
        this.saveToServer();
      }
    });
  }

  private startAutoSaveInterval(): void {
    this.autoSaveInterval = window.setInterval(() => {
      if (this.state.sessionId && this.hasElements()) {
        this.saveToLocalStorage();
      }
    }, this.AUTO_SAVE_INTERVAL_MS);
  }

  destroy(): void {
    if (this.autoSaveInterval !== null) {
      window.clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
  }

  private hasElements(): boolean {
    return this.state.elements.size > 0;
  }

  // 로컬스토리지에만 저장 (빠른 캐시)
  private saveToLocalStorage(): void {
    if (!this.state.sessionId) return;

    const sessionData = this.state.toSessionJSON();
    sessionData.lastSavedAt = new Date().toISOString();

    this.cacheSessionData(sessionData);
    console.log('[캐시저장됨] 세션:', sessionData.id, '요소:', sessionData.elements.length, '개');
  }

  // 서버에 저장 (세션 전환 시)
  private async saveToServer(): Promise<void> {
    if (!this.state.sessionId || !this.hasElements()) return;

    const sessionData = this.state.toSessionJSON();
    sessionData.lastSavedAt = new Date().toISOString();

    try {
      const response = await fetch(`${API_BASE}/sessions/${this.state.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        this.isDirty = false;
        console.log('[서버저장됨] 세션:', sessionData.id);
      }
    } catch (error) {
      // 서버 저장 실패 - 로컬스토리지에는 이미 저장됨
    }
  }

  // 동기적 서버 저장 (beforeunload용)
  private saveToServerSync(): void {
    if (!this.state.sessionId || !this.hasElements()) return;

    const sessionData = this.state.toSessionJSON();
    sessionData.lastSavedAt = new Date().toISOString();

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${API_BASE}/sessions/${this.state.sessionId}`, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(sessionData));
  }

  getDefaultTitle(): string {
    return t('newDiagramTitle');
  }

  private generateSessionId(): string {
    return `session_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 세션 목록 가져오기 (서버 -> 로컬스토리지 순, lastSavedAt 기준 정렬)
  async getSessionList(): Promise<SessionListItem[]> {
    let sessions: SessionListItem[] = [];

    try {
      const response = await fetch(`${API_BASE}/sessions`, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        sessions = await response.json();
        this.isServerAvailable = true;
        this.cacheSessionList(sessions);
      } else {
        throw new Error('Server error');
      }
    } catch (error) {
      this.isServerAvailable = false;
      sessions = this.getCachedSessionList();
    }

    // lastSavedAt 기준으로 정렬 (최신순)
    sessions.sort((a, b) => {
      const dateA = new Date(a.lastSavedAt || a.createdAt).getTime();
      const dateB = new Date(b.lastSavedAt || b.createdAt).getTime();
      return dateB - dateA;
    });

    return sessions;
  }

  private cacheSessionList(sessions: SessionListItem[]): void {
    try {
      localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Failed to cache session list:', e);
    }
  }

  private getCachedSessionList(): SessionListItem[] {
    try {
      const cached = localStorage.getItem(SESSIONS_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  }

  private cacheSessionData(session: SessionData): void {
    try {
      const dataStr = localStorage.getItem(SESSIONS_DATA_KEY);
      const data: Record<string, SessionData> = dataStr ? JSON.parse(dataStr) : {};
      data[session.id] = session;
      localStorage.setItem(SESSIONS_DATA_KEY, JSON.stringify(data));

      // 세션 목록의 lastSavedAt도 업데이트
      const cachedList = this.getCachedSessionList();
      const idx = cachedList.findIndex(s => s.id === session.id);
      if (idx >= 0) {
        cachedList[idx].lastSavedAt = session.lastSavedAt;
        cachedList[idx].title = session.title;
      }
      this.cacheSessionList(cachedList);
    } catch (e) {
      console.warn('Failed to cache session data:', e);
    }
  }

  // 외부 호출용 - MCP 웹소켓에서 데이터 수신 시
  saveReceivedDataToCache(): void {
    if (!this.state.sessionId || this.state.elements.size === 0) return;

    const now = new Date().toISOString();
    const sessionData = this.state.toSessionJSON();
    sessionData.lastSavedAt = now;

    this.cacheSessionData(sessionData);
    this.isDirty = true;

    // 새 세션이면 목록에도 추가
    const cachedList = this.getCachedSessionList();
    if (!cachedList.find(s => s.id === sessionData.id)) {
      cachedList.push({
        id: sessionData.id,
        title: sessionData.title,
        createdAt: sessionData.createdAt || now,
        lastSavedAt: now
      });
      this.cacheSessionList(cachedList);
    }

    console.log('[캐시저장됨] 세션:', sessionData.id, '요소:', sessionData.elements.length, '개');
  }

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

  private removeCachedSessionData(id: string): void {
    try {
      // 세션 데이터 삭제
      const dataStr = localStorage.getItem(SESSIONS_DATA_KEY);
      if (dataStr) {
        const data: Record<string, SessionData> = JSON.parse(dataStr);
        delete data[id];
        localStorage.setItem(SESSIONS_DATA_KEY, JSON.stringify(data));
      }

      // 세션 목록에서도 삭제
      const sessions = this.getCachedSessionList().filter(s => s.id !== id);
      this.cacheSessionList(sessions);
    } catch (e) {
      console.warn('Failed to remove cached session:', e);
    }
  }

  // 세션 로드 (다른 세션으로 전환)
  async loadSession(id: string): Promise<boolean> {
    // 현재 세션에 변경사항이 있으면 서버에 저장
    if (this.state.sessionId && this.state.sessionId !== id && this.hasElements() && this.isDirty) {
      await this.saveToServer();
    }

    let session: SessionData | null = null;

    // 서버에서 먼저 시도
    try {
      const response = await fetch(`${API_BASE}/sessions/${id}`, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        session = await response.json();
        this.isServerAvailable = true;
        if (session) {
          this.cacheSessionData(session);
        }
      }
    } catch (error) {
      this.isServerAvailable = false;
    }

    // 서버 실패 시 로컬스토리지에서 시도
    if (!session) {
      session = this.getCachedSessionData(id);
    }

    if (!session) {
      console.error('Session not found:', id);
      return false;
    }

    this.state.fromSessionData(session);
    this.isDirty = false;

    // 서버에 현재 세션 정보 업데이트
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

  // 새 세션 생성
  async createNewSession(): Promise<string | null> {
    try {
      // 현재 세션에 변경사항이 있으면 서버에 저장
      if (this.state.sessionId && this.hasElements() && this.isDirty) {
        await this.saveToServer();
      }

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
      try {
        const response = await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData),
          signal: AbortSignal.timeout(2000)
        });
        this.isServerAvailable = response.ok;
      } catch (e) {
        this.isServerAvailable = false;
      }

      // 로컬스토리지에 저장
      this.cacheSessionData(sessionData);
      const cachedList = this.getCachedSessionList();
      cachedList.unshift({
        id: sessionData.id,
        title: sessionData.title,
        createdAt: sessionData.createdAt,
        lastSavedAt: sessionData.lastSavedAt
      });
      this.cacheSessionList(cachedList);

      this.state.setSessionMetadata({
        id: sessionData.id,
        title: sessionData.title,
        createdAt: sessionData.createdAt,
        lastSavedAt: sessionData.lastSavedAt
      });

      this.isDirty = false;
      this.emit('sessionChange', sessionData.id);
      this.emit('sessionListChange');
      return sessionData.id;
    } catch (error) {
      console.error('Failed to create new session:', error);
      return null;
    }
  }

  // 현재 세션 저장 (수동 저장 - 서버에 바로 저장)
  async saveCurrentSession(): Promise<boolean> {
    if (!this.state.sessionId) {
      const newId = await this.createNewSession();
      return newId !== null;
    }

    this.saveToLocalStorage();
    await this.saveToServer();
    return true;
  }

  // 세션 삭제
  async deleteSession(id: string): Promise<boolean> {
    // 로컬스토리지에서 삭제
    this.removeCachedSessionData(id);

    // 서버에서도 삭제
    try {
      await fetch(`${API_BASE}/sessions/${id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(2000)
      });
    } catch (error) {
      // 서버 삭제 실패해도 계속 진행
    }

    // 삭제된 세션이 현재 세션이면 새 세션 생성
    if (this.state.sessionId === id) {
      await this.createNewSession();
    }

    this.emit('sessionListChange');
    return true;
  }

  // 세션 제목 변경
  async setTitle(id: string, title: string): Promise<boolean> {
    // 로컬스토리지 업데이트
    const sessionData = this.getCachedSessionData(id);
    if (sessionData) {
      sessionData.title = title;
      this.cacheSessionData(sessionData);
    }

    // 세션 목록 업데이트
    const cachedList = this.getCachedSessionList();
    const idx = cachedList.findIndex(s => s.id === id);
    if (idx >= 0) {
      cachedList[idx].title = title;
      this.cacheSessionList(cachedList);
    }

    // 현재 세션이면 state도 업데이트
    if (this.state.sessionId === id) {
      this.state.setSessionMetadata({ title });
    }

    // 서버에도 업데이트
    try {
      if (sessionData) {
        await fetch(`${API_BASE}/sessions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData),
          signal: AbortSignal.timeout(2000)
        });
      }
    } catch (error) {
      // 서버 업데이트 실패 무시
    }

    this.emit('sessionTitleChange', title);
    // sessionListChange는 발생시키지 않음 - loadSessions()가 서버에서 이전 데이터 가져올 수 있음
    return true;
  }

  get currentSessionId(): string | null {
    return this.state.sessionId;
  }

  get currentSessionTitle(): string {
    return this.state.sessionTitle;
  }

  async initialize(): Promise<void> {
    const sessions = await this.getSessionList();

    if (sessions.length > 0) {
      await this.loadSession(sessions[0].id);
    } else {
      if (this.state.elements.size > 0) {
        await this.createSessionForExistingData();
      } else {
        await this.createNewSession();
      }
    }
  }

  private async createSessionForExistingData(): Promise<string | null> {
    try {
      const now = new Date().toISOString();
      const sessionId = this.generateSessionId();
      const title = this.getDefaultTitle();

      this.state.setSessionMetadata({
        id: sessionId,
        title: title,
        createdAt: now,
        lastSavedAt: now
      });

      const sessionData = this.state.toSessionJSON();

      this.cacheSessionData(sessionData);
      const cachedList = this.getCachedSessionList();
      cachedList.unshift({
        id: sessionId,
        title: title,
        createdAt: now,
        lastSavedAt: now
      });
      this.cacheSessionList(cachedList);

      try {
        await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData),
          signal: AbortSignal.timeout(2000)
        });
      } catch (e) {
        // 서버 저장 실패 무시
      }

      this.isDirty = false;
      this.emit('sessionChange', sessionId);
      this.emit('sessionListChange');
      return sessionId;
    } catch (error) {
      console.error('Failed to create session for existing data:', error);
      return null;
    }
  }
}
