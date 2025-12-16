import { State } from './State';
import { DiagramElement, ComponentData, ZoneData, ArrowData, NoteData, ScenarioData, Point, AnchorPosition, ComponentShape } from '../types';

export class Canvas {
  private container: HTMLElement;
  private canvas: HTMLElement;
  private svgLayer: SVGSVGElement;
  private svgOverlay: SVGSVGElement; // 선택된 화살표용 최상단 레이어
  private state: State;
  private resizeHandles: HTMLElement[] = [];
  private renderedLabels: { x: number; y: number; width: number; height: number }[] = [];

  constructor(state: State) {
    this.state = state;
    this.container = document.getElementById('canvasWrapper')!;
    this.canvas = document.getElementById('canvas')!;
    this.svgLayer = document.getElementById('svgLayer') as unknown as SVGSVGElement;
    this.svgOverlay = document.getElementById('svgOverlay') as unknown as SVGSVGElement;

    this.setupCanvas();
    this.bindEvents();
    this.createResizeHandles();
  }

  private setupCanvas(): void {
    this.canvas.style.width = `${this.state.canvasSize.width}px`;
    this.canvas.style.height = `${this.state.canvasSize.height}px`;
    this.canvas.classList.add('grid-visible');
    this.updateTransform();

    // Add arrow markers to SVG
    this.setupArrowMarkers();
  }

  private setupArrowMarkers(): void {
    const colors = ['#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#607d8b', '#ffc107', '#ef5350', '#00bcd4', '#795548', '#666666'];
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    colors.forEach(color => {
      const colorId = color.replace('#', '');

      // 화살표 마커 (끝점용) - 기존
      const arrowEnd = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      arrowEnd.setAttribute('id', `arrow-end-${colorId}`);
      arrowEnd.setAttribute('markerWidth', '10');
      arrowEnd.setAttribute('markerHeight', '10');
      arrowEnd.setAttribute('refX', '9');
      arrowEnd.setAttribute('refY', '3');
      arrowEnd.setAttribute('orient', 'auto');
      arrowEnd.setAttribute('markerUnits', 'strokeWidth');
      const arrowEndPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrowEndPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
      arrowEndPath.setAttribute('fill', color);
      arrowEnd.appendChild(arrowEndPath);
      defs.appendChild(arrowEnd);

      // 화살표 마커 (시작점용) - 반대 방향
      const arrowStart = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      arrowStart.setAttribute('id', `arrow-start-${colorId}`);
      arrowStart.setAttribute('markerWidth', '10');
      arrowStart.setAttribute('markerHeight', '10');
      arrowStart.setAttribute('refX', '0');
      arrowStart.setAttribute('refY', '3');
      arrowStart.setAttribute('orient', 'auto');
      arrowStart.setAttribute('markerUnits', 'strokeWidth');
      const arrowStartPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrowStartPath.setAttribute('d', 'M9,0 L9,6 L0,3 z');
      arrowStartPath.setAttribute('fill', color);
      arrowStart.appendChild(arrowStartPath);
      defs.appendChild(arrowStart);

      // 원형 마커 (끝점용)
      const circleEnd = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      circleEnd.setAttribute('id', `circle-end-${colorId}`);
      circleEnd.setAttribute('markerWidth', '8');
      circleEnd.setAttribute('markerHeight', '8');
      circleEnd.setAttribute('refX', '4');
      circleEnd.setAttribute('refY', '4');
      circleEnd.setAttribute('orient', 'auto');
      circleEnd.setAttribute('markerUnits', 'strokeWidth');
      const circleEndShape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circleEndShape.setAttribute('cx', '4');
      circleEndShape.setAttribute('cy', '4');
      circleEndShape.setAttribute('r', '3');
      circleEndShape.setAttribute('fill', color);
      circleEnd.appendChild(circleEndShape);
      defs.appendChild(circleEnd);

      // 원형 마커 (시작점용)
      const circleStart = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      circleStart.setAttribute('id', `circle-start-${colorId}`);
      circleStart.setAttribute('markerWidth', '8');
      circleStart.setAttribute('markerHeight', '8');
      circleStart.setAttribute('refX', '4');
      circleStart.setAttribute('refY', '4');
      circleStart.setAttribute('orient', 'auto');
      circleStart.setAttribute('markerUnits', 'strokeWidth');
      const circleStartShape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circleStartShape.setAttribute('cx', '4');
      circleStartShape.setAttribute('cy', '4');
      circleStartShape.setAttribute('r', '3');
      circleStartShape.setAttribute('fill', color);
      circleStart.appendChild(circleStartShape);
      defs.appendChild(circleStart);

      // 기존 호환성을 위한 마커 (arrow-{colorId})
      const arrowLegacy = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      arrowLegacy.setAttribute('id', `arrow-${colorId}`);
      arrowLegacy.setAttribute('markerWidth', '10');
      arrowLegacy.setAttribute('markerHeight', '10');
      arrowLegacy.setAttribute('refX', '9');
      arrowLegacy.setAttribute('refY', '3');
      arrowLegacy.setAttribute('orient', 'auto');
      arrowLegacy.setAttribute('markerUnits', 'strokeWidth');
      const arrowLegacyPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrowLegacyPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
      arrowLegacyPath.setAttribute('fill', color);
      arrowLegacy.appendChild(arrowLegacyPath);
      defs.appendChild(arrowLegacy);
    });

    this.svgLayer.appendChild(defs);
  }

  private bindEvents(): void {
    this.state.on('elementsChange', () => this.render());
    this.state.on('selectionChange', () => this.updateSelectionStyles());
    this.state.on('viewChange', () => this.updateTransform());
    this.state.on('gridChange', () => this.updateGridVisibility());
    this.state.on('arrowEditModeChange', () => this.render());
    this.state.on('canvasSizeChange', () => this.updateCanvasSize());
  }

  // 캔버스 크기 변경 시 DOM 업데이트
  private updateCanvasSize(): void {
    this.canvas.style.width = `${this.state.canvasSize.width}px`;
    this.canvas.style.height = `${this.state.canvasSize.height}px`;
    this.updateResizeHandles();
  }

  private updateGridVisibility(): void {
    this.canvas.classList.toggle('grid-visible', this.state.gridVisible);
  }

  updateTransform(): void {
    this.canvas.style.transform = `translate(${this.state.pan.x}px, ${this.state.pan.y}px) scale(${this.state.zoom})`;
  }

  render(): void {
    // Clear existing elements (except SVG defs)
    const existingElements = this.canvas.querySelectorAll('.zone, .component, .note-box, .scenario-box');
    existingElements.forEach(el => el.remove());

    // Clear SVG (keep defs)
    const defs = this.svgLayer.querySelector('defs');
    this.svgLayer.innerHTML = '';
    if (defs) this.svgLayer.appendChild(defs);

    // Clear overlay (선택된 화살표용)
    this.svgOverlay.innerHTML = '';

    // Reset rendered labels for overlap detection
    this.renderedLabels = [];

    // Render elements in order: zones first, then others, arrows last
    const zones: ZoneData[] = [];
    const components: ComponentData[] = [];
    const notes: NoteData[] = [];
    const scenarios: ScenarioData[] = [];
    const arrows: ArrowData[] = [];

    this.state.elements.forEach(el => {
      switch (el.type) {
        case 'zone': zones.push(el); break;
        case 'component': components.push(el); break;
        case 'note': notes.push(el); break;
        case 'scenario': scenarios.push(el); break;
        case 'arrow': arrows.push(el); break;
      }
    });

    zones.forEach(z => this.renderZone(z));
    components.forEach(c => this.renderComponent(c));
    notes.forEach(n => this.renderNote(n));
    scenarios.forEach(s => this.renderScenario(s));

    // 선택되지 않은 화살표는 기본 레이어에
    const unselectedArrows = arrows.filter(a => !this.state.selectedIds.has(a.id));
    const selectedArrows = arrows.filter(a => this.state.selectedIds.has(a.id));

    unselectedArrows.forEach(a => this.renderArrow(a, false, this.svgLayer));

    // 선택된 화살표는 오버레이 레이어에 (최상단)
    selectedArrows.forEach(a => this.renderArrow(a, false, this.svgOverlay));

    // 선택된 화살표의 Endpoint도 오버레이에
    selectedArrows.forEach(a => this.renderArrowEndpoints(a));
  }

  private renderZone(zone: ZoneData): void {
    const el = document.createElement('div');
    el.className = 'zone';
    el.id = zone.id;
    el.dataset.type = 'zone';

    const opacity = zone.opacity ?? 1;
    el.style.left = `${zone.x}px`;
    el.style.top = `${zone.y}px`;
    el.style.width = `${zone.width}px`;
    el.style.height = `${zone.height}px`;
    el.style.borderColor = zone.color;
    // zone은 항상 반투명 배경 유지 (opacity에 따라 0.05~0.3 범위)
    el.style.background = this.hexToRgba(zone.color, 0.05 + (opacity * 0.25));
    el.style.opacity = '1';
    el.style.zIndex = String(zone.zIndex ?? 0);

    el.innerHTML = `
      <span class="zone-label" style="color: ${this.darken(zone.color)}">${zone.label}</span>
      <div class="zone-resize" style="border-color: ${zone.color}"></div>
      <div class="anchor top" data-anchor="top"></div>
      <div class="anchor bottom" data-anchor="bottom"></div>
      <div class="anchor left" data-anchor="left"></div>
      <div class="anchor right" data-anchor="right"></div>
    `;

    if (this.state.selectedIds.has(zone.id)) {
      el.classList.add('selected');
    }

    this.canvas.appendChild(el);
  }

  private renderComponent(comp: ComponentData): void {
    const el = document.createElement('div');
    el.className = 'component';
    el.id = comp.id;
    el.dataset.type = 'component';

    const opacity = comp.opacity ?? 1;
    const fontSize = comp.fontSize ?? 14;
    const width = comp.width ?? 100;
    const height = comp.height ?? 80;
    const shape = comp.shape ?? 'rectangle';

    el.style.left = `${comp.x}px`;
    el.style.top = `${comp.y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.zIndex = String(comp.zIndex ?? 0);

    // 도형별 스타일 적용
    el.dataset.shape = shape;
    el.classList.add(`shape-${shape}`);

    const bgColor = opacity >= 1 ? comp.color : this.hexToRgba(comp.color, 0.1 + (opacity * 0.9));

    // 사용자 지정 텍스트 색상 또는 기본값 (불투명일 때 흰색)
    const textColor = comp.textColor || (opacity >= 1 ? '#ffffff' : this.darken(comp.color));
    const subColor = opacity >= 1 ? 'rgba(255,255,255,0.8)' : '#888';

    // 도형별 SVG 배경 생성
    const shapeSvg = this.createShapeSvg(shape, width, height, bgColor, comp.color);

    // 컴포넌트 너비에 따라 한 줄에 들어갈 글자 수 동적 계산
    const charWidth = fontSize * 0.6;
    const availableWidth = width - 40; // 패딩 제외
    const maxCharsPerLine = Math.max(5, Math.floor(availableWidth / charWidth));

    // 텍스트를 너비에 맞게 줄바꿈
    let displayName = comp.name;
    if (comp.name.length > maxCharsPerLine) {
      const words = comp.name.split(/(?<=[\s-])|(?=[\s-])/); // 공백/하이픈 기준 분리
      let lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + word).length <= maxCharsPerLine) {
          currentLine += word;
        } else {
          if (currentLine) lines.push(currentLine.trim());
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine.trim());

      // 최대 2줄까지만 (넘으면 ... 처리)
      if (lines.length > 2) {
        lines = lines.slice(0, 2);
        lines[1] = lines[1].substring(0, maxCharsPerLine - 3) + '...';
      }
      displayName = lines.join('<br>');
    }

    el.innerHTML = `
      ${shapeSvg}
      <div class="comp-content">
        ${comp.icon ? `<div class="comp-icon">${comp.icon}</div>` : ''}
        <div class="comp-name" style="color: ${textColor}; font-size: ${fontSize}px;">${displayName}</div>
        ${comp.sub ? `<div class="comp-sub" style="color: ${subColor}">${comp.sub}</div>` : ''}
      </div>
      <div class="anchor top" data-anchor="top"></div>
      <div class="anchor bottom" data-anchor="bottom"></div>
      <div class="anchor left" data-anchor="left"></div>
      <div class="anchor right" data-anchor="right"></div>
      <div class="resize-handle-tl" data-resize="tl"></div>
      <div class="resize-handle" data-resize="br"></div>
    `;

    if (this.state.selectedIds.has(comp.id)) {
      el.classList.add('selected');
    }

    this.canvas.appendChild(el);
  }

  private createShapeSvg(shape: ComponentShape, width: number, height: number, fillColor: string, strokeColor: string): string {
    const sw = 2; // stroke width
    // preserveAspectRatio="none"으로 컨테이너 크기에 맞춰 늘어나도록 설정
    switch (shape) {
      case 'triangle':
        return `<svg class="shape-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <polygon points="${width/2},${sw} ${width-sw},${height-sw} ${sw},${height-sw}"
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}"/>
        </svg>`;
      case 'cylinder':
        const ry = height * 0.12; // 타원 높이
        const topY = ry + sw;
        const bottomY = height - ry - sw;
        return `<svg class="shape-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <!-- 원통 본체 -->
          <path d="M ${sw} ${topY}
            L ${sw} ${bottomY}
            A ${width/2 - sw} ${ry} 0 0 0 ${width - sw} ${bottomY}
            L ${width - sw} ${topY}"
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}"/>
          <!-- 아래쪽 타원 -->
          <ellipse cx="${width/2}" cy="${bottomY}" rx="${width/2 - sw}" ry="${ry}"
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}"/>
          <!-- 위쪽 타원 (뚜껑) - 반투명 흰색 오버레이 -->
          <ellipse cx="${width/2}" cy="${topY}" rx="${width/2 - sw}" ry="${ry}"
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}"/>
          <ellipse cx="${width/2}" cy="${topY}" rx="${width/2 - sw}" ry="${ry}"
            fill="rgba(255,255,255,0.3)" stroke="none"/>
        </svg>`;
      case 'star':
        const cx = width / 2, cy = height / 2;
        const outerR = Math.min(width, height) / 2 - sw;
        const innerR = outerR * 0.4;
        let points = '';
        for (let i = 0; i < 5; i++) {
          const outerAngle = (i * 72 - 90) * Math.PI / 180;
          const innerAngle = ((i * 72) + 36 - 90) * Math.PI / 180;
          points += `${cx + outerR * Math.cos(outerAngle)},${cy + outerR * Math.sin(outerAngle)} `;
          points += `${cx + innerR * Math.cos(innerAngle)},${cy + innerR * Math.sin(innerAngle)} `;
        }
        return `<svg class="shape-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <polygon points="${points.trim()}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}"/>
        </svg>`;
      case 'rectangle':
      default:
        return `<svg class="shape-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <rect x="${sw/2}" y="${sw/2}" width="${width-sw}" height="${height-sw}" rx="8" ry="8"
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}"/>
        </svg>`;
    }
  }

  private renderNote(note: NoteData): void {
    const el = document.createElement('div');
    el.className = 'note-box';
    el.id = note.id;
    el.dataset.type = 'note';

    const opacity = note.opacity ?? 1;
    const width = note.width ?? 150;
    const height = note.height ?? 100;

    el.style.left = `${note.x}px`;
    el.style.top = `${note.y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    // 노트는 opacity에 따라 배경 알파 조절, 100%면 완전 불투명 노란색
    el.style.background = opacity >= 1 ? '#fffde7' : this.hexToRgba('#fffde7', 0.3 + (opacity * 0.7));
    el.style.opacity = '1';
    el.style.zIndex = String(note.zIndex ?? 0);

    el.innerHTML = `
      ${note.title ? `<div class="note-title">${note.title}</div>` : ''}
      <div class="note-text">${note.text}</div>
      <div class="resize-handle-tl" data-resize="tl"></div>
      <div class="resize-handle" data-resize="br"></div>
    `;

    if (this.state.selectedIds.has(note.id)) {
      el.classList.add('selected');
    }

    this.canvas.appendChild(el);
  }

  private renderScenario(scenario: ScenarioData): void {
    const el = document.createElement('div');
    el.className = 'scenario-box';
    el.id = scenario.id;
    el.dataset.type = 'scenario';

    const opacity = scenario.opacity ?? 1;
    const width = scenario.width ?? 160;
    const height = scenario.height ?? 100;
    const fontSize = scenario.fontSize ?? 14;

    el.style.left = `${scenario.x}px`;
    el.style.top = `${scenario.y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.opacity = '1';
    el.style.zIndex = String(scenario.zIndex ?? 0);

    // 텍스트 색상은 검정색으로 고정
    const textColor = '#000000';
    const descColor = '#666666';
    const bgColor = opacity >= 1 ? scenario.color : this.hexToRgba(scenario.color, 0.1 + (opacity * 0.9));

    // 2중 테두리: 바깥쪽 배경색 + 갭(흰색/투명) + 안쪽 둥근 점선
    el.innerHTML = `
      <div class="scenario-border-outer" style="background: ${bgColor}; border-color: ${scenario.color}"></div>
      <div class="scenario-border-gap"></div>
      <div class="scenario-border-inner" style="border-color: ${scenario.color}"></div>
      <div class="scenario-content">
        <div class="scenario-title" style="color: ${textColor}; font-size: ${fontSize}px;">${scenario.title}</div>
        <div class="scenario-subtitle" style="color: ${textColor}; font-size: ${Math.max(10, fontSize - 2)}px;">${scenario.subtitle}</div>
        <div class="scenario-desc" style="color: ${descColor}; font-size: ${Math.max(9, fontSize - 4)}px;">${scenario.desc}</div>
      </div>
      <div class="resize-handle-tl" data-resize="tl"></div>
      <div class="resize-handle" data-resize="br"></div>
    `;

    if (this.state.selectedIds.has(scenario.id)) {
      el.classList.add('selected');
    }

    this.canvas.appendChild(el);
  }

  private renderArrow(arrow: ArrowData, _renderEndpoints = true, targetLayer?: SVGSVGElement): void {
    const fromEl = document.getElementById(arrow.from);
    const toEl = document.getElementById(arrow.to);
    if (!fromEl || !toEl) return;

    const layer = targetLayer || this.svgLayer;
    const fromPoint = this.getAnchorPoint(fromEl, arrow.fromAnchor);
    const toPoint = this.getAnchorPoint(toEl, arrow.toAnchor);

    const colorId = arrow.color.replace('#', '');
    const isSelected = this.state.selectedIds.has(arrow.id);
    const inEditMode = this.state.arrowEditMode;

    // Build path with waypoints
    const path = this.buildArrowPath(fromPoint, toPoint, arrow.waypoints);

    // In arrow edit mode, render a wider invisible hit area
    if (inEditMode) {
      const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hitArea.setAttribute('d', path);
      hitArea.setAttribute('stroke', 'transparent');
      hitArea.setAttribute('fill', 'none');
      hitArea.setAttribute('stroke-width', '20');
      hitArea.setAttribute('data-id', arrow.id);
      hitArea.classList.add('arrow-hit-area');
      hitArea.style.cursor = 'pointer';
      hitArea.style.pointerEvents = 'stroke';
      layer.appendChild(hitArea);

      // Visual highlight for edit mode
      const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      highlight.setAttribute('d', path);
      highlight.setAttribute('stroke', isSelected ? '#2196f3' : 'rgba(33, 150, 243, 0.3)');
      highlight.setAttribute('fill', 'none');
      highlight.setAttribute('stroke-width', isSelected ? '6' : '4');
      highlight.setAttribute('stroke-linecap', 'round');
      highlight.style.pointerEvents = 'none';
      layer.appendChild(highlight);
    }

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('stroke', arrow.color);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke-width', '2');

    // 시작점 마커 설정
    const startMarker = arrow.startMarker || 'none';
    if (startMarker === 'arrow') {
      pathEl.setAttribute('marker-start', `url(#arrow-start-${colorId})`);
    } else if (startMarker === 'circle') {
      pathEl.setAttribute('marker-start', `url(#circle-start-${colorId})`);
    }

    // 끝점 마커 설정 (기본값: arrow)
    const endMarker = arrow.endMarker ?? 'arrow';
    if (endMarker === 'arrow') {
      pathEl.setAttribute('marker-end', `url(#arrow-end-${colorId})`);
    } else if (endMarker === 'circle') {
      pathEl.setAttribute('marker-end', `url(#circle-end-${colorId})`);
    }
    // endMarker === 'none'이면 마커 없음

    pathEl.setAttribute('data-id', arrow.id);
    pathEl.classList.add('connection-line');
    pathEl.style.opacity = String(arrow.opacity ?? 1);

    if (arrow.style === 'dashed') {
      pathEl.setAttribute('stroke-dasharray', '6,3');
    }

    if (isSelected) {
      pathEl.classList.add('selected');
    }

    layer.appendChild(pathEl);

    // Render waypoints if selected
    if (isSelected) {
      arrow.waypoints.forEach((wp, index) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(wp.x));
        circle.setAttribute('cy', String(wp.y));
        circle.setAttribute('r', '6');
        circle.classList.add('waypoint');
        circle.setAttribute('data-arrow-id', arrow.id);
        circle.setAttribute('data-waypoint-index', String(index));
        layer.appendChild(circle);
      });
    }

    // Render label
    if (arrow.label) {
      const midPoint = this.getPathMidpoint(fromPoint, toPoint, arrow.waypoints);

      const textWidth = arrow.label.length * 7 + 12;
      const textHeight = 18;

      // Calculate label position with overlap avoidance
      const labelPos = this.findNonOverlappingPosition(
        midPoint.x - textWidth / 2,
        midPoint.y - 9,
        textWidth,
        textHeight
      );

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', String(labelPos.x));
      bg.setAttribute('y', String(labelPos.y));
      bg.setAttribute('width', String(textWidth));
      bg.setAttribute('height', String(textHeight));
      bg.setAttribute('rx', '4');
      bg.setAttribute('fill', 'white');
      bg.setAttribute('stroke', arrow.color);
      bg.setAttribute('stroke-width', '1');
      bg.classList.add('arrow-label-bg');

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(labelPos.x + textWidth / 2));
      text.setAttribute('y', String(labelPos.y + 13));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', arrow.color);
      text.classList.add('arrow-label');
      text.textContent = arrow.label;

      layer.appendChild(bg);
      layer.appendChild(text);

      // Track this label for future overlap detection
      this.renderedLabels.push({ x: labelPos.x, y: labelPos.y, width: textWidth, height: textHeight });
    }
  }

  // Get all element bounding boxes for collision detection
  private getElementBounds(): { x: number; y: number; width: number; height: number }[] {
    const bounds: { x: number; y: number; width: number; height: number }[] = [];

    this.state.elements.forEach(el => {
      if (el.type === 'arrow') return;

      let width = 100, height = 80;
      const pos = el as ComponentData | ZoneData | NoteData | ScenarioData;

      switch (el.type) {
        case 'zone':
          width = (el as ZoneData).width;
          height = (el as ZoneData).height;
          break;
        case 'component':
          width = (el as ComponentData).width ?? 100;
          height = (el as ComponentData).height ?? 80;
          break;
        case 'note':
          width = (el as NoteData).width ?? 150;
          height = (el as NoteData).height ?? 100;
          break;
        case 'scenario':
          width = (el as ScenarioData).width ?? 160;
          height = (el as ScenarioData).height ?? 100;
          break;
      }

      bounds.push({
        x: pos.x,
        y: pos.y,
        width,
        height
      });
    });

    return bounds;
  }

  // Find a non-overlapping position for a label (avoids other labels AND elements)
  private findNonOverlappingPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const labelPadding = 6;  // 라벨 간 간격
    const elementPadding = 15; // 요소와의 간격 (더 넓게)
    const elementBounds = this.getElementBounds();

    // 충돌 체크 함수
    const hasCollision = (testX: number, testY: number): boolean => {
      // 다른 라벨과 충돌 체크
      for (const label of this.renderedLabels) {
        if (testX < label.x + label.width + labelPadding &&
            testX + width + labelPadding > label.x &&
            testY < label.y + label.height + labelPadding &&
            testY + height + labelPadding > label.y) {
          return true;
        }
      }

      // 요소와 충돌 체크 (더 넓은 간격)
      for (const el of elementBounds) {
        if (testX < el.x + el.width + elementPadding &&
            testX + width + elementPadding > el.x &&
            testY < el.y + el.height + elementPadding &&
            testY + height + elementPadding > el.y) {
          return true;
        }
      }

      return false;
    };

    // 위쪽 우선 오프셋 목록 (라벨이 요소 위에 표시되도록)
    const offsets = [
      { x: 0, y: -25 },    // 위쪽 (우선)
      { x: 0, y: -40 },    // 더 위쪽
      { x: 0, y: 0 },      // 원래 위치
      { x: 30, y: -20 },   // 오른쪽 위
      { x: -30, y: -20 },  // 왼쪽 위
      { x: 40, y: 0 },     // 오른쪽
      { x: -40, y: 0 },    // 왼쪽
      { x: 0, y: 25 },     // 아래쪽
      { x: 30, y: 20 },    // 오른쪽 아래
      { x: -30, y: 20 },   // 왼쪽 아래
      { x: 0, y: -60 },    // 훨씬 위쪽
      { x: 60, y: -20 },   // 훨씬 오른쪽 위
      { x: -60, y: -20 },  // 훨씬 왼쪽 위
    ];

    for (const offset of offsets) {
      const testX = x + offset.x;
      const testY = y + offset.y;

      if (!hasCollision(testX, testY)) {
        return { x: testX, y: testY };
      }
    }

    // 모든 위치가 겹치면 위쪽 기본 위치 사용
    return { x, y: y - 25 };
  }

  // Endpoint를 별도로 렌더링 (오버레이 레이어 - 최상단)
  private renderArrowEndpoints(arrow: ArrowData): void {
    const fromEl = document.getElementById(arrow.from);
    const toEl = document.getElementById(arrow.to);
    if (!fromEl || !toEl) return;

    const isSelected = this.state.selectedIds.has(arrow.id);

    // Endpoint는 선택된 화살표에만 표시 (크게!)
    if (!isSelected) return;

    const fromPoint = this.getAnchorPoint(fromEl, arrow.fromAnchor);
    const toPoint = this.getAnchorPoint(toEl, arrow.toAnchor);

    // 선택된 화살표의 endpoint는 매우 크게 (r=16)
    const endpointRadius = 16;

    // From endpoint handle - 오버레이에 렌더링
    const fromHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fromHandle.setAttribute('cx', String(fromPoint.x));
    fromHandle.setAttribute('cy', String(fromPoint.y));
    fromHandle.setAttribute('r', String(endpointRadius));
    fromHandle.classList.add('arrow-endpoint', 'arrow-endpoint-selected');
    fromHandle.setAttribute('data-arrow-id', arrow.id);
    fromHandle.setAttribute('data-endpoint', 'from');
    fromHandle.style.pointerEvents = 'all'; // 클릭 가능하게
    this.svgOverlay.appendChild(fromHandle);

    // To endpoint handle - 오버레이에 렌더링
    const toHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    toHandle.setAttribute('cx', String(toPoint.x));
    toHandle.setAttribute('cy', String(toPoint.y));
    toHandle.setAttribute('r', String(endpointRadius));
    toHandle.classList.add('arrow-endpoint', 'arrow-endpoint-selected');
    toHandle.setAttribute('data-arrow-id', arrow.id);
    toHandle.setAttribute('data-endpoint', 'to');
    toHandle.style.pointerEvents = 'all'; // 클릭 가능하게
    this.svgOverlay.appendChild(toHandle);
  }

  private buildArrowPath(from: Point, to: Point, waypoints: Point[]): string {
    const points = [from, ...waypoints, to];
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }

    return d;
  }

  private getPathMidpoint(from: Point, to: Point, waypoints: Point[]): Point {
    const points = [from, ...waypoints, to];

    if (points.length === 2) {
      return {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2
      };
    }

    // Find middle segment
    const midIndex = Math.floor(points.length / 2);
    return {
      x: (points[midIndex - 1].x + points[midIndex].x) / 2,
      y: (points[midIndex - 1].y + points[midIndex].y) / 2
    };
  }

  getAnchorPoint(element: HTMLElement, anchor: AnchorPosition): Point {
    const rect = element.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();

    const x = (rect.left - canvasRect.left) / this.state.zoom;
    const y = (rect.top - canvasRect.top) / this.state.zoom;
    const width = rect.width / this.state.zoom;
    const height = rect.height / this.state.zoom;

    switch (anchor) {
      case 'top': return { x: x + width / 2, y };
      case 'bottom': return { x: x + width / 2, y: y + height };
      case 'left': return { x, y: y + height / 2 };
      case 'right': return { x: x + width, y: y + height / 2 };
    }
  }

  private updateSelectionStyles(): void {
    // Update zone selection
    this.canvas.querySelectorAll('.zone, .component, .note-box, .scenario-box').forEach(el => {
      el.classList.toggle('selected', this.state.selectedIds.has(el.id));
    });

    // Update arrow selection
    this.svgLayer.querySelectorAll('.connection-line').forEach(el => {
      const id = el.getAttribute('data-id');
      el.classList.toggle('selected', id ? this.state.selectedIds.has(id) : false);
    });

    // Re-render to show/hide waypoints
    this.render();
  }

  // Draw temporary arrow while creating connection
  drawTempArrow(from: Point, to: Point): void {
    this.clearTempArrow();

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
    line.classList.add('temp-arrow');
    line.id = 'temp-arrow';

    this.svgLayer.appendChild(line);
  }

  clearTempArrow(): void {
    const temp = this.svgLayer.querySelector('#temp-arrow');
    if (temp) temp.remove();
  }

  // Draw selection box
  drawSelectionBox(x: number, y: number, width: number, height: number): void {
    this.clearSelectionBox();

    const box = document.createElement('div');
    box.className = 'selection-box';
    box.id = 'selection-box';
    box.style.left = `${Math.min(x, x + width)}px`;
    box.style.top = `${Math.min(y, y + height)}px`;
    box.style.width = `${Math.abs(width)}px`;
    box.style.height = `${Math.abs(height)}px`;

    this.canvas.appendChild(box);
  }

  clearSelectionBox(): void {
    const box = this.canvas.querySelector('#selection-box');
    if (box) box.remove();
  }

  // Coordinate conversion
  screenToCanvas(screenX: number, screenY: number): Point {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (screenX - rect.left - this.state.pan.x) / this.state.zoom,
      y: (screenY - rect.top - this.state.pan.y) / this.state.zoom
    };
  }

  // Utility functions
  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private darken(hex: string): string {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
    return `rgb(${r}, ${g}, ${b})`;
  }

  getCanvas(): HTMLElement {
    return this.canvas;
  }

  getSvgLayer(): SVGSVGElement {
    return this.svgLayer;
  }

  getSvgOverlay(): SVGSVGElement {
    return this.svgOverlay;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  // Canvas resize handles
  private createResizeHandles(): void {
    const handles = ['right', 'bottom', 'corner'];

    handles.forEach(position => {
      const handle = document.createElement('div');
      handle.className = `canvas-resize-handle canvas-resize-${position}`;
      handle.dataset.resize = position;
      this.canvas.appendChild(handle);
      this.resizeHandles.push(handle);
    });

    this.updateResizeHandles();
  }

  updateResizeHandles(): void {
    const width = this.state.canvasSize.width;
    const height = this.state.canvasSize.height;

    this.resizeHandles.forEach(handle => {
      const position = handle.dataset.resize;
      if (position === 'right') {
        handle.style.right = '-4px';
        handle.style.top = '0';
        handle.style.width = '8px';
        handle.style.height = `${height}px`;
      } else if (position === 'bottom') {
        handle.style.bottom = '-4px';
        handle.style.left = '0';
        handle.style.width = `${width}px`;
        handle.style.height = '8px';
      } else if (position === 'corner') {
        handle.style.right = '-6px';
        handle.style.bottom = '-6px';
        handle.style.width = '12px';
        handle.style.height = '12px';
      }
    });
  }

  // Update canvas size
  setCanvasSize(width: number, height: number): void {
    this.state.canvasSize.width = Math.max(400, width);
    this.state.canvasSize.height = Math.max(300, height);
    this.canvas.style.width = `${this.state.canvasSize.width}px`;
    this.canvas.style.height = `${this.state.canvasSize.height}px`;
    this.updateResizeHandles();
    this.state.emit('canvasSizeChange');
  }

  // Check and auto-expand canvas when element moves outside
  checkAutoExpand(element: DiagramElement): void {
    if (element.type === 'arrow') return;

    const el = element as ComponentData | ZoneData | NoteData | ScenarioData;
    const padding = 50; // Padding from edge
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

    const rightEdge = el.x + width + padding;
    const bottomEdge = el.y + height + padding;

    let needsUpdate = false;
    let newWidth = this.state.canvasSize.width;
    let newHeight = this.state.canvasSize.height;

    if (rightEdge > this.state.canvasSize.width) {
      newWidth = Math.ceil(rightEdge / 100) * 100; // Round up to nearest 100
      needsUpdate = true;
    }

    if (bottomEdge > this.state.canvasSize.height) {
      newHeight = Math.ceil(bottomEdge / 100) * 100; // Round up to nearest 100
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.setCanvasSize(newWidth, newHeight);
    }
  }

  // Get nearest anchor position between two elements
  static getNearestAnchor(fromEl: HTMLElement, toEl: HTMLElement): { fromAnchor: AnchorPosition; toAnchor: AnchorPosition } {
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const fromCenter = {
      x: fromRect.left + fromRect.width / 2,
      y: fromRect.top + fromRect.height / 2
    };

    const toCenter = {
      x: toRect.left + toRect.width / 2,
      y: toRect.top + toRect.height / 2
    };

    // Calculate direction from 'from' to 'to'
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;

    let fromAnchor: AnchorPosition;
    let toAnchor: AnchorPosition;

    // Determine anchor based on relative position
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal connection
      if (dx > 0) {
        fromAnchor = 'right';
        toAnchor = 'left';
      } else {
        fromAnchor = 'left';
        toAnchor = 'right';
      }
    } else {
      // Vertical connection
      if (dy > 0) {
        fromAnchor = 'bottom';
        toAnchor = 'top';
      } else {
        fromAnchor = 'top';
        toAnchor = 'bottom';
      }
    }

    return { fromAnchor, toAnchor };
  }
}
