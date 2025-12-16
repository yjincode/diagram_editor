import { State } from '../core/State';
import { ComponentData, ZoneData, ArrowData, NoteData, ScenarioData } from '../types';
import { i18n } from '../i18n';

export class PropertiesPanel {
  private state: State;
  private content: HTMLElement;
  private titleEl: HTMLElement;

  constructor(state: State) {
    this.state = state;
    this.content = document.getElementById('propsContent')!;
    this.titleEl = document.querySelector('#propsPanel h3')!;

    this.bindEvents();
    this.updateTitle();
  }

  private bindEvents(): void {
    this.state.on('selectionChange', () => this.render());
    this.state.on('elementsChange', () => {
      if (this.state.selectedIds.size > 0) {
        this.render();
      }
    });

    i18n.onChange(() => {
      this.updateTitle();
      this.render();
    });
  }

  private updateTitle(): void {
    this.titleEl.textContent = i18n.t.properties;
  }

  private render(): void {
    const t = i18n.t;

    if (this.state.selectedIds.size === 0) {
      this.content.innerHTML = `<p class="placeholder">${t.selectElement}</p>`;
      return;
    }

    if (this.state.selectedIds.size > 1) {
      this.renderMultiSelection();
      return;
    }

    const id = Array.from(this.state.selectedIds)[0];
    const element = this.state.getElement(id);
    if (!element) return;

    switch (element.type) {
      case 'component':
        this.renderComponentProps(element);
        break;
      case 'zone':
        this.renderZoneProps(element);
        break;
      case 'arrow':
        this.renderArrowProps(element);
        break;
      case 'note':
        this.renderNoteProps(element);
        break;
      case 'scenario':
        this.renderScenarioProps(element);
        break;
    }
  }

  private renderComponentProps(comp: ComponentData): void {
    const t = i18n.t;
    const currentShape = comp.shape ?? 'rectangle';
    this.content.innerHTML = `
      <div class="prop-row">
        <label>${t.name}</label>
        <input type="text" data-prop="name" value="${this.escapeAttr(comp.name)}">
      </div>
      <div class="prop-row">
        <label>${t.icon}</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" data-prop="icon" value="${this.escapeAttr(comp.icon)}" style="flex:1;text-align:center;font-size:1.2em;">
          <button class="emoji-picker-btn" data-action="emoji-picker" title="${t.selectEmoji}">😀</button>
        </div>
        <div class="emoji-picker" style="display:none;"></div>
      </div>
      <div class="prop-row">
        <label>${t.shape}</label>
        <select data-prop="shape" class="shape-select">
          <option value="rectangle" ${currentShape === 'rectangle' ? 'selected' : ''}>${t.shapeRectangle}</option>
          <option value="triangle" ${currentShape === 'triangle' ? 'selected' : ''}>${t.shapeTriangle}</option>
          <option value="cylinder" ${currentShape === 'cylinder' ? 'selected' : ''}>${t.shapeCylinder}</option>
          <option value="star" ${currentShape === 'star' ? 'selected' : ''}>${t.shapeStar}</option>
        </select>
      </div>
      <div class="prop-row">
        <label>${t.subtitle}</label>
        <input type="text" data-prop="sub" value="${this.escapeAttr(comp.sub || '')}">
      </div>
      <div class="prop-row">
        <label>${t.backgroundColor}</label>
        <input type="color" data-prop="color" value="${comp.color}">
      </div>
      <div class="prop-row">
        <label>${t.textColor}</label>
        <input type="color" data-prop="textColor" value="${comp.textColor || '#ffffff'}">
      </div>
      <div class="prop-row">
        <label>${t.fontSize}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <select data-prop="fontSize" class="font-size-select" style="flex:1;">
            ${[10,11,12,13,14,15,16,18,20,22,24,28,32].map(s =>
              `<option value="${s}" ${(comp.fontSize ?? 14) === s ? 'selected' : ''}>${s}px</option>`
            ).join('')}
          </select>
          <input type="number" data-prop="fontSize" class="font-size-input" value="${comp.fontSize ?? 14}" min="8" max="48" style="width:50px;">
        </div>
      </div>
      <div class="prop-row">
        <label>${t.opacity}</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" data-prop="opacity" min="10" max="100" step="10" value="${Math.round((comp.opacity ?? 1) * 100)}" style="flex:1">
          <span class="opacity-value">${Math.round((comp.opacity ?? 1) * 100)}%</span>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.position}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">X</span>
            <input type="number" data-prop="x" value="${Math.round(comp.x)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">Y</span>
            <input type="number" data-prop="y" value="${Math.round(comp.y)}" style="flex:1">
          </div>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.size}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">W</span>
            <input type="number" data-prop="width" value="${Math.round(comp.width ?? 100)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">H</span>
            <input type="number" data-prop="height" value="${Math.round(comp.height ?? 80)}" style="flex:1">
          </div>
        </div>
      </div>
      ${this.renderLayerButtons()}
      <button class="save-btn" data-action="save">${t.saveProps}</button>
      <button class="delete-btn" data-action="delete">${t.deleteElement}</button>
    `;
    this.bindPropInputs(comp.id);
    this.bindLayerButtons(comp.id);
    this.bindOpacitySlider();
    this.bindFontSizeControls();
    this.bindEmojiPicker(comp.id);
  }

  private renderZoneProps(zone: ZoneData): void {
    const t = i18n.t;
    this.content.innerHTML = `
      <div class="prop-row">
        <label>${t.label}</label>
        <input type="text" data-prop="label" value="${this.escapeAttr(zone.label)}">
      </div>
      <div class="prop-row">
        <label>${t.backgroundColor}</label>
        <input type="color" data-prop="color" value="${zone.color}">
      </div>
      <div class="prop-row">
        <label>${t.position}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">X</span>
            <input type="number" data-prop="x" value="${Math.round(zone.x)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">Y</span>
            <input type="number" data-prop="y" value="${Math.round(zone.y)}" style="flex:1">
          </div>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.size}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">W</span>
            <input type="number" data-prop="width" value="${Math.round(zone.width)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">H</span>
            <input type="number" data-prop="height" value="${Math.round(zone.height)}" style="flex:1">
          </div>
        </div>
      </div>
      <button class="save-btn" data-action="save">${t.saveProps}</button>
      <button class="delete-btn" data-action="delete">${t.deleteElement}</button>
    `;
    this.bindPropInputs(zone.id);
  }

  private renderArrowProps(arrow: ArrowData): void {
    const t = i18n.t;
    const currentStartMarker = arrow.startMarker || 'none';
    const currentEndMarker = arrow.endMarker ?? 'arrow';
    this.content.innerHTML = `
      <div class="prop-row">
        <label>${t.label}</label>
        <input type="text" data-prop="label" value="${this.escapeAttr(arrow.label)}">
      </div>
      <div class="prop-row">
        <label>${t.color}</label>
        <input type="color" data-prop="color" value="${arrow.color}">
      </div>
      <div class="prop-row">
        <label>${t.opacity}</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" data-prop="opacity" min="10" max="100" step="10" value="${Math.round((arrow.opacity ?? 1) * 100)}" style="flex:1">
          <span class="opacity-value">${Math.round((arrow.opacity ?? 1) * 100)}%</span>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.style}</label>
        <select data-prop="style">
          <option value="solid" ${arrow.style === 'solid' ? 'selected' : ''}>${t.solid}</option>
          <option value="dashed" ${arrow.style === 'dashed' ? 'selected' : ''}>${t.dashed}</option>
        </select>
      </div>
      <div class="prop-row">
        <label>${t.startMarker}</label>
        <select data-prop="startMarker">
          <option value="none" ${currentStartMarker === 'none' ? 'selected' : ''}>${t.markerNone}</option>
          <option value="arrow" ${currentStartMarker === 'arrow' ? 'selected' : ''}>${t.markerArrow}</option>
          <option value="circle" ${currentStartMarker === 'circle' ? 'selected' : ''}>${t.markerCircle}</option>
        </select>
      </div>
      <div class="prop-row">
        <label>${t.endMarker}</label>
        <select data-prop="endMarker">
          <option value="none" ${currentEndMarker === 'none' ? 'selected' : ''}>${t.markerNone}</option>
          <option value="arrow" ${currentEndMarker === 'arrow' ? 'selected' : ''}>${t.markerArrow}</option>
          <option value="circle" ${currentEndMarker === 'circle' ? 'selected' : ''}>${t.markerCircle}</option>
        </select>
      </div>
      <div class="prop-row">
        <label>${t.waypoints} (${arrow.waypoints.length})</label>
        <p style="font-size:0.75em;color:#666;margin-top:4px;white-space:pre-line;">
          ${t.waypointHint}
        </p>
        ${arrow.waypoints.length > 0 ? `
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="toolbar-btn" style="flex:1;background:#e3f2fd;color:#1976d2;border-color:#90caf9;" data-action="make-orthogonal" title="${t.makeOrthogonalHint}">
              ┘ ${t.makeOrthogonal}
            </button>
            <button class="toolbar-btn" style="flex:1;background:#f5f5f5;color:#333;border-color:#ddd;" data-action="clear-waypoints">
              ${t.clearWaypoints}
            </button>
          </div>
        ` : ''}
      </div>
      <button class="save-btn" data-action="save">${t.saveProps}</button>
      <button class="delete-btn" data-action="delete">${t.deleteElement}</button>
    `;
    this.bindPropInputs(arrow.id);
    this.bindOpacitySlider();

    // Make orthogonal button
    const orthogonalBtn = this.content.querySelector('[data-action="make-orthogonal"]');
    if (orthogonalBtn) {
      orthogonalBtn.addEventListener('click', () => {
        this.makeArrowOrthogonal(arrow.id);
      });
    }

    // Clear waypoints button
    const clearBtn = this.content.querySelector('[data-action="clear-waypoints"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.state.updateElementWithHistory(arrow.id, { waypoints: [] });
      });
    }
  }

  // 화살표를 직각으로 정렬 (컴포넌트 우회 포함)
  private makeArrowOrthogonal(arrowId: string): void {
    const arrow = this.state.getElement(arrowId) as ArrowData;
    if (!arrow) return;

    // 시작점과 끝점 가져오기
    const fromEl = document.getElementById(arrow.from);
    const toEl = document.getElementById(arrow.to);
    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const zoom = this.state.zoom;

    // 앵커 위치 계산
    const getAnchorPoint = (rect: DOMRect, anchor: string) => {
      const x = (rect.left - canvasRect.left) / zoom;
      const y = (rect.top - canvasRect.top) / zoom;
      const width = rect.width / zoom;
      const height = rect.height / zoom;
      switch (anchor) {
        case 'top': return { x: x + width / 2, y };
        case 'bottom': return { x: x + width / 2, y: y + height };
        case 'left': return { x, y: y + height / 2 };
        case 'right': return { x: x + width, y: y + height / 2 };
        default: return { x: x + width / 2, y: y + height / 2 };
      }
    };

    const fromPoint = getAnchorPoint(fromRect, arrow.fromAnchor);
    const toPoint = getAnchorPoint(toRect, arrow.toAnchor);

    // 장애물(컴포넌트) 목록 가져오기
    const obstacles = this.getObstacleBounds(arrow.from, arrow.to);

    // 직각 waypoints 생성 (컴포넌트 우회 포함)
    const newWaypoints = this.calculateOrthogonalWaypoints(
      fromPoint,
      toPoint,
      arrow.fromAnchor,
      arrow.toAnchor,
      obstacles
    );

    this.state.updateElementWithHistory(arrowId, { waypoints: newWaypoints });
  }

  // 장애물 바운딩 박스 가져오기
  private getObstacleBounds(excludeFromId: string, excludeToId: string): { x: number; y: number; width: number; height: number }[] {
    const obstacles: { x: number; y: number; width: number; height: number }[] = [];

    this.state.elements.forEach(el => {
      // 화살표, zone, 시작/끝 요소 제외
      if (el.type === 'arrow' || el.type === 'zone') return;
      if (el.id === excludeFromId || el.id === excludeToId) return;

      const pos = el as ComponentData | NoteData | ScenarioData;
      let width = 100, height = 80;

      if (el.type === 'component') {
        width = (el as ComponentData).width ?? 100;
        height = (el as ComponentData).height ?? 80;
      } else if (el.type === 'note') {
        width = (el as NoteData).width ?? 150;
        height = (el as NoteData).height ?? 100;
      } else if (el.type === 'scenario') {
        width = (el as ScenarioData).width ?? 160;
        height = (el as ScenarioData).height ?? 100;
      }

      obstacles.push({ x: pos.x, y: pos.y, width, height });
    });

    return obstacles;
  }

  // 선분과 사각형 충돌 검사
  private lineIntersectsRect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number },
    padding: number = 20
  ): boolean {
    const left = rect.x - padding;
    const right = rect.x + rect.width + padding;
    const top = rect.y - padding;
    const bottom = rect.y + rect.height + padding;

    // 선분이 완전히 사각형 밖에 있는지 확인
    if ((p1.x < left && p2.x < left) || (p1.x > right && p2.x > right)) return false;
    if ((p1.y < top && p2.y < top) || (p1.y > bottom && p2.y > bottom)) return false;

    // 점이 사각형 내부에 있는지 확인
    const pointInRect = (p: { x: number; y: number }) =>
      p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
    if (pointInRect(p1) || pointInRect(p2)) return true;

    // 선분이 사각형 변과 교차하는지 확인
    const lineIntersectsLine = (
      a1: { x: number; y: number }, a2: { x: number; y: number },
      b1: { x: number; y: number }, b2: { x: number; y: number }
    ): boolean => {
      const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
      if (det === 0) return false;
      const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
      const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
      return (0 <= lambda && lambda <= 1) && (0 <= gamma && gamma <= 1);
    };

    const edges = [
      [{ x: left, y: top }, { x: right, y: top }],
      [{ x: right, y: top }, { x: right, y: bottom }],
      [{ x: right, y: bottom }, { x: left, y: bottom }],
      [{ x: left, y: bottom }, { x: left, y: top }]
    ];

    for (const [e1, e2] of edges) {
      if (lineIntersectsLine(p1, p2, e1, e2)) return true;
    }

    return false;
  }

  // 직각 경로 계산 (컴포넌트 우회 포함)
  private calculateOrthogonalWaypoints(
    from: { x: number; y: number },
    to: { x: number; y: number },
    fromAnchor: string,
    toAnchor: string,
    obstacles: { x: number; y: number; width: number; height: number }[]
  ): { x: number; y: number }[] {
    const waypoints: { x: number; y: number }[] = [];
    const margin = 40; // 요소로부터의 우회 거리

    // 충돌하는 장애물 찾기
    const intersectingObstacles = obstacles.filter(obs =>
      this.lineIntersectsRect(from, to, obs, 25)
    );

    // 수평/수직 앵커 판단
    const isHorizontalFrom = fromAnchor === 'left' || fromAnchor === 'right';
    const isHorizontalTo = toAnchor === 'left' || toAnchor === 'right';

    if (intersectingObstacles.length === 0) {
      // 충돌 없음: 기본 직각 경로
      if (isHorizontalFrom && isHorizontalTo) {
        const midX = (from.x + to.x) / 2;
        waypoints.push({ x: midX, y: from.y });
        waypoints.push({ x: midX, y: to.y });
      } else if (!isHorizontalFrom && !isHorizontalTo) {
        const midY = (from.y + to.y) / 2;
        waypoints.push({ x: from.x, y: midY });
        waypoints.push({ x: to.x, y: midY });
      } else if (isHorizontalFrom && !isHorizontalTo) {
        waypoints.push({ x: to.x, y: from.y });
      } else {
        waypoints.push({ x: from.x, y: to.y });
      }
    } else {
      // 충돌 있음: 장애물 우회 경로 계산
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const obs of intersectingObstacles) {
        minX = Math.min(minX, obs.x);
        minY = Math.min(minY, obs.y);
        maxX = Math.max(maxX, obs.x + obs.width);
        maxY = Math.max(maxY, obs.y + obs.height);
      }

      if (isHorizontalFrom && isHorizontalTo) {
        // 둘 다 수평: 위 또는 아래로 우회
        const goAbove = from.y < (minY + maxY) / 2;
        const routeY = goAbove ? minY - margin : maxY + margin;

        waypoints.push({ x: from.x + (fromAnchor === 'right' ? margin : -margin), y: from.y });
        waypoints.push({ x: from.x + (fromAnchor === 'right' ? margin : -margin), y: routeY });
        waypoints.push({ x: to.x + (toAnchor === 'left' ? -margin : margin), y: routeY });
        waypoints.push({ x: to.x + (toAnchor === 'left' ? -margin : margin), y: to.y });
      } else if (!isHorizontalFrom && !isHorizontalTo) {
        // 둘 다 수직: 왼쪽 또는 오른쪽으로 우회
        const goLeft = from.x < (minX + maxX) / 2;
        const routeX = goLeft ? minX - margin : maxX + margin;

        waypoints.push({ x: from.x, y: from.y + (fromAnchor === 'bottom' ? margin : -margin) });
        waypoints.push({ x: routeX, y: from.y + (fromAnchor === 'bottom' ? margin : -margin) });
        waypoints.push({ x: routeX, y: to.y + (toAnchor === 'top' ? -margin : margin) });
        waypoints.push({ x: to.x, y: to.y + (toAnchor === 'top' ? -margin : margin) });
      } else if (isHorizontalFrom) {
        // 시작: 수평, 끝: 수직
        const goUp = to.y < from.y;
        const routeY = goUp ? minY - margin : maxY + margin;
        waypoints.push({ x: from.x + (fromAnchor === 'right' ? margin : -margin), y: from.y });
        waypoints.push({ x: from.x + (fromAnchor === 'right' ? margin : -margin), y: routeY });
        waypoints.push({ x: to.x, y: routeY });
      } else {
        // 시작: 수직, 끝: 수평
        const goLeft = to.x < from.x;
        const routeX = goLeft ? minX - margin : maxX + margin;
        waypoints.push({ x: from.x, y: from.y + (fromAnchor === 'bottom' ? margin : -margin) });
        waypoints.push({ x: routeX, y: from.y + (fromAnchor === 'bottom' ? margin : -margin) });
        waypoints.push({ x: routeX, y: to.y });
      }
    }

    // 중복/불필요한 waypoints 제거
    return this.cleanupWaypoints(waypoints, from, to);
  }

  // 불필요한 waypoints 정리
  private cleanupWaypoints(
    waypoints: { x: number; y: number }[],
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): { x: number; y: number }[] {
    if (waypoints.length === 0) return [];

    const result: { x: number; y: number }[] = [];
    const allPoints = [from, ...waypoints, to];

    for (let i = 1; i < allPoints.length - 1; i++) {
      const prev = allPoints[i - 1];
      const curr = allPoints[i];
      const next = allPoints[i + 1];

      // 이전/다음 점과 너무 가까우면 제외
      const distToPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const distToNext = Math.hypot(curr.x - next.x, curr.y - next.y);
      if (distToPrev < 10 || distToNext < 10) continue;

      // 일직선상에 있으면 제외
      const cross = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);
      if (Math.abs(cross) < 1) continue;

      result.push(curr);
    }

    return result;
  }

  private renderNoteProps(note: NoteData): void {
    const t = i18n.t;
    this.content.innerHTML = `
      <div class="prop-row">
        <label>${t.title}</label>
        <input type="text" data-prop="title" value="${this.escapeAttr(note.title)}">
      </div>
      <div class="prop-row">
        <label>${t.text}</label>
        <textarea data-prop="text" rows="4">${this.escapeAttr(note.text)}</textarea>
      </div>
      <div class="prop-row">
        <label>${t.opacity}</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" data-prop="opacity" min="10" max="100" step="10" value="${Math.round((note.opacity ?? 1) * 100)}" style="flex:1">
          <span class="opacity-value">${Math.round((note.opacity ?? 1) * 100)}%</span>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.position}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">X</span>
            <input type="number" data-prop="x" value="${Math.round(note.x)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">Y</span>
            <input type="number" data-prop="y" value="${Math.round(note.y)}" style="flex:1">
          </div>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.size}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">W</span>
            <input type="number" data-prop="width" value="${Math.round(note.width ?? 150)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">H</span>
            <input type="number" data-prop="height" value="${Math.round(note.height ?? 100)}" style="flex:1">
          </div>
        </div>
      </div>
      ${this.renderLayerButtons()}
      <button class="save-btn" data-action="save">${t.saveProps}</button>
      <button class="delete-btn" data-action="delete">${t.deleteElement}</button>
    `;
    this.bindPropInputs(note.id);
    this.bindLayerButtons(note.id);
    this.bindOpacitySlider();
  }

  private renderScenarioProps(scenario: ScenarioData): void {
    const t = i18n.t;
    this.content.innerHTML = `
      <div class="prop-row">
        <label>${t.title}</label>
        <input type="text" data-prop="title" value="${this.escapeAttr(scenario.title)}">
      </div>
      <div class="prop-row">
        <label>${t.subtitle}</label>
        <input type="text" data-prop="subtitle" value="${this.escapeAttr(scenario.subtitle)}">
      </div>
      <div class="prop-row">
        <label>${t.description}</label>
        <input type="text" data-prop="desc" value="${this.escapeAttr(scenario.desc)}">
      </div>
      <div class="prop-row">
        <label>${t.backgroundColor}</label>
        <input type="color" data-prop="color" value="${scenario.color}">
      </div>
      <div class="prop-row">
        <label>${t.fontSize}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <select data-prop="fontSize" class="font-size-select" style="flex:1;">
            ${[10,11,12,13,14,15,16,18,20,22,24,28,32].map(s =>
              `<option value="${s}" ${(scenario.fontSize ?? 14) === s ? 'selected' : ''}>${s}px</option>`
            ).join('')}
          </select>
          <input type="number" data-prop="fontSize" class="font-size-input" value="${scenario.fontSize ?? 14}" min="8" max="48" style="width:50px;">
        </div>
      </div>
      <div class="prop-row">
        <label>${t.opacity}</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" data-prop="opacity" min="10" max="100" step="10" value="${Math.round((scenario.opacity ?? 1) * 100)}" style="flex:1">
          <span class="opacity-value">${Math.round((scenario.opacity ?? 1) * 100)}%</span>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.position}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">X</span>
            <input type="number" data-prop="x" value="${Math.round(scenario.x)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">Y</span>
            <input type="number" data-prop="y" value="${Math.round(scenario.y)}" style="flex:1">
          </div>
        </div>
      </div>
      <div class="prop-row">
        <label>${t.size}</label>
        <div style="display:flex;gap:8px;">
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">W</span>
            <input type="number" data-prop="width" value="${Math.round(scenario.width ?? 160)}" style="flex:1">
          </div>
          <div style="width:50%;display:flex;align-items:center;gap:4px;">
            <span style="font-size:0.7em;color:#666;width:14px;">H</span>
            <input type="number" data-prop="height" value="${Math.round(scenario.height ?? 100)}" style="flex:1">
          </div>
        </div>
      </div>
      ${this.renderLayerButtons()}
      <button class="save-btn" data-action="save">${t.saveProps}</button>
      <button class="delete-btn" data-action="delete">${t.deleteElement}</button>
    `;
    this.bindPropInputs(scenario.id);
    this.bindLayerButtons(scenario.id);
    this.bindOpacitySlider();
    this.bindFontSizeControls();
  }

  private renderMultiSelection(): void {
    const t = i18n.t;
    const count = this.state.selectedIds.size;
    this.content.innerHTML = `
      <p style="color:#666;font-size:0.85em;text-align:center;padding:20px 0;">
        ${count} ${t.elementsSelected}
      </p>
      <div class="prop-row">
        <label>${t.commonColor}</label>
        <input type="color" data-prop="color" value="#2196f3">
      </div>
      <button class="delete-btn" data-action="delete">${t.deleteAll}</button>
    `;

    // Color change for multiple elements
    const colorInput = this.content.querySelector('[data-prop="color"]') as HTMLInputElement;
    if (colorInput) {
      colorInput.addEventListener('change', () => {
        this.state.selectedIds.forEach(id => {
          const el = this.state.getElement(id);
          if (el && el.type !== 'note') {
            this.state.updateElement(id, { color: colorInput.value });
          }
        });
        this.state.saveToHistory();
      });
    }

    // Delete button
    const deleteBtn = this.content.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.state.deleteSelected();
      });
    }
  }

  private bindPropInputs(elementId: string): void {
    // Property inputs
    this.content.querySelectorAll('[data-prop]').forEach(input => {
      const prop = (input as HTMLElement).dataset.prop!;

      input.addEventListener('change', () => {
        let value: string | number = (input as HTMLInputElement).value;

        // Convert to number for numeric props
        if (['x', 'y', 'width', 'height'].includes(prop)) {
          value = parseFloat(value) || 0;
        }

        // Convert opacity from 10-100 to 0.1-1.0
        if (prop === 'opacity') {
          value = (parseFloat(String(value)) || 100) / 100;
        }

        // Convert fontSize to integer
        if (prop === 'fontSize') {
          value = parseInt(value as string) || 14;
        }

        this.state.updateElementWithHistory(elementId, { [prop]: value });
      });
    });

    // Save button - 모든 속성 저장
    const saveBtn = this.content.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveAllProps(elementId);
      });
    }

    // Delete button
    const deleteBtn = this.content.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        this.state.deleteElement(elementId);
      });
    }
  }

  private saveAllProps(elementId: string): void {
    const updates: Record<string, any> = {};
    const processedProps = new Set<string>(); // Track processed props to avoid duplicates

    this.content.querySelectorAll('[data-prop]').forEach(input => {
      const prop = (input as HTMLElement).dataset.prop!;

      // Skip if already processed (for duplicate props like fontSize)
      if (processedProps.has(prop)) return;
      processedProps.add(prop);

      let value: string | number = (input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

      if (['x', 'y', 'width', 'height'].includes(prop)) {
        value = parseFloat(value) || 0;
      }
      if (prop === 'opacity') {
        // Convert 10-100 range to 0.1-1.0
        value = (parseFloat(String(value)) || 100) / 100;
      }
      if (prop === 'fontSize') {
        // Get value from number input for precision
        const numInput = this.content.querySelector('.font-size-input') as HTMLInputElement;
        value = parseInt(numInput?.value || value as string) || 14;
      }

      updates[prop] = value;
    });

    this.state.updateElementWithHistory(elementId, updates);
  }

  private bindEmojiPicker(elementId: string): void {
    const pickerBtn = this.content.querySelector('[data-action="emoji-picker"]');
    const pickerContainer = this.content.querySelector('.emoji-picker') as HTMLElement;
    const iconInput = this.content.querySelector('[data-prop="icon"]') as HTMLInputElement;

    if (!pickerBtn || !pickerContainer || !iconInput) return;

    // Common emojis for components
    const emojis = [
      '📦', '🖥️', '💾', '🗄️', '☁️', '🌐', '🔧', '⚙️',
      '📊', '📈', '📉', '📁', '📂', '🗂️', '📋', '📝',
      '🔒', '🔓', '🔑', '🛡️', '🔐', '🔏', '🚀', '⚡',
      '💡', '🎯', '🔔', '📡', '🖨️', '💻', '📱', '🖱️',
      '🎨', '🔍', '📍', '🏷️', '⭐', '❤️', '✅', '❌',
      '⚠️', 'ℹ️', '❓', '🔄', '➡️', '⬅️', '⬆️', '⬇️',
      '👤', '👥', '🏢', '🏠', '📧', '📨', '💬', '🗨️'
    ];

    // Render emoji grid
    pickerContainer.innerHTML = `
      <div class="emoji-grid">
        ${emojis.map(e => `<span class="emoji-item">${e}</span>`).join('')}
      </div>
    `;

    // Toggle picker visibility
    pickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = pickerContainer.style.display !== 'none';
      pickerContainer.style.display = isVisible ? 'none' : 'block';
    });

    // Handle emoji selection
    pickerContainer.querySelectorAll('.emoji-item').forEach(item => {
      item.addEventListener('click', () => {
        const emoji = item.textContent || '📦';
        iconInput.value = emoji;
        this.state.updateElementWithHistory(elementId, { icon: emoji });
        pickerContainer.style.display = 'none';
      });
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
      if (!pickerContainer.contains(e.target as Node) && e.target !== pickerBtn) {
        pickerContainer.style.display = 'none';
      }
    });
  }

  private renderLayerButtons(): string {
    const t = i18n.t;
    return `
      <div class="prop-row">
        <label>${t.layer}</label>
        <div class="layer-buttons">
          <button class="layer-btn" data-layer="back" title="${t.sendToBack}">⇤</button>
          <button class="layer-btn" data-layer="backward" title="${t.sendBackward}">←</button>
          <button class="layer-btn" data-layer="forward" title="${t.bringForward}">→</button>
          <button class="layer-btn" data-layer="front" title="${t.bringToFront}">⇥</button>
        </div>
      </div>
    `;
  }

  private bindLayerButtons(elementId: string): void {
    this.content.querySelectorAll('[data-layer]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.layer;
        switch (action) {
          case 'forward':
            this.state.bringForward(elementId);
            break;
          case 'backward':
            this.state.sendBackward(elementId);
            break;
          case 'front':
            this.state.bringToFront(elementId);
            break;
          case 'back':
            this.state.sendToBack(elementId);
            break;
        }
      });
    });
  }

  private bindOpacitySlider(): void {
    const slider = this.content.querySelector('[data-prop="opacity"]') as HTMLInputElement;
    const valueDisplay = this.content.querySelector('.opacity-value');

    if (slider && valueDisplay) {
      slider.addEventListener('input', () => {
        valueDisplay.textContent = `${slider.value}%`;
      });
    }
  }

  private bindFontSizeControls(): void {
    const select = this.content.querySelector('.font-size-select') as HTMLSelectElement;
    const input = this.content.querySelector('.font-size-input') as HTMLInputElement;

    if (select && input) {
      // Sync select -> input
      select.addEventListener('change', () => {
        input.value = select.value;
      });

      // Sync input -> select (update select if value matches an option)
      input.addEventListener('input', () => {
        const val = parseInt(input.value);
        const options = Array.from(select.options);
        const match = options.find(opt => parseInt(opt.value) === val);
        if (match) {
          select.value = match.value;
        } else {
          select.selectedIndex = -1; // Deselect if custom value
        }
      });
    }
  }

  private escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
