// Element Types
export type ElementType = 'component' | 'zone' | 'arrow' | 'note' | 'scenario';

// Component Shape Types
export type ComponentShape = 'rectangle' | 'triangle' | 'cylinder' | 'star';

// Arrow Marker Types (끝점 형태)
export type ArrowMarkerType = 'none' | 'arrow' | 'circle';

export interface Point {
  x: number;
  y: number;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  opacity?: number;
  zIndex?: number;
}

export interface ComponentData extends BaseElement {
  type: 'component';
  name: string;
  icon: string;
  color: string;
  sub?: string;
  textColor?: string;
  fontSize?: number;
  width?: number;
  height?: number;
  shape?: ComponentShape;
}

export interface ZoneData extends BaseElement {
  type: 'zone';
  label: string;
  color: string;
  width: number;
  height: number;
}

export interface ArrowData {
  id: string;
  type: 'arrow';
  from: string;
  fromAnchor: AnchorPosition;
  to: string;
  toAnchor: AnchorPosition;
  waypoints: Point[];
  label: string;
  color: string;
  style: 'solid' | 'dashed';
  startMarker?: ArrowMarkerType;  // 시작점 형태 (기본: none)
  endMarker?: ArrowMarkerType;    // 끝점 형태 (기본: arrow)
  opacity?: number;
  zIndex?: number;
}

export interface NoteData extends BaseElement {
  type: 'note';
  title: string;
  text: string;
  width?: number;
  height?: number;
}

export interface ScenarioData extends BaseElement {
  type: 'scenario';
  title: string;
  subtitle: string;
  desc: string;
  color: string;
  width?: number;
  height?: number;
  textColor?: string;
  fontSize?: number;
}

export type DiagramElement = ComponentData | ZoneData | ArrowData | NoteData | ScenarioData;

export type AnchorPosition = 'top' | 'bottom' | 'left' | 'right';

export interface DiagramState {
  elements: Map<string, DiagramElement>;
  selectedIds: Set<string>;
  zoom: number;
  pan: Point;
  canvasSize: { width: number; height: number };
}

export interface HistoryEntry {
  elements: Map<string, DiagramElement>;
  selectedIds: Set<string>;
}

// Tool types
export type ToolType = 'select' | 'pan' | 'arrow';

// Events
export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  elementStartPositions: Map<string, Point>;
}

export interface ArrowDrawState {
  isDrawing: boolean;
  fromId: string | null;
  fromAnchor: AnchorPosition | null;
  tempEndPoint: Point | null;
}

export interface SelectionBoxState {
  isSelecting: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// Session types
export interface SessionData {
  id: string;
  title: string;
  createdAt: string;
  lastSavedAt: string;
  elements: DiagramElement[];
  canvasSize: { width: number; height: number };
}

export interface SessionListItem {
  id: string;
  title: string;
  createdAt: string;
  lastSavedAt: string;
}
