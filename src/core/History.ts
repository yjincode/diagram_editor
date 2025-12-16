import { DiagramElement } from '../types';
import { EventEmitter } from './EventEmitter';

interface HistoryEntry {
  elements: Map<string, DiagramElement>;
  timestamp: number;
}

export class History extends EventEmitter {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private maxSize = 50;

  constructor() {
    super();
  }

  push(elements: Map<string, DiagramElement>): void {
    // Deep clone the elements
    const cloned = this.cloneElements(elements);

    this.undoStack.push({
      elements: cloned,
      timestamp: Date.now()
    });

    // Clear redo stack when new action is performed
    this.redoStack = [];

    // Limit stack size
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }

    this.emit('change');
  }

  undo(): Map<string, DiagramElement> | null {
    if (this.undoStack.length <= 1) return null;

    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    const previous = this.undoStack[this.undoStack.length - 1];
    this.emit('change');

    return this.cloneElements(previous.elements);
  }

  redo(): Map<string, DiagramElement> | null {
    if (this.redoStack.length === 0) return null;

    const next = this.redoStack.pop()!;
    this.undoStack.push(next);

    this.emit('change');
    return this.cloneElements(next.elements);
  }

  canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit('change');
  }

  private cloneElements(elements: Map<string, DiagramElement>): Map<string, DiagramElement> {
    const cloned = new Map<string, DiagramElement>();
    elements.forEach((element, id) => {
      cloned.set(id, this.cloneElement(element));
    });
    return cloned;
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
}
