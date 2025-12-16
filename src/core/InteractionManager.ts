import { State } from './State';
import { Canvas } from './Canvas';
import { Point, AnchorPosition, ArrowData, ComponentData, ZoneData, NoteData, ScenarioData } from '../types';

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startPan: Point;
  elementStartPositions: Map<string, Point>;
  arrowWaypointsStart: Map<string, Point[]>;  // 화살표별 waypoints 시작 위치
  resizingZone: string | null;
  resizingElement: string | null;
  resizeStartSize: { width: number; height: number } | null;
  resizeStartPos: { x: number; y: number } | null;
  resizeDirection: 'br' | 'tl' | null;  // br=bottom-right, tl=top-left
  draggingWaypoint: { arrowId: string; index: number } | null;
  draggingEndpoint: { arrowId: string; endpoint: 'from' | 'to' } | null;
  resizingCanvas: 'right' | 'bottom' | 'corner' | null;
  canvasStartSize: { width: number; height: number } | null;
}

interface ArrowDrawState {
  isDrawing: boolean;
  fromId: string | null;
  fromAnchor: AnchorPosition | null;
}

interface SelectionBoxState {
  isSelecting: boolean;
  startX: number;
  startY: number;
  addToSelection: boolean;
}

export class InteractionManager {
  private state: State;
  private canvas: Canvas;

  private dragState: DragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startPan: { x: 0, y: 0 },
    elementStartPositions: new Map(),
    arrowWaypointsStart: new Map(),
    resizingZone: null,
    resizingElement: null,
    resizeStartSize: null,
    resizeStartPos: null,
    resizeDirection: null,
    draggingWaypoint: null,
    draggingEndpoint: null,
    resizingCanvas: null,
    canvasStartSize: null
  };

  private arrowDrawState: ArrowDrawState = {
    isDrawing: false,
    fromId: null,
    fromAnchor: null
  };

  private selectionBoxState: SelectionBoxState = {
    isSelecting: false,
    startX: 0,
    startY: 0,
    addToSelection: false
  };

  private isPanning = false;
  private lastArrowClick: { arrowId: string; time: number; x: number; y: number } | null = null;

  constructor(state: State, canvas: Canvas) {
    this.state = state;
    this.canvas = canvas;
    this.bindEvents();
    this.updatePanToolCursor();
  }

  private bindEvents(): void {
    const container = this.canvas.getContainer();
    const canvasEl = this.canvas.getCanvas();
    const svgLayer = this.canvas.getSvgLayer();
    const svgOverlay = this.canvas.getSvgOverlay();

    // Mouse events
    container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // Wheel for zoom
    container.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Context menu
    canvasEl.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Double click for editing
    canvasEl.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // SVG click for arrow selection
    svgLayer.addEventListener('click', this.handleSvgClick.bind(this));
    svgOverlay.addEventListener('click', this.handleSvgClick.bind(this));

    // Overlay mousedown for endpoint dragging
    svgOverlay.addEventListener('mousedown', this.handleMouseDown.bind(this));

    // Overlay double click for waypoint deletion
    svgOverlay.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // Tool change event
    this.state.on('toolChange', () => this.updatePanToolCursor());
  }

  private updatePanToolCursor(): void {
    const canvasEl = this.canvas.getCanvas();
    canvasEl.classList.toggle('pan-tool', this.state.currentTool === 'pan');
  }

  private setPanningCursor(panning: boolean): void {
    const canvasEl = this.canvas.getCanvas();
    canvasEl.classList.toggle('panning', panning);
  }

  private handleMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement | SVGElement;
    const canvasPoint = this.canvas.screenToCanvas(e.clientX, e.clientY);

    // Middle mouse button or space + left click for panning
    if (e.button === 1 || (e.button === 0 && this.state.currentTool === 'pan')) {
      this.startPanning(e);
      return;
    }

    // Check for arrow endpoint drag (for reconnecting arrows)
    if (target.classList.contains('arrow-endpoint')) {
      this.startEndpointDrag(target as SVGElement, e);
      return;
    }

    // Check for waypoint drag
    if (target.classList.contains('waypoint')) {
      this.startWaypointDrag(target as SVGElement, e);
      return;
    }

    // Check for arrow hit area click (in arrow edit mode)
    if (target.classList.contains('arrow-hit-area')) {
      const arrowId = target.getAttribute('data-id');
      if (arrowId) {
        if (e.shiftKey) {
          this.state.toggleSelection(arrowId);
        } else {
          this.state.select(arrowId);
        }
      }
      return;
    }

    // In arrow edit mode, prioritize arrow selection over other elements
    if (this.state.arrowEditMode) {
      // Check for endpoint drag first (for reconnecting)
      const endpointAtPoint = this.findEndpointAtPoint(e.clientX, e.clientY);
      if (endpointAtPoint) {
        this.dragState.draggingEndpoint = endpointAtPoint;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;
        this.state.select(endpointAtPoint.arrowId);
        return;
      }

      // Check for waypoint drag
      const waypointAtPoint = this.findWaypointAtPoint(e.clientX, e.clientY);
      if (waypointAtPoint) {
        this.dragState.draggingWaypoint = waypointAtPoint;
        this.dragState.startX = e.clientX;
        this.dragState.startY = e.clientY;
        return;
      }

      const arrowAtPoint = this.findArrowAtPoint(e.clientX, e.clientY);
      if (arrowAtPoint) {
        // Check for double-click to add waypoint
        if (this.lastArrowClick &&
            this.lastArrowClick.arrowId === arrowAtPoint &&
            Date.now() - this.lastArrowClick.time < 400 &&
            Math.abs(e.clientX - this.lastArrowClick.x) < 10 &&
            Math.abs(e.clientY - this.lastArrowClick.y) < 10) {
          // Double-click detected - add waypoint
          this.addWaypointToArrow(arrowAtPoint, e);
          this.lastArrowClick = null;
          return;
        }

        if (e.shiftKey) {
          this.state.toggleSelection(arrowAtPoint);
        } else {
          this.state.select(arrowAtPoint);
        }
        // Store for potential double-click waypoint creation
        this.lastArrowClick = { arrowId: arrowAtPoint, time: Date.now(), x: e.clientX, y: e.clientY };
        return;
      }
    }

    // Check for anchor click (arrow creation)
    if ((target as HTMLElement).classList.contains('anchor')) {
      this.startArrowDraw(target as HTMLElement);
      return;
    }

    // Check for canvas resize handle
    if ((target as HTMLElement).classList.contains('canvas-resize-handle')) {
      this.startCanvasResize(target as HTMLElement, e);
      return;
    }

    // Check for zone resize handle
    if ((target as HTMLElement).classList.contains('zone-resize')) {
      const direction = (target as HTMLElement).dataset.resize as 'br' | 'tl' || 'br';
      this.startZoneResize((target as HTMLElement).parentElement!, e, direction);
      return;
    }

    // Check for general resize handle (component, note, scenario) - bottom-right or top-left
    if ((target as HTMLElement).classList.contains('resize-handle') ||
        (target as HTMLElement).classList.contains('resize-handle-tl')) {
      const elementEl = (target as HTMLElement).closest('.component, .note-box, .scenario-box') as HTMLElement;
      if (elementEl) {
        const direction = (target as HTMLElement).dataset.resize as 'br' | 'tl' || 'br';
        this.startElementResize(elementEl, e, direction);
        return;
      }
    }

    // Check for element selection/drag
    const elementEl = (target as HTMLElement).closest('.component, .zone, .note-box, .scenario-box') as HTMLElement;
    if (elementEl) {
      // In arrow edit mode, clicking a component selects its connected arrows
      if (this.state.arrowEditMode) {
        this.state.selectArrowsConnectedTo(elementEl.id);
        return;
      }
      this.handleElementMouseDown(elementEl, e);
      return;
    }

    // Click on empty canvas - start selection box drag
    if ((target as HTMLElement).id === 'canvas' || target.classList.contains('svg-layer')) {
      // In arrow edit mode, clicking empty space exits the mode
      if (this.state.arrowEditMode && !e.shiftKey) {
        this.state.toggleArrowEditMode();
        return;
      }
      // Start selection box (works without shift too)
      this.startSelectionBox(canvasPoint, e.shiftKey);
    }
  }

  // Find arrow at given screen coordinates
  private findArrowAtPoint(clientX: number, clientY: number): string | null {
    const elements = document.elementsFromPoint(clientX, clientY);

    for (const el of elements) {
      // Check for arrow hit area first
      if (el.classList.contains('arrow-hit-area')) {
        const id = el.getAttribute('data-id');
        if (id) return id;
      }
      // Check for connection line
      if (el.classList.contains('connection-line')) {
        const id = el.getAttribute('data-id');
        if (id) return id;
      }
    }

    return null;
  }

  // Find endpoint at given screen coordinates
  private findEndpointAtPoint(clientX: number, clientY: number): { arrowId: string; endpoint: 'from' | 'to' } | null {
    const elements = document.elementsFromPoint(clientX, clientY);

    for (const el of elements) {
      if (el.classList.contains('arrow-endpoint')) {
        const arrowId = el.getAttribute('data-arrow-id');
        const endpoint = el.getAttribute('data-endpoint') as 'from' | 'to';
        if (arrowId && endpoint) {
          return { arrowId, endpoint };
        }
      }
    }

    return null;
  }

  // Find waypoint at given screen coordinates
  private findWaypointAtPoint(clientX: number, clientY: number): { arrowId: string; index: number } | null {
    const elements = document.elementsFromPoint(clientX, clientY);

    for (const el of elements) {
      if (el.classList.contains('waypoint')) {
        const arrowId = el.getAttribute('data-arrow-id');
        const index = parseInt(el.getAttribute('data-waypoint-index') || '0');
        if (arrowId) {
          return { arrowId, index };
        }
      }
    }

    return null;
  }

  private handleMouseMove(e: MouseEvent): void {
    const canvasPoint = this.canvas.screenToCanvas(e.clientX, e.clientY);

    // Panning
    if (this.isPanning) {
      const dx = e.clientX - this.dragState.startX;
      const dy = e.clientY - this.dragState.startY;
      this.state.setPan(
        this.dragState.startPan.x + dx,
        this.dragState.startPan.y + dy
      );
      return;
    }

    // Endpoint dragging (reconnecting arrow)
    if (this.dragState.draggingEndpoint) {
      this.updateEndpointDrag(canvasPoint, e);
      return;
    }

    // Waypoint dragging
    if (this.dragState.draggingWaypoint) {
      this.updateWaypointPosition(canvasPoint);
      return;
    }

    // Canvas resizing
    if (this.dragState.resizingCanvas) {
      this.updateCanvasResize(e);
      return;
    }

    // Zone resizing
    if (this.dragState.resizingZone) {
      this.updateZoneResize(e);
      return;
    }

    // Element resizing (component, note, scenario)
    if (this.dragState.resizingElement) {
      this.updateElementResize(e);
      return;
    }

    // Element dragging
    if (this.dragState.isDragging && this.state.selectedIds.size > 0) {
      this.updateElementDrag(canvasPoint);
      return;
    }

    // Arrow drawing
    if (this.arrowDrawState.isDrawing && this.arrowDrawState.fromId) {
      const fromEl = document.getElementById(this.arrowDrawState.fromId);
      if (fromEl) {
        const fromPoint = this.canvas.getAnchorPoint(fromEl, this.arrowDrawState.fromAnchor!);
        this.canvas.drawTempArrow(fromPoint, canvasPoint);
      }
      return;
    }

    // Selection box
    if (this.selectionBoxState.isSelecting) {
      const width = canvasPoint.x - this.selectionBoxState.startX;
      const height = canvasPoint.y - this.selectionBoxState.startY;
      this.canvas.drawSelectionBox(
        this.selectionBoxState.startX,
        this.selectionBoxState.startY,
        width,
        height
      );
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const canvasPoint = this.canvas.screenToCanvas(e.clientX, e.clientY);

    // End panning
    if (this.isPanning) {
      this.isPanning = false;
      this.setPanningCursor(false);
      return;
    }

    // End endpoint drag (reconnecting arrow)
    if (this.dragState.draggingEndpoint) {
      this.finishEndpointDrag(e);
      return;
    }

    // End waypoint drag
    if (this.dragState.draggingWaypoint) {
      this.state.saveToHistory();
      this.dragState.draggingWaypoint = null;
      return;
    }

    // End canvas resize
    if (this.dragState.resizingCanvas) {
      this.dragState.resizingCanvas = null;
      this.dragState.canvasStartSize = null;
      // Remove resizing class from handle
      document.querySelectorAll('.canvas-resize-handle.resizing').forEach(el => {
        el.classList.remove('resizing');
      });
      return;
    }

    // End zone resize
    if (this.dragState.resizingZone) {
      this.state.saveToHistory();
      this.dragState.resizingZone = null;
      this.dragState.resizeStartSize = null;
      return;
    }

    // End element resize
    if (this.dragState.resizingElement) {
      this.state.saveToHistory();
      this.dragState.resizingElement = null;
      this.dragState.resizeStartSize = null;
      this.dragState.resizeStartPos = null;
      this.dragState.resizeDirection = null;
      return;
    }

    // End element drag
    if (this.dragState.isDragging) {
      if (this.dragState.elementStartPositions.size > 0 || this.dragState.arrowWaypointsStart.size > 0) {
        this.state.saveToHistory();
      }
      this.dragState.isDragging = false;
      this.dragState.elementStartPositions.clear();
      this.dragState.arrowWaypointsStart.clear();
      return;
    }

    // End arrow drawing
    if (this.arrowDrawState.isDrawing) {
      this.canvas.clearTempArrow();

      // Check if mouse is over an anchor
      if (target.classList.contains('anchor')) {
        const toElement = target.closest('.component, .zone') as HTMLElement;
        if (toElement && toElement.id !== this.arrowDrawState.fromId) {
          const toAnchor = target.dataset.anchor as AnchorPosition;
          this.createArrow(toElement.id, toAnchor);
        }
      }

      this.arrowDrawState.isDrawing = false;
      this.arrowDrawState.fromId = null;
      this.arrowDrawState.fromAnchor = null;
      return;
    }

    // End selection box
    if (this.selectionBoxState.isSelecting) {
      this.canvas.clearSelectionBox();

      const width = canvasPoint.x - this.selectionBoxState.startX;
      const height = canvasPoint.y - this.selectionBoxState.startY;

      if (Math.abs(width) > 5 && Math.abs(height) > 5) {
        this.state.selectInRect(
          this.selectionBoxState.startX,
          this.selectionBoxState.startY,
          width,
          height,
          this.selectionBoxState.addToSelection
        );
      }

      this.selectionBoxState.isSelecting = false;
      this.selectionBoxState.addToSelection = false;
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    // Pinch zoom (Ctrl + wheel) or mouse wheel with Ctrl = zoom
    if (e.ctrlKey || e.metaKey) {
      // Reduced sensitivity: 5% per tick instead of 10%
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      const rect = this.canvas.getContainer().getBoundingClientRect();
      const center = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this.state.setZoom(this.state.zoom * delta, center);
    } else {
      // Trackpad scroll / mouse wheel without modifier = pan
      // Reduced sensitivity by 50%
      const dx = -e.deltaX * 0.5;
      const dy = -e.deltaY * 0.5;
      this.state.setPan(
        this.state.pan.x + dx,
        this.state.pan.y + dy
      );
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const isCmd = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    // Undo: Cmd/Ctrl + Z
    if (isCmd && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.state.undo();
      return;
    }

    // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
    if ((isCmd && e.key === 'z' && e.shiftKey) || (isCmd && e.key === 'y')) {
      e.preventDefault();
      this.state.redo();
      return;
    }

    // Copy: Cmd/Ctrl + C
    if (isCmd && e.key === 'c' && !isTyping) {
      e.preventDefault();
      this.state.copySelected();
      return;
    }

    // Paste: Cmd/Ctrl + V
    if (isCmd && e.key === 'v' && !isTyping) {
      e.preventDefault();
      this.state.paste();
      return;
    }

    // Select All: Cmd/Ctrl + A
    if (isCmd && e.key.toLowerCase() === 'a' && !isTyping) {
      e.preventDefault();
      this.state.elements.forEach((_, id) => {
        this.state.selectedIds.add(id);
      });
      this.state.emit('selectionChange');
      return;
    }

    // Toggle Arrow Edit Mode: A (without Cmd/Ctrl)
    if (e.key.toLowerCase() === 'a' && !isCmd && !isTyping) {
      e.preventDefault();
      this.state.toggleArrowEditMode();
      this.updateArrowEditModeClass();
      return;
    }

    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Don't delete if typing in input
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
      this.state.deleteSelected();
      return;
    }

    // Escape - clear selection or cancel operation
    if (e.key === 'Escape') {
      if (this.arrowDrawState.isDrawing) {
        this.canvas.clearTempArrow();
        this.arrowDrawState.isDrawing = false;
        this.arrowDrawState.fromId = null;
        this.arrowDrawState.fromAnchor = null;
      } else {
        this.state.clearSelection();
      }
      return;
    }

    // Arrow keys to move selected elements
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      e.preventDefault();

      const step = e.shiftKey ? 10 : (this.state.gridSnap ? this.state.gridSize : 1);
      let dx = 0, dy = 0;

      switch (e.key) {
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
      }

      this.state.moveSelected(dx, dy);
      this.state.saveToHistory();
    }
  }

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    // Context menu can be implemented here
  }

  private handleDoubleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | SVGElement;

    // Waypoint 더블클릭 - 해당 꺾인점 삭제
    if (target.classList.contains('waypoint')) {
      const arrowId = target.getAttribute('data-arrow-id');
      const waypointIndex = parseInt(target.getAttribute('data-waypoint-index') || '0');
      if (arrowId) {
        this.deleteSelectedWaypoint(arrowId, waypointIndex);
        return;
      }
    }

    const elementEl = target.closest('.component, .zone, .note-box, .scenario-box') as HTMLElement;

    if (elementEl) {
      // Could open inline editor here
      // For now, just select the element
      this.state.select(elementEl.id);
    }
  }

  private handleSvgClick(e: MouseEvent): void {
    const target = e.target as SVGElement;

    // Arrow/connection click
    if (target.classList.contains('connection-line')) {
      const id = target.getAttribute('data-id');
      if (id) {
        if (e.shiftKey) {
          this.state.toggleSelection(id);
        } else {
          this.state.select(id);
        }

        // Double click on arrow to add waypoint
        if (e.detail === 2) {
          this.addWaypointToArrow(id, e);
        }
      }
    }
  }

  private startPanning(e: MouseEvent): void {
    this.isPanning = true;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.startPan = { ...this.state.pan };
    this.setPanningCursor(true);
  }

  private startArrowDraw(anchor: HTMLElement): void {
    const parentElement = anchor.closest('.component, .zone') as HTMLElement;
    if (!parentElement) return;

    this.arrowDrawState.isDrawing = true;
    this.arrowDrawState.fromId = parentElement.id;
    this.arrowDrawState.fromAnchor = anchor.dataset.anchor as AnchorPosition;
  }

  private createArrow(toId: string, toAnchor: AnchorPosition): void {
    if (!this.arrowDrawState.fromId || !this.arrowDrawState.fromAnchor) return;

    const arrow = this.state.createArrow(
      this.arrowDrawState.fromId,
      this.arrowDrawState.fromAnchor,
      toId,
      toAnchor
    );

    this.state.addElement(arrow);
    this.state.select(arrow.id);
  }

  private handleElementMouseDown(element: HTMLElement, e: MouseEvent): void {
    const id = element.id;

    // Selection handling
    if (e.shiftKey) {
      this.state.toggleSelection(id);
    } else if (!this.state.selectedIds.has(id)) {
      this.state.select(id);
    }

    // Start dragging
    this.dragState.isDragging = true;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;

    // Store start positions of all selected elements
    this.dragState.elementStartPositions.clear();
    this.dragState.arrowWaypointsStart.clear();

    this.state.selectedIds.forEach(selectedId => {
      const el = this.state.getElement(selectedId);
      if (!el) return;

      if (el.type === 'arrow') {
        // 화살표의 waypoints 시작 위치 저장
        const arrow = el as ArrowData;
        if (arrow.waypoints && arrow.waypoints.length > 0) {
          this.dragState.arrowWaypointsStart.set(selectedId,
            arrow.waypoints.map(wp => ({ x: wp.x, y: wp.y }))
          );
        }
      } else {
        const pos = el as ComponentData | ZoneData | NoteData | ScenarioData;
        this.dragState.elementStartPositions.set(selectedId, { x: pos.x, y: pos.y });

        // Zone의 lockElements가 true이면 내부 요소들도 함께 이동
        if (el.type === 'zone' && (el as ZoneData).lockElements) {
          const zone = el as ZoneData;
          const elementsInside = this.getElementsInsideZone(zone);
          elementsInside.forEach(insideEl => {
            if (!this.dragState.elementStartPositions.has(insideEl.id)) {
              const insidePos = insideEl as ComponentData | NoteData | ScenarioData;
              this.dragState.elementStartPositions.set(insideEl.id, { x: insidePos.x, y: insidePos.y });
            }
          });
        }
      }
    });
  }

  // Zone 내부에 있는 요소들 찾기
  private getElementsInsideZone(zone: ZoneData): (ComponentData | NoteData | ScenarioData)[] {
    const elementsInside: (ComponentData | NoteData | ScenarioData)[] = [];

    this.state.elements.forEach(el => {
      // arrow, zone 제외
      if (el.type === 'arrow' || el.type === 'zone') return;

      const pos = el as ComponentData | NoteData | ScenarioData;
      let elWidth = 100, elHeight = 80;

      if (el.type === 'component') {
        elWidth = (el as ComponentData).width ?? 100;
        elHeight = (el as ComponentData).height ?? 80;
      } else if (el.type === 'note') {
        elWidth = (el as NoteData).width ?? 150;
        elHeight = (el as NoteData).height ?? 100;
      } else if (el.type === 'scenario') {
        elWidth = (el as ScenarioData).width ?? 160;
        elHeight = (el as ScenarioData).height ?? 100;
      }

      // 요소의 중심점이 zone 내부에 있는지 확인
      const centerX = pos.x + elWidth / 2;
      const centerY = pos.y + elHeight / 2;

      if (centerX >= zone.x && centerX <= zone.x + zone.width &&
          centerY >= zone.y && centerY <= zone.y + zone.height) {
        elementsInside.push(pos);
      }
    });

    return elementsInside;
  }

  private updateElementDrag(canvasPoint: Point): void {
    const startCanvasPoint = this.canvas.screenToCanvas(
      this.dragState.startX,
      this.dragState.startY
    );

    let dx = canvasPoint.x - startCanvasPoint.x;
    let dy = canvasPoint.y - startCanvasPoint.y;

    // 일반 요소들 이동
    this.dragState.elementStartPositions.forEach((startPos, id) => {
      let newX = startPos.x + dx;
      let newY = startPos.y + dy;

      if (this.state.gridSnap) {
        newX = Math.round(newX / this.state.gridSize) * this.state.gridSize;
        newY = Math.round(newY / this.state.gridSize) * this.state.gridSize;
      }

      this.state.updateElement(id, { x: newX, y: newY });

      // Auto-expand canvas when element moves outside bounds
      const element = this.state.getElement(id);
      if (element) {
        this.canvas.checkAutoExpand(element);
      }
    });

    // 선택된 화살표의 waypoints도 함께 이동
    this.dragState.arrowWaypointsStart.forEach((startWaypoints, arrowId) => {
      const newWaypoints = startWaypoints.map(wp => ({
        x: wp.x + dx,
        y: wp.y + dy
      }));
      this.state.updateElement(arrowId, { waypoints: newWaypoints });
    });
  }

  private startZoneResize(zoneEl: HTMLElement, e: MouseEvent, direction: 'br' | 'tl' = 'br'): void {
    const zone = this.state.getElement(zoneEl.id) as ZoneData;
    if (!zone) return;

    this.dragState.resizingZone = zoneEl.id;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.resizeStartSize = { width: zone.width, height: zone.height };
    this.dragState.resizeStartPos = { x: zone.x, y: zone.y };
    this.dragState.resizeDirection = direction;
  }

  private updateZoneResize(e: MouseEvent): void {
    if (!this.dragState.resizingZone || !this.dragState.resizeStartSize || !this.dragState.resizeStartPos) return;

    const dx = (e.clientX - this.dragState.startX) / this.state.zoom;
    const dy = (e.clientY - this.dragState.startY) / this.state.zoom;

    let newWidth: number, newHeight: number, newX: number, newY: number;

    if (this.dragState.resizeDirection === 'tl') {
      // 좌상단 리사이즈: 위치와 크기 모두 변경
      newWidth = Math.max(100, this.dragState.resizeStartSize.width - dx);
      newHeight = Math.max(60, this.dragState.resizeStartSize.height - dy);

      const actualDx = this.dragState.resizeStartSize.width - newWidth;
      const actualDy = this.dragState.resizeStartSize.height - newHeight;

      newX = this.dragState.resizeStartPos.x + actualDx;
      newY = this.dragState.resizeStartPos.y + actualDy;

      if (this.state.gridSnap) {
        newWidth = Math.round(newWidth / this.state.gridSize) * this.state.gridSize;
        newHeight = Math.round(newHeight / this.state.gridSize) * this.state.gridSize;
        newX = Math.round(newX / this.state.gridSize) * this.state.gridSize;
        newY = Math.round(newY / this.state.gridSize) * this.state.gridSize;
      }

      this.state.updateElement(this.dragState.resizingZone, {
        width: newWidth,
        height: newHeight,
        x: newX,
        y: newY
      });
    } else {
      // 우하단 리사이즈: 크기만 변경
      newWidth = Math.max(100, this.dragState.resizeStartSize.width + dx);
      newHeight = Math.max(60, this.dragState.resizeStartSize.height + dy);

      if (this.state.gridSnap) {
        newWidth = Math.round(newWidth / this.state.gridSize) * this.state.gridSize;
        newHeight = Math.round(newHeight / this.state.gridSize) * this.state.gridSize;
      }

      this.state.updateElement(this.dragState.resizingZone, {
        width: newWidth,
        height: newHeight
      });
    }
  }

  private startElementResize(elementEl: HTMLElement, e: MouseEvent, direction: 'br' | 'tl' = 'br'): void {
    const element = this.state.getElement(elementEl.id);
    if (!element) return;

    let width = 100, height = 80;
    if (element.type === 'component') {
      width = (element as ComponentData).width ?? 100;
      height = (element as ComponentData).height ?? 80;
    } else if (element.type === 'note') {
      width = (element as NoteData).width ?? 150;
      height = (element as NoteData).height ?? 100;
    } else if (element.type === 'scenario') {
      width = (element as ScenarioData).width ?? 160;
      height = (element as ScenarioData).height ?? 100;
    }

    const pos = element as ComponentData | NoteData | ScenarioData;

    this.dragState.resizingElement = elementEl.id;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.resizeStartSize = { width, height };
    this.dragState.resizeStartPos = { x: pos.x, y: pos.y };
    this.dragState.resizeDirection = direction;
  }

  private updateElementResize(e: MouseEvent): void {
    if (!this.dragState.resizingElement || !this.dragState.resizeStartSize || !this.dragState.resizeStartPos) return;

    const element = this.state.getElement(this.dragState.resizingElement);
    if (!element) return;

    const dx = (e.clientX - this.dragState.startX) / this.state.zoom;
    const dy = (e.clientY - this.dragState.startY) / this.state.zoom;

    // 요소 타입별 최소 크기 설정
    let minWidth = 60, minHeight = 50;
    if (element.type === 'note') {
      minWidth = 80;
      minHeight = 60;
    } else if (element.type === 'scenario') {
      minWidth = 100;
      minHeight = 70;
    }

    let newWidth: number, newHeight: number, newX: number, newY: number;

    if (this.dragState.resizeDirection === 'tl') {
      // 좌상단 리사이즈: 위치와 크기 모두 변경
      // dx가 음수(왼쪽 이동)면 width 증가, x 감소
      // dy가 음수(위쪽 이동)면 height 증가, y 감소
      newWidth = Math.max(minWidth, this.dragState.resizeStartSize.width - dx);
      newHeight = Math.max(minHeight, this.dragState.resizeStartSize.height - dy);

      // 크기가 최소값에 도달하면 위치도 제한
      const actualDx = this.dragState.resizeStartSize.width - newWidth;
      const actualDy = this.dragState.resizeStartSize.height - newHeight;

      newX = this.dragState.resizeStartPos.x + actualDx;
      newY = this.dragState.resizeStartPos.y + actualDy;

      if (this.state.gridSnap) {
        newWidth = Math.round(newWidth / this.state.gridSize) * this.state.gridSize;
        newHeight = Math.round(newHeight / this.state.gridSize) * this.state.gridSize;
        newX = Math.round(newX / this.state.gridSize) * this.state.gridSize;
        newY = Math.round(newY / this.state.gridSize) * this.state.gridSize;
      }

      this.state.updateElement(this.dragState.resizingElement, {
        width: newWidth,
        height: newHeight,
        x: newX,
        y: newY
      });
    } else {
      // 우하단 리사이즈 (기존 동작): 크기만 변경
      newWidth = Math.max(minWidth, this.dragState.resizeStartSize.width + dx);
      newHeight = Math.max(minHeight, this.dragState.resizeStartSize.height + dy);

      if (this.state.gridSnap) {
        newWidth = Math.round(newWidth / this.state.gridSize) * this.state.gridSize;
        newHeight = Math.round(newHeight / this.state.gridSize) * this.state.gridSize;
      }

      this.state.updateElement(this.dragState.resizingElement, {
        width: newWidth,
        height: newHeight
      });
    }
  }

  private startSelectionBox(point: Point, addToSelection = false): void {
    this.selectionBoxState.isSelecting = true;
    this.selectionBoxState.startX = point.x;
    this.selectionBoxState.startY = point.y;
    this.selectionBoxState.addToSelection = addToSelection;

    // If not adding to selection, clear current selection immediately
    if (!addToSelection) {
      this.state.clearSelection();
    }
  }

  private startWaypointDrag(waypoint: SVGElement, e: MouseEvent): void {
    const arrowId = waypoint.getAttribute('data-arrow-id');
    const index = parseInt(waypoint.getAttribute('data-waypoint-index') || '0');

    if (arrowId) {
      this.dragState.draggingWaypoint = { arrowId, index };
      this.dragState.startX = e.clientX;
      this.dragState.startY = e.clientY;
    }
  }

  private updateWaypointPosition(canvasPoint: Point): void {
    if (!this.dragState.draggingWaypoint) return;

    const { arrowId, index } = this.dragState.draggingWaypoint;
    const arrow = this.state.getElement(arrowId) as ArrowData;

    if (arrow && arrow.waypoints[index]) {
      const waypoints = [...arrow.waypoints];
      waypoints[index] = {
        x: this.state.gridSnap
          ? Math.round(canvasPoint.x / this.state.gridSize) * this.state.gridSize
          : canvasPoint.x,
        y: this.state.gridSnap
          ? Math.round(canvasPoint.y / this.state.gridSize) * this.state.gridSize
          : canvasPoint.y
      };
      this.state.updateElement(arrowId, { waypoints });
    }
  }

  private addWaypointToArrow(arrowId: string, e: MouseEvent): void {
    const arrow = this.state.getElement(arrowId) as ArrowData;
    if (!arrow) return;

    const canvasPoint = this.canvas.screenToCanvas(e.clientX, e.clientY);

    // Find the best position to insert the waypoint
    const fromEl = document.getElementById(arrow.from);
    const toEl = document.getElementById(arrow.to);
    if (!fromEl || !toEl) return;

    const fromPoint = this.canvas.getAnchorPoint(fromEl, arrow.fromAnchor);
    const toPoint = this.canvas.getAnchorPoint(toEl, arrow.toAnchor);

    const points = [fromPoint, ...arrow.waypoints, toPoint];

    // Find which segment was clicked
    let insertIndex = arrow.waypoints.length;
    let minDist = Infinity;

    for (let i = 0; i < points.length - 1; i++) {
      const dist = this.pointToSegmentDistance(canvasPoint, points[i], points[i + 1]);
      if (dist < minDist) {
        minDist = dist;
        insertIndex = i;
      }
    }

    const newWaypoints = [...arrow.waypoints];
    newWaypoints.splice(insertIndex, 0, {
      x: this.state.gridSnap
        ? Math.round(canvasPoint.x / this.state.gridSize) * this.state.gridSize
        : canvasPoint.x,
      y: this.state.gridSnap
        ? Math.round(canvasPoint.y / this.state.gridSize) * this.state.gridSize
        : canvasPoint.y
    });

    this.state.updateElementWithHistory(arrowId, { waypoints: newWaypoints });
  }

  private pointToSegmentDistance(point: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.sqrt((point.x - a.x) ** 2 + (point.y - a.y) ** 2);
    }

    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  // Public method to delete selected waypoint
  deleteSelectedWaypoint(arrowId: string, waypointIndex: number): void {
    const arrow = this.state.getElement(arrowId) as ArrowData;
    if (!arrow) return;

    const newWaypoints = arrow.waypoints.filter((_, i) => i !== waypointIndex);
    this.state.updateElementWithHistory(arrowId, { waypoints: newWaypoints });
  }

  // Arrow endpoint dragging (reconnecting arrows)
  private startEndpointDrag(target: SVGElement, e: MouseEvent): void {
    const arrowId = target.getAttribute('data-arrow-id');
    const endpoint = target.getAttribute('data-endpoint') as 'from' | 'to';

    if (arrowId && endpoint) {
      this.dragState.draggingEndpoint = { arrowId, endpoint };
      this.dragState.startX = e.clientX;
      this.dragState.startY = e.clientY;

      // Select the arrow being edited
      this.state.select(arrowId);
    }
  }

  private updateEndpointDrag(canvasPoint: Point, e: MouseEvent): void {
    if (!this.dragState.draggingEndpoint) return;

    const { arrowId, endpoint } = this.dragState.draggingEndpoint;
    const arrow = this.state.getElement(arrowId) as ArrowData;
    if (!arrow) return;

    // Get the reference point for preview
    // If there are waypoints, use the closest waypoint to the endpoint being dragged
    // Otherwise, use the other endpoint
    let referencePoint: Point;

    if (arrow.waypoints.length > 0) {
      // 'from' 끝점을 드래그 중이면 첫 번째 waypoint 기준
      // 'to' 끝점을 드래그 중이면 마지막 waypoint 기준
      if (endpoint === 'from') {
        referencePoint = arrow.waypoints[0];
      } else {
        referencePoint = arrow.waypoints[arrow.waypoints.length - 1];
      }
    } else {
      // No waypoints - use the other endpoint
      const fixedEndpoint = endpoint === 'from' ? 'to' : 'from';
      const fixedEl = document.getElementById(arrow[fixedEndpoint]);
      if (!fixedEl) return;

      const fixedAnchor = endpoint === 'from' ? arrow.toAnchor : arrow.fromAnchor;
      referencePoint = this.canvas.getAnchorPoint(fixedEl, fixedAnchor);
    }

    // Draw temp arrow from current mouse position to reference point
    if (endpoint === 'from') {
      this.canvas.drawTempArrow(canvasPoint, referencePoint);
    } else {
      this.canvas.drawTempArrow(referencePoint, canvasPoint);
    }

    // Highlight anchors under mouse
    this.highlightNearestAnchor(e);
  }

  private highlightNearestAnchor(e: MouseEvent): void {
    // Remove previous highlight
    document.querySelectorAll('.anchor.hover-highlight').forEach(el => {
      el.classList.remove('hover-highlight');
    });

    // Check if mouse is over an anchor
    const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of elementsUnder) {
      if (el.classList.contains('anchor')) {
        el.classList.add('hover-highlight');
        break;
      }
    }
  }

  private finishEndpointDrag(e: MouseEvent): void {
    if (!this.dragState.draggingEndpoint) return;

    const { arrowId, endpoint } = this.dragState.draggingEndpoint;
    this.canvas.clearTempArrow();

    // Remove anchor highlight
    document.querySelectorAll('.anchor.hover-highlight').forEach(el => {
      el.classList.remove('hover-highlight');
    });

    // Check if mouse is over an anchor
    const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);

    let targetAnchor: HTMLElement | null = null;
    for (const el of elementsUnder) {
      if (el.classList.contains('anchor')) {
        targetAnchor = el as HTMLElement;
        break;
      }
    }

    if (targetAnchor) {
      const parentElement = targetAnchor.closest('.component, .zone') as HTMLElement;
      if (parentElement) {
        const newTargetId = parentElement.id;
        const newAnchor = targetAnchor.dataset.anchor as AnchorPosition;

        // Don't allow connecting to itself (same element same anchor)
        const arrow = this.state.getElement(arrowId) as ArrowData;
        if (arrow) {
          const otherEndId = endpoint === 'from' ? arrow.to : arrow.from;

          // Allow connecting to the same element but different anchor, or different element
          if (newTargetId !== otherEndId || newAnchor !== (endpoint === 'from' ? arrow.toAnchor : arrow.fromAnchor)) {
            this.state.updateArrowAnchor(arrowId, endpoint, newTargetId, newAnchor);
            this.state.saveToHistory();
          }
        }
      }
    }

    this.dragState.draggingEndpoint = null;
  }

  private updateArrowEditModeClass(): void {
    const canvas = this.canvas.getCanvas();
    canvas.classList.toggle('arrow-edit-mode', this.state.arrowEditMode);
  }

  // Canvas resize methods
  private startCanvasResize(handle: HTMLElement, e: MouseEvent): void {
    const resizeType = handle.dataset.resize as 'right' | 'bottom' | 'corner';
    if (!resizeType) return;

    this.dragState.resizingCanvas = resizeType;
    this.dragState.startX = e.clientX;
    this.dragState.startY = e.clientY;
    this.dragState.canvasStartSize = { ...this.state.canvasSize };
    handle.classList.add('resizing');
  }

  private updateCanvasResize(e: MouseEvent): void {
    if (!this.dragState.resizingCanvas || !this.dragState.canvasStartSize) return;

    const dx = (e.clientX - this.dragState.startX) / this.state.zoom;
    const dy = (e.clientY - this.dragState.startY) / this.state.zoom;

    let newWidth = this.dragState.canvasStartSize.width;
    let newHeight = this.dragState.canvasStartSize.height;

    if (this.dragState.resizingCanvas === 'right' || this.dragState.resizingCanvas === 'corner') {
      newWidth = Math.max(400, this.dragState.canvasStartSize.width + dx);
    }

    if (this.dragState.resizingCanvas === 'bottom' || this.dragState.resizingCanvas === 'corner') {
      newHeight = Math.max(300, this.dragState.canvasStartSize.height + dy);
    }

    // Snap to grid
    if (this.state.gridSnap) {
      newWidth = Math.round(newWidth / this.state.gridSize) * this.state.gridSize;
      newHeight = Math.round(newHeight / this.state.gridSize) * this.state.gridSize;
    }

    this.canvas.setCanvasSize(newWidth, newHeight);
  }
}
