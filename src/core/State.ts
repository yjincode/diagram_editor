import { DiagramElement, Point, ToolType, ComponentData, ZoneData, ArrowData, NoteData, ScenarioData, AnchorPosition, SessionData } from '../types';
import { EventEmitter } from './EventEmitter';
import { History } from './History';

export class State extends EventEmitter {
  elements: Map<string, DiagramElement> = new Map();
  selectedIds: Set<string> = new Set();

  zoom = 1;
  pan: Point = { x: 50, y: 50 };
  canvasSize = { width: 1400, height: 900 };

  currentTool: ToolType = 'select';
  arrowEditMode = false;
  gridSnap = true;
  gridVisible = true;
  gridSize = 20;

  clipboard: DiagramElement[] = [];

  // Session metadata
  sessionId: string | null = null;
  sessionTitle: string = '';
  sessionCreatedAt: string = '';
  sessionLastSavedAt: string = '';

  private history: History;
  private idCounter = 0;

  constructor() {
    super();
    this.history = new History();
    this.history.on('change', () => this.emit('historyChange'));
  }

  // ID Generation
  generateId(prefix: string = 'el'): string {
    return `${prefix}_${++this.idCounter}_${Date.now().toString(36)}`;
  }

  // Element CRUD
  addElement(element: DiagramElement): void {
    this.elements.set(element.id, element);
    this.saveToHistory();
    this.emit('elementsChange');
  }

  updateElement(id: string, updates: Partial<DiagramElement>): void {
    const element = this.elements.get(id);
    if (!element) return;

    const updated = { ...element, ...updates } as DiagramElement;
    this.elements.set(id, updated);
    this.emit('elementsChange');
  }

  updateElementWithHistory(id: string, updates: Partial<DiagramElement>): void {
    this.updateElement(id, updates);
    this.saveToHistory();
  }

  deleteElement(id: string): void {
    // Also delete connected arrows
    if (this.elements.get(id)?.type !== 'arrow') {
      this.elements.forEach((el, elId) => {
        if (el.type === 'arrow' && (el.from === id || el.to === id)) {
          this.elements.delete(elId);
        }
      });
    }

    this.elements.delete(id);
    this.selectedIds.delete(id);
    this.saveToHistory();
    this.emit('elementsChange');
    this.emit('selectionChange');
  }

  deleteSelected(): void {
    if (this.selectedIds.size === 0) return;

    const toDelete = new Set(this.selectedIds);

    // Find arrows connected to selected elements
    this.elements.forEach((el, id) => {
      if (el.type === 'arrow') {
        if (toDelete.has(el.from) || toDelete.has(el.to)) {
          toDelete.add(id);
        }
      }
    });

    toDelete.forEach(id => this.elements.delete(id));
    this.selectedIds.clear();
    this.saveToHistory();
    this.emit('elementsChange');
    this.emit('selectionChange');
  }

  getElement(id: string): DiagramElement | undefined {
    return this.elements.get(id);
  }

  // Selection
  select(id: string, addToSelection = false): void {
    if (!addToSelection) {
      this.selectedIds.clear();
    }
    this.selectedIds.add(id);
    this.emit('selectionChange');
  }

  deselect(id: string): void {
    this.selectedIds.delete(id);
    this.emit('selectionChange');
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.emit('selectionChange');
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.emit('selectionChange');
  }

  selectInRect(x: number, y: number, width: number, height: number, addToSelection = false): void {
    if (!addToSelection) {
      this.selectedIds.clear();
    }

    const rect = {
      left: Math.min(x, x + width),
      right: Math.max(x, x + width),
      top: Math.min(y, y + height),
      bottom: Math.max(y, y + height)
    };

    this.elements.forEach((el, id) => {
      if (el.type === 'arrow') return;

      const elRect = this.getElementBounds(el);
      if (!elRect) return;

      // Check intersection
      if (elRect.left < rect.right && elRect.right > rect.left &&
          elRect.top < rect.bottom && elRect.bottom > rect.top) {
        this.selectedIds.add(id);
      }
    });

    this.emit('selectionChange');
  }

  // Select all arrows only
  selectAllArrows(): void {
    this.selectedIds.clear();
    this.elements.forEach((el, id) => {
      if (el.type === 'arrow') {
        this.selectedIds.add(id);
      }
    });
    this.emit('selectionChange');
  }

  // Select arrows connected to an element
  selectArrowsConnectedTo(elementId: string): void {
    this.selectedIds.clear();
    this.elements.forEach((el, id) => {
      if (el.type === 'arrow') {
        if (el.from === elementId || el.to === elementId) {
          this.selectedIds.add(id);
        }
      }
    });
    this.emit('selectionChange');
  }

  // Toggle arrow edit mode
  toggleArrowEditMode(): void {
    this.arrowEditMode = !this.arrowEditMode;
    if (!this.arrowEditMode) {
      // 모드 종료 시 화살표만 선택 해제
      this.selectedIds.forEach(id => {
        const el = this.elements.get(id);
        if (el?.type === 'arrow') {
          this.selectedIds.delete(id);
        }
      });
    }
    this.emit('arrowEditModeChange');
    this.emit('selectionChange');
  }

  // Select elements by type
  selectByType(type: string): void {
    this.selectedIds.clear();
    this.elements.forEach((el, id) => {
      if (el.type === type) {
        this.selectedIds.add(id);
      }
    });
    this.emit('selectionChange');
  }

  // Update arrow anchor
  updateArrowAnchor(arrowId: string, endpoint: 'from' | 'to', newTargetId: string, newAnchor: AnchorPosition): void {
    const arrow = this.elements.get(arrowId);
    if (!arrow || arrow.type !== 'arrow') return;

    if (endpoint === 'from') {
      this.updateElement(arrowId, { from: newTargetId, fromAnchor: newAnchor });
    } else {
      this.updateElement(arrowId, { to: newTargetId, toAnchor: newAnchor });
    }
  }

  getElementBounds(element: DiagramElement): { left: number; right: number; top: number; bottom: number } | null {
    if (element.type === 'arrow') return null;

    const el = element as ComponentData | ZoneData | NoteData | ScenarioData;
    let width = 100;
    let height = 80;

    switch (element.type) {
      case 'zone':
        width = (element as ZoneData).width;
        height = (element as ZoneData).height;
        break;
      case 'component':
        width = (element as ComponentData).width ?? 100;
        height = (element as ComponentData).height ?? 80;
        break;
      case 'note':
        width = (element as NoteData).width ?? 150;
        height = (element as NoteData).height ?? 100;
        break;
      case 'scenario':
        width = (element as ScenarioData).width ?? 160;
        height = (element as ScenarioData).height ?? 100;
        break;
    }

    return {
      left: el.x,
      right: el.x + width,
      top: el.y,
      bottom: el.y + height
    };
  }

  // Move elements
  moveSelected(dx: number, dy: number): void {
    this.selectedIds.forEach(id => {
      const el = this.elements.get(id);
      if (!el || el.type === 'arrow') return;

      const element = el as ComponentData | ZoneData | NoteData | ScenarioData;
      let newX = element.x + dx;
      let newY = element.y + dy;

      if (this.gridSnap) {
        newX = Math.round(newX / this.gridSize) * this.gridSize;
        newY = Math.round(newY / this.gridSize) * this.gridSize;
      }

      this.updateElement(id, { x: newX, y: newY });
    });
  }

  // Copy/Paste
  copySelected(): void {
    this.clipboard = [];
    this.selectedIds.forEach(id => {
      const el = this.elements.get(id);
      if (el) {
        this.clipboard.push(this.cloneElement(el));
      }
    });
  }

  paste(): void {
    if (this.clipboard.length === 0) return;

    this.clearSelection();
    const offset = 20;

    this.clipboard.forEach(el => {
      const newElement = this.cloneElement(el);
      newElement.id = this.generateId(el.type);

      if (newElement.type !== 'arrow') {
        (newElement as ComponentData | ZoneData | NoteData | ScenarioData).x += offset;
        (newElement as ComponentData | ZoneData | NoteData | ScenarioData).y += offset;
      }

      this.elements.set(newElement.id, newElement);
      this.selectedIds.add(newElement.id);
    });

    this.saveToHistory();
    this.emit('elementsChange');
    this.emit('selectionChange');
  }

  private cloneElement(element: DiagramElement): DiagramElement {
    if (element.type === 'arrow') {
      return {
        ...element,
        waypoints: element.waypoints.map(p => ({ ...p }))
      };
    }
    return { ...element };
  }

  // History
  saveToHistory(): void {
    this.history.push(this.elements);
  }

  undo(): void {
    const elements = this.history.undo();
    if (elements) {
      this.elements = elements;
      this.clearSelection();
      this.emit('elementsChange');
    }
  }

  redo(): void {
    const elements = this.history.redo();
    if (elements) {
      this.elements = elements;
      this.clearSelection();
      this.emit('elementsChange');
    }
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  // Tool
  setTool(tool: ToolType): void {
    this.currentTool = tool;
    this.emit('toolChange');
  }

  // Zoom/Pan
  setZoom(zoom: number, center?: Point): void {
    const oldZoom = this.zoom;
    this.zoom = Math.max(0.25, Math.min(3, zoom));

    if (center) {
      // Adjust pan to zoom towards center point
      const scale = this.zoom / oldZoom;
      this.pan.x = center.x - (center.x - this.pan.x) * scale;
      this.pan.y = center.y - (center.y - this.pan.y) * scale;
    }

    this.emit('viewChange');
  }

  setPan(x: number, y: number): void {
    this.pan.x = x;
    this.pan.y = y;
    this.emit('viewChange');
  }

  // Grid
  toggleGridSnap(): void {
    this.gridSnap = !this.gridSnap;
    this.emit('gridChange');
  }

  toggleGridVisible(): void {
    this.gridVisible = !this.gridVisible;
    this.emit('gridChange');
  }

  // Serialization
  toJSON(): string {
    const data = {
      elements: Array.from(this.elements.values()),
      canvasSize: this.canvasSize
    };
    return JSON.stringify(data, null, 2);
  }

  // JSON 검증만 수행 (에러 메시지 반환)
  validateJSON(json: string): { valid: boolean; error?: string; line?: number; column?: number } {
    try {
      const data = JSON.parse(json);

      // 기본 구조 검증
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'JSON must be an object' };
      }

      if (!Array.isArray(data.elements)) {
        return { valid: false, error: 'Missing or invalid "elements" array' };
      }

      // 각 요소 검증
      for (let i = 0; i < data.elements.length; i++) {
        const el = data.elements[i];
        if (!el.id) {
          return { valid: false, error: `Element at index ${i} is missing "id"` };
        }
        if (!el.type) {
          return { valid: false, error: `Element "${el.id}" is missing "type"` };
        }
        if (!['zone', 'component', 'arrow', 'note', 'scenario'].includes(el.type)) {
          return { valid: false, error: `Element "${el.id}" has invalid type "${el.type}"` };
        }

        // 타입별 필수 필드 검증
        if (el.type === 'arrow') {
          if (!el.from) return { valid: false, error: `Arrow "${el.id}" is missing "from"` };
          if (!el.to) return { valid: false, error: `Arrow "${el.id}" is missing "to"` };
        } else {
          if (typeof el.x !== 'number') return { valid: false, error: `Element "${el.id}" is missing or invalid "x"` };
          if (typeof el.y !== 'number') return { valid: false, error: `Element "${el.id}" is missing or invalid "y"` };
        }
      }

      return { valid: true };
    } catch (e) {
      const error = e as SyntaxError;
      // JSON 파싱 에러에서 위치 정보 추출 시도
      const match = error.message.match(/position (\d+)/);
      if (match) {
        const position = parseInt(match[1]);
        const { line, column } = this.getLineColumn(json, position);
        return { valid: false, error: error.message, line, column };
      }
      return { valid: false, error: error.message };
    }
  }

  // 문자열 위치에서 줄/열 번호 계산
  private getLineColumn(str: string, position: number): { line: number; column: number } {
    const lines = str.substring(0, position).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }

  fromJSON(json: string): { success: boolean; error?: string } {
    const validation = this.validateJSON(json);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const data = JSON.parse(json);
      this.elements.clear();

      if (Array.isArray(data.elements)) {
        data.elements.forEach((el: DiagramElement) => {
          this.elements.set(el.id, el);
        });
      }

      if (data.canvasSize) {
        this.canvasSize = data.canvasSize;
      }

      // 요소가 캔버스 밖에 있으면 캔버스 자동 확장
      this.expandCanvasToFitElements();

      this.clearSelection();
      this.saveToHistory();
      this.emit('elementsChange');
      return { success: true };
    } catch (e) {
      const error = e as Error;
      console.error('Failed to parse JSON:', error);
      return { success: false, error: error.message };
    }
  }

  // 모든 요소를 포함하도록 캔버스 크기 확장
  expandCanvasToFitElements(): void {
    let maxRight = this.canvasSize.width;
    let maxBottom = this.canvasSize.height;
    const padding = 100; // 여유 공간

    this.elements.forEach(el => {
      if (el.type === 'arrow') return; // 화살표는 제외

      const width = (el as any).width || 100;
      const height = (el as any).height || 80;
      const right = el.x + width + padding;
      const bottom = el.y + height + padding;

      if (right > maxRight) maxRight = right;
      if (bottom > maxBottom) maxBottom = bottom;
    });

    // 캔버스가 확장되어야 하면 업데이트
    if (maxRight > this.canvasSize.width || maxBottom > this.canvasSize.height) {
      this.canvasSize = {
        width: Math.max(this.canvasSize.width, maxRight),
        height: Math.max(this.canvasSize.height, maxBottom)
      };
      this.emit('canvasSizeChange');
    }
  }

  // Calculate component size based on text content
  calculateComponentSize(name: string, sub?: string, fontSize = 14): { width: number; height: number } {
    // Approximate character width based on font size
    const charWidth = fontSize * 0.6;
    const lineHeight = fontSize * 1.4;

    // Max characters per line (to keep name within 2 lines)
    const maxCharsPerLine = 20;
    const horizontalPadding = 60; // More padding on sides

    // Calculate name lines (split if too long)
    const nameLines = Math.ceil(name.length / maxCharsPerLine);
    const effectiveNameLength = Math.min(name.length, maxCharsPerLine);
    const nameWidth = effectiveNameLength * charWidth;

    // Calculate subtitle width
    const subWidth = sub ? Math.min(sub.length, maxCharsPerLine) * charWidth * 0.85 : 0;

    // Width: max of name and sub, plus generous padding
    const contentWidth = Math.max(nameWidth, subWidth);
    const width = Math.max(100, contentWidth + horizontalPadding);

    // Height: padding + name lines + optional sub + extra space
    let height = 60; // increased base padding
    height += lineHeight * nameLines; // name (possibly multi-line)
    if (sub) height += lineHeight * 0.85; // subtitle
    height = Math.max(80, height);

    // Round to grid if enabled
    return {
      width: this.gridSnap ? Math.ceil(width / this.gridSize) * this.gridSize : Math.ceil(width),
      height: this.gridSnap ? Math.ceil(height / this.gridSize) * this.gridSize : Math.ceil(height)
    };
  }

  // Factory methods for creating elements
  createComponent(x: number, y: number, name = 'Component', icon = '', sub?: string, fontSize = 14): ComponentData {
    const size = this.calculateComponentSize(name, sub, fontSize);
    return {
      id: this.generateId('comp'),
      type: 'component',
      x: this.gridSnap ? Math.round(x / this.gridSize) * this.gridSize : x,
      y: this.gridSnap ? Math.round(y / this.gridSize) * this.gridSize : y,
      name,
      icon,
      color: '#2196f3',
      opacity: 1,
      width: size.width,
      height: size.height,
      shape: 'rectangle',
      sub,
      fontSize
    };
  }

  createZone(x: number, y: number): ZoneData {
    // Zone은 항상 가장 뒷단에 배치 (음수 zIndex)
    const minZ = this.getMinZIndex();
    return {
      id: this.generateId('zone'),
      type: 'zone',
      x: this.gridSnap ? Math.round(x / this.gridSize) * this.gridSize : x,
      y: this.gridSnap ? Math.round(y / this.gridSize) * this.gridSize : y,
      width: 200,
      height: 150,
      label: 'Zone',
      color: '#2196f3',
      opacity: 1,
      zIndex: minZ - 1
    };
  }

  createArrow(from: string, fromAnchor: string, to: string, toAnchor: string): ArrowData {
    return {
      id: this.generateId('arrow'),
      type: 'arrow',
      from,
      fromAnchor: fromAnchor as ArrowData['fromAnchor'],
      to,
      toAnchor: toAnchor as ArrowData['toAnchor'],
      waypoints: [],
      label: '',
      color: '#2196f3',
      style: 'solid',
      opacity: 1
    };
  }

  createNote(x: number, y: number): NoteData {
    return {
      id: this.generateId('note'),
      type: 'note',
      x: this.gridSnap ? Math.round(x / this.gridSize) * this.gridSize : x,
      y: this.gridSnap ? Math.round(y / this.gridSize) * this.gridSize : y,
      title: 'Note',
      text: 'Enter text here...',
      opacity: 1,
      width: 150,
      height: 100
    };
  }

  createScenario(x: number, y: number): ScenarioData {
    return {
      id: this.generateId('scenario'),
      type: 'scenario',
      x: this.gridSnap ? Math.round(x / this.gridSize) * this.gridSize : x,
      y: this.gridSnap ? Math.round(y / this.gridSize) * this.gridSize : y,
      title: 'Scenario',
      subtitle: 'Description',
      desc: 'Details',
      color: '#667eea',
      opacity: 1,
      width: 160,
      height: 100
    };
  }

  // Z-Index 관리 (앞으로/뒤로 보내기)
  private getMaxZIndex(): number {
    let max = 0;
    this.elements.forEach(el => {
      const z = (el as any).zIndex || 0;
      if (z > max) max = z;
    });
    return max;
  }

  private getMinZIndex(): number {
    let min = 0;
    this.elements.forEach(el => {
      const z = (el as any).zIndex || 0;
      if (z < min) min = z;
    });
    return min;
  }

  bringForward(id: string): void {
    const element = this.elements.get(id);
    if (!element) return;
    const currentZ = (element as any).zIndex || 0;
    this.updateElementWithHistory(id, { zIndex: currentZ + 1 });
  }

  sendBackward(id: string): void {
    const element = this.elements.get(id);
    if (!element) return;
    const currentZ = (element as any).zIndex || 0;
    this.updateElementWithHistory(id, { zIndex: currentZ - 1 });
  }

  bringToFront(id: string): void {
    const maxZ = this.getMaxZIndex();
    this.updateElementWithHistory(id, { zIndex: maxZ + 1 });
  }

  sendToBack(id: string): void {
    const minZ = this.getMinZIndex();
    this.updateElementWithHistory(id, { zIndex: minZ - 1 });
  }

  // ========== Session Methods ==========

  // Set session metadata
  setSessionMetadata(metadata: Partial<{
    id: string | null;
    title: string;
    createdAt: string;
    lastSavedAt: string;
  }>): void {
    if (metadata.id !== undefined) this.sessionId = metadata.id;
    if (metadata.title !== undefined) this.sessionTitle = metadata.title;
    if (metadata.createdAt !== undefined) this.sessionCreatedAt = metadata.createdAt;
    if (metadata.lastSavedAt !== undefined) this.sessionLastSavedAt = metadata.lastSavedAt;
    this.emit('sessionMetadataChange');
  }

  // Convert current state to session data
  toSessionJSON(): SessionData {
    return {
      id: this.sessionId || '',
      title: this.sessionTitle,
      createdAt: this.sessionCreatedAt,
      lastSavedAt: this.sessionLastSavedAt,
      elements: Array.from(this.elements.values()),
      canvasSize: this.canvasSize
    };
  }

  // Load session data into state
  fromSessionData(session: SessionData): void {
    this.sessionId = session.id;
    this.sessionTitle = session.title;
    this.sessionCreatedAt = session.createdAt;
    this.sessionLastSavedAt = session.lastSavedAt;

    this.elements.clear();
    session.elements.forEach(el => this.elements.set(el.id, el));
    this.canvasSize = session.canvasSize;

    this.clearSelection();
    this.expandCanvasToFitElements();
    this.saveToHistory();
    this.emit('elementsChange');
    this.emit('sessionMetadataChange');
  }

  // Clear state for new session
  clearForNewSession(): void {
    this.elements.clear();
    this.selectedIds.clear();
    this.canvasSize = { width: 1400, height: 900 };
    this.sessionId = null;
    this.sessionTitle = '';
    this.sessionCreatedAt = '';
    this.sessionLastSavedAt = '';
    this.history = new History();
    this.saveToHistory();
    this.emit('elementsChange');
    this.emit('selectionChange');
    this.emit('sessionMetadataChange');
  }
}
