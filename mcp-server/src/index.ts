#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { exec, spawn, ChildProcess } from "child_process";
import { platform } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { promises as fs } from "fs";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EDITOR_DIR = join(__dirname, "..", "..");  // diagram_editor directory
const CACHE_DIR = join(EDITOR_DIR, "cache");  // Session cache directory

// Session types
interface SessionData {
  id: string;
  title: string;
  createdAt: string;
  lastSavedAt: string;
  elements: DiagramElement[];
  canvasSize: { width: number; height: number };
}

interface SessionListItem {
  id: string;
  title: string;
  createdAt: string;
  lastSavedAt: string;
}

// Current session metadata
let currentSessionId: string | null = null;
let currentSessionTitle: string = '';

// Ensure cache directory exists
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Ignore if exists
  }
}

// Generate default session title (date + time)
function getDefaultSessionTitle(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// Generate session ID
function generateSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// Port configuration (from config file)
const EDITOR_PORT = config.editorPort;
const HTTP_PORT = config.httpPort;
const WS_PORT = config.wsPort;

// Editor process management
let editorProcess: ChildProcess | null = null;
const EDITOR_URL = `http://localhost:${EDITOR_PORT}`;

// Types
interface Point {
  x: number;
  y: number;
}

interface Component {
  id: string;
  type: 'component';
  name: string;
  icon: string;
  color: string;
  x: number;
  y: number;
  sub?: string;
}

interface Zone {
  id: string;
  type: 'zone';
  label: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Arrow {
  id: string;
  type: 'arrow';
  from: string;
  fromAnchor: 'top' | 'bottom' | 'left' | 'right';
  to: string;
  toAnchor: 'top' | 'bottom' | 'left' | 'right';
  waypoints: Point[];
  label: string;
  color: string;
  style: 'solid' | 'dashed';
}

interface Note {
  id: string;
  type: 'note';
  title: string;
  text: string;
  x: number;
  y: number;
}

interface Scenario {
  id: string;
  type: 'scenario';
  title: string;
  subtitle: string;
  desc: string;
  color: string;
  x: number;
  y: number;
}

type DiagramElement = Component | Zone | Arrow | Note | Scenario;

interface DiagramData {
  elements: DiagramElement[];
  canvasSize: { width: number; height: number };
}

// State
let diagram: DiagramData = {
  elements: [],
  canvasSize: { width: 1400, height: 900 }
};

let idCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}_${++idCounter}_${Date.now().toString(36)}`;
}

// Calculate component size based on text content
function calculateComponentSize(name: string, sub?: string, fontSize = 14): { width: number; height: number } {
  const charWidth = fontSize * 0.6;
  const lineHeight = fontSize * 1.4;

  // Max characters per line (to keep name within 2 lines)
  const maxCharsPerLine = 20;
  const horizontalPadding = 32; // 패딩 축소

  // Calculate name lines (split if too long)
  const nameLines = Math.ceil(name.length / maxCharsPerLine);
  const effectiveNameLength = Math.min(name.length, maxCharsPerLine);
  const nameWidth = effectiveNameLength * charWidth;

  // Calculate subtitle width
  const subWidth = sub ? Math.min(sub.length, maxCharsPerLine) * charWidth * 0.85 : 0;

  // Width: max of name and sub, plus padding
  const contentWidth = Math.max(nameWidth, subWidth);
  const width = Math.max(80, contentWidth + horizontalPadding);

  // Height: padding + name lines + optional sub
  let height = 36; // 패딩 축소
  height += lineHeight * nameLines;
  if (sub) height += lineHeight * 0.85;
  height = Math.max(60, height);

  return {
    width: Math.ceil(width / 10) * 10, // round to 10px grid
    height: Math.ceil(height / 10) * 10
  };
}

// Calculate note size based on text
function calculateNoteSize(title: string, text: string): { width: number; height: number } {
  const lines = text.split('\n');
  const maxLineLength = Math.max(title.length, ...lines.map(l => l.length));

  const width = Math.max(120, maxLineLength * 8 + 24);
  const height = Math.max(80, (lines.length + (title ? 1 : 0)) * 20 + 40);

  return {
    width: Math.ceil(width / 20) * 20,
    height: Math.ceil(height / 20) * 20
  };
}

// Calculate scenario size based on text
function calculateScenarioSize(title: string, subtitle: string, desc: string, fontSize = 14): { width: number; height: number } {
  const maxLength = Math.max(title.length, subtitle.length, desc.length);
  const width = Math.max(140, maxLength * fontSize * 0.6 + 32);
  const height = Math.max(90, fontSize * 1.4 * 3 + 50);

  return {
    width: Math.ceil(width / 20) * 20,
    height: Math.ceil(height / 20) * 20
  };
}

// Calculate zone size based on components inside
function calculateZoneSizeForComponents(
  components: Array<{ x: number; y: number; width?: number; height?: number }>,
  padding = 40
): { x: number; y: number; width: number; height: number } {
  if (components.length === 0) {
    return { x: 50, y: 50, width: 300, height: 200 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  components.forEach(comp => {
    const w = comp.width || 120;
    const h = comp.height || 80;
    if (comp.x < minX) minX = comp.x;
    if (comp.y < minY) minY = comp.y;
    if (comp.x + w > maxX) maxX = comp.x + w;
    if (comp.y + h > maxY) maxY = comp.y + h;
  });

  return {
    x: minX - padding,
    y: minY - padding - 20, // 라벨 공간 추가
    width: Math.ceil((maxX - minX + padding * 2) / 20) * 20,
    height: Math.ceil((maxY - minY + padding * 2 + 20) / 20) * 20
  };
}

// Calculate best anchors based on element positions - finds nearest face points
function calculateBestAnchors(
  fromElement: Component | Zone | Note | Scenario,
  toElement: Component | Zone | Note | Scenario
): { fromAnchor: 'top' | 'bottom' | 'left' | 'right'; toAnchor: 'top' | 'bottom' | 'left' | 'right' } {
  // Get element sizes
  const fromWidth = (fromElement as any).width || 100;
  const fromHeight = (fromElement as any).height || 80;
  const toWidth = (toElement as any).width || 100;
  const toHeight = (toElement as any).height || 80;

  // Calculate all anchor points for both elements
  type AnchorType = 'top' | 'bottom' | 'left' | 'right';
  const anchors: AnchorType[] = ['top', 'bottom', 'left', 'right'];

  const getAnchorPointLocal = (el: any, w: number, h: number, anchor: AnchorType): Point => {
    switch (anchor) {
      case 'top': return { x: el.x + w / 2, y: el.y };
      case 'bottom': return { x: el.x + w / 2, y: el.y + h };
      case 'left': return { x: el.x, y: el.y + h / 2 };
      case 'right': return { x: el.x + w, y: el.y + h / 2 };
    }
  };

  // Find the pair of anchors with minimum distance
  let minDistance = Infinity;
  let bestFromAnchor: AnchorType = 'right';
  let bestToAnchor: AnchorType = 'left';

  for (const fromAnchor of anchors) {
    const fromPoint = getAnchorPointLocal(fromElement, fromWidth, fromHeight, fromAnchor);

    for (const toAnchor of anchors) {
      const toPoint = getAnchorPointLocal(toElement, toWidth, toHeight, toAnchor);

      // Calculate distance between anchor points
      const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);

      // Prefer opposite-facing anchors (right->left, bottom->top, etc.)
      // Add small penalty for same-direction anchors to prefer clean connections
      const isOpposite =
        (fromAnchor === 'right' && toAnchor === 'left') ||
        (fromAnchor === 'left' && toAnchor === 'right') ||
        (fromAnchor === 'bottom' && toAnchor === 'top') ||
        (fromAnchor === 'top' && toAnchor === 'bottom');

      const adjustedDistance = isOpposite ? distance : distance * 1.2;

      if (adjustedDistance < minDistance) {
        minDistance = adjustedDistance;
        bestFromAnchor = fromAnchor;
        bestToAnchor = toAnchor;
      }
    }
  }

  return { fromAnchor: bestFromAnchor, toAnchor: bestToAnchor };
}

// ========== Arrow Auto-Routing Algorithm ==========

interface ElementBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Get anchor point from element and anchor position
function getAnchorPoint(
  element: { x: number; y: number; width?: number; height?: number },
  anchor: 'top' | 'bottom' | 'left' | 'right'
): Point {
  const width = element.width || 100;
  const height = element.height || 80;

  switch (anchor) {
    case 'top': return { x: element.x + width / 2, y: element.y };
    case 'bottom': return { x: element.x + width / 2, y: element.y + height };
    case 'left': return { x: element.x, y: element.y + height / 2 };
    case 'right': return { x: element.x + width, y: element.y + height / 2 };
  }
}

// Check if a line segment intersects with a rectangle (with padding)
function lineIntersectsRect(
  p1: Point,
  p2: Point,
  rect: ElementBounds,
  padding: number = 20
): boolean {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;

  // Check if line is completely outside the rectangle
  if ((p1.x < left && p2.x < left) || (p1.x > right && p2.x > right)) return false;
  if ((p1.y < top && p2.y < top) || (p1.y > bottom && p2.y > bottom)) return false;

  // Check if either point is inside the rectangle
  const pointInRect = (p: Point) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (pointInRect(p1) || pointInRect(p2)) return true;

  // Check line intersection with each edge
  const lineIntersectsLine = (
    a1: Point, a2: Point, b1: Point, b2: Point
  ): boolean => {
    const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
    if (det === 0) return false;

    const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
    const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;

    return (0 <= lambda && lambda <= 1) && (0 <= gamma && gamma <= 1);
  };

  // Check all four edges
  const edges = [
    [{ x: left, y: top }, { x: right, y: top }],      // top
    [{ x: right, y: top }, { x: right, y: bottom }],  // right
    [{ x: right, y: bottom }, { x: left, y: bottom }],// bottom
    [{ x: left, y: bottom }, { x: left, y: top }]     // left
  ];

  for (const [e1, e2] of edges) {
    if (lineIntersectsLine(p1, p2, e1, e2)) return true;
  }

  return false;
}

// Get all component bounds from diagram (excluding from/to elements and zones)
function getObstacleBounds(excludeIds: string[]): ElementBounds[] {
  const obstacles: ElementBounds[] = [];

  for (const el of diagram.elements) {
    // Skip arrows, zones, and excluded elements
    if (el.type === 'arrow' || el.type === 'zone') continue;
    if (excludeIds.includes(el.id)) continue;

    const width = (el as any).width || 100;
    const height = (el as any).height || 80;

    obstacles.push({
      id: el.id,
      x: (el as any).x,
      y: (el as any).y,
      width,
      height
    });
  }

  return obstacles;
}

// Calculate orthogonal waypoints to avoid obstacles
function calculateAutoWaypoints(
  fromElement: { x: number; y: number; width?: number; height?: number; id?: string },
  toElement: { x: number; y: number; width?: number; height?: number; id?: string },
  fromAnchor: 'top' | 'bottom' | 'left' | 'right',
  toAnchor: 'top' | 'bottom' | 'left' | 'right',
  existingWaypoints?: Point[]
): Point[] {
  // If waypoints already provided, use them
  if (existingWaypoints && existingWaypoints.length > 0) {
    return existingWaypoints;
  }

  const fromPoint = getAnchorPoint(fromElement, fromAnchor);
  const toPoint = getAnchorPoint(toElement, toAnchor);

  // Get obstacles (excluding from/to elements)
  const excludeIds = [fromElement.id, toElement.id].filter(Boolean) as string[];
  const obstacles = getObstacleBounds(excludeIds);

  // Check if direct line intersects any obstacle
  const intersectingObstacles = obstacles.filter(obs =>
    lineIntersectsRect(fromPoint, toPoint, obs, 30) // increased padding
  );

  if (intersectingObstacles.length === 0) {
    // No collision, return empty waypoints (direct line)
    return [];
  }

  // Calculate waypoints to avoid obstacles using orthogonal routing
  const margin = 50; // Increased distance to route around obstacles

  // Find the combined bounding box of ALL obstacles (not just intersecting)
  // This prevents routing through other obstacles
  let allMinX = Infinity, allMinY = Infinity, allMaxX = -Infinity, allMaxY = -Infinity;
  for (const obs of obstacles) {
    allMinX = Math.min(allMinX, obs.x);
    allMinY = Math.min(allMinY, obs.y);
    allMaxX = Math.max(allMaxX, obs.x + obs.width);
    allMaxY = Math.max(allMaxY, obs.y + obs.height);
  }

  // Find the bounding box of intersecting obstacles
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obs of intersectingObstacles) {
    minX = Math.min(minX, obs.x);
    minY = Math.min(minY, obs.y);
    maxX = Math.max(maxX, obs.x + obs.width);
    maxY = Math.max(maxY, obs.y + obs.height);
  }

  // Determine routing direction based on anchor positions
  const isHorizontalStart = fromAnchor === 'left' || fromAnchor === 'right';
  const isHorizontalEnd = toAnchor === 'left' || toAnchor === 'right';

  // Helper: check if a path segment is clear
  const isPathClear = (p1: Point, p2: Point): boolean => {
    return !obstacles.some(obs => lineIntersectsRect(p1, p2, obs, 25));
  };

  // Calculate the best route around obstacles
  const waypoints: Point[] = [];

  if (isHorizontalStart && isHorizontalEnd) {
    // Both horizontal: route above or below
    // Try both routes and pick the shorter clear one
    const aboveY = Math.min(fromPoint.y, toPoint.y, minY - margin);
    const belowY = Math.max(fromPoint.y, toPoint.y, maxY + margin);

    // Calculate which route is shorter/clearer
    const distAbove = Math.abs(fromPoint.y - aboveY) + Math.abs(toPoint.y - aboveY);
    const distBelow = Math.abs(fromPoint.y - belowY) + Math.abs(toPoint.y - belowY);

    const routeY = distAbove <= distBelow ? aboveY : belowY;

    const exitX = fromAnchor === 'right' ? Math.max(fromPoint.x, maxX) + margin : Math.min(fromPoint.x, minX) - margin;
    const entryX = toAnchor === 'left' ? Math.min(toPoint.x, minX) - margin : Math.max(toPoint.x, maxX) + margin;

    if (Math.abs(fromPoint.y - toPoint.y) > 50 || intersectingObstacles.length > 0) {
      waypoints.push({ x: exitX, y: fromPoint.y });
      waypoints.push({ x: exitX, y: routeY });
      waypoints.push({ x: entryX, y: routeY });
      waypoints.push({ x: entryX, y: toPoint.y });
    } else {
      const midX = (fromPoint.x + toPoint.x) / 2;
      waypoints.push({ x: midX, y: fromPoint.y });
      waypoints.push({ x: midX, y: toPoint.y });
    }
  } else if (!isHorizontalStart && !isHorizontalEnd) {
    // Both vertical: route left or right
    const leftX = Math.min(fromPoint.x, toPoint.x, minX - margin);
    const rightX = Math.max(fromPoint.x, toPoint.x, maxX + margin);

    const distLeft = Math.abs(fromPoint.x - leftX) + Math.abs(toPoint.x - leftX);
    const distRight = Math.abs(fromPoint.x - rightX) + Math.abs(toPoint.x - rightX);

    const routeX = distLeft <= distRight ? leftX : rightX;

    const exitY = fromAnchor === 'bottom' ? Math.max(fromPoint.y, maxY) + margin : Math.min(fromPoint.y, minY) - margin;
    const entryY = toAnchor === 'top' ? Math.min(toPoint.y, minY) - margin : Math.max(toPoint.y, maxY) + margin;

    if (Math.abs(fromPoint.x - toPoint.x) > 50 || intersectingObstacles.length > 0) {
      waypoints.push({ x: fromPoint.x, y: exitY });
      waypoints.push({ x: routeX, y: exitY });
      waypoints.push({ x: routeX, y: entryY });
      waypoints.push({ x: toPoint.x, y: entryY });
    } else {
      const midY = (fromPoint.y + toPoint.y) / 2;
      waypoints.push({ x: fromPoint.x, y: midY });
      waypoints.push({ x: toPoint.x, y: midY });
    }
  } else {
    // Mixed: one horizontal, one vertical - L-shaped or complex routing
    if (isHorizontalStart) {
      // Start horizontal, end vertical
      const intermediateX = toPoint.x;
      const intermediateY = fromPoint.y;
      const intermediatePoint = { x: intermediateX, y: intermediateY };

      // Check if intermediate point is blocked
      const intermediateBlocked = !isPathClear(fromPoint, intermediatePoint) ||
        !isPathClear(intermediatePoint, toPoint);

      if (intermediateBlocked) {
        // Route around: calculate best detour
        const goUp = toPoint.y < fromPoint.y;
        const routeY = goUp ? Math.min(minY, fromPoint.y, toPoint.y) - margin : Math.max(maxY, fromPoint.y, toPoint.y) + margin;

        const extendX = fromAnchor === 'right' ? Math.max(fromPoint.x, maxX) + margin : Math.min(fromPoint.x, minX) - margin;

        waypoints.push({ x: extendX, y: fromPoint.y });
        waypoints.push({ x: extendX, y: routeY });
        waypoints.push({ x: toPoint.x, y: routeY });
      } else {
        // Simple L-shape
        waypoints.push({ x: toPoint.x, y: fromPoint.y });
      }
    } else {
      // Start vertical, end horizontal
      const intermediateX = fromPoint.x;
      const intermediateY = toPoint.y;
      const intermediatePoint = { x: intermediateX, y: intermediateY };

      const intermediateBlocked = !isPathClear(fromPoint, intermediatePoint) ||
        !isPathClear(intermediatePoint, toPoint);

      if (intermediateBlocked) {
        // Route around
        const goLeft = toPoint.x < fromPoint.x;
        const routeX = goLeft ? Math.min(minX, fromPoint.x, toPoint.x) - margin : Math.max(maxX, fromPoint.x, toPoint.x) + margin;

        const extendY = fromAnchor === 'bottom' ? Math.max(fromPoint.y, maxY) + margin : Math.min(fromPoint.y, minY) - margin;

        waypoints.push({ x: fromPoint.x, y: extendY });
        waypoints.push({ x: routeX, y: extendY });
        waypoints.push({ x: routeX, y: toPoint.y });
      } else {
        // Simple L-shape
        waypoints.push({ x: fromPoint.x, y: toPoint.y });
      }
    }
  }

  // Final cleanup and validation
  const cleanedWaypoints = cleanupWaypoints(waypoints, fromPoint, toPoint);

  // Verify the path is actually clear, if not, try alternative
  let allClear = true;
  const allPathPoints = [fromPoint, ...cleanedWaypoints, toPoint];
  for (let i = 0; i < allPathPoints.length - 1; i++) {
    if (!isPathClear(allPathPoints[i], allPathPoints[i + 1])) {
      allClear = false;
      break;
    }
  }

  if (!allClear) {
    // Fallback: simple wide detour around all obstacles
    const safeMargin = 60;
    const goAbove = fromPoint.y <= (allMinY + allMaxY) / 2;
    const goLeft = fromPoint.x <= (allMinX + allMaxX) / 2;

    const safeY = goAbove ? allMinY - safeMargin : allMaxY + safeMargin;
    const safeX = goLeft ? allMinX - safeMargin : allMaxX + safeMargin;

    if (isHorizontalStart && isHorizontalEnd) {
      return [
        { x: fromPoint.x, y: safeY },
        { x: toPoint.x, y: safeY }
      ];
    } else if (!isHorizontalStart && !isHorizontalEnd) {
      return [
        { x: safeX, y: fromPoint.y },
        { x: safeX, y: toPoint.y }
      ];
    } else {
      return [
        { x: fromPoint.x + (isHorizontalStart ? (fromAnchor === 'right' ? safeMargin : -safeMargin) : 0), y: fromPoint.y + (!isHorizontalStart ? (fromAnchor === 'bottom' ? safeMargin : -safeMargin) : 0) },
        { x: safeX, y: safeY },
        { x: toPoint.x + (isHorizontalEnd ? (toAnchor === 'right' ? safeMargin : -safeMargin) : 0), y: toPoint.y + (!isHorizontalEnd ? (toAnchor === 'bottom' ? safeMargin : -safeMargin) : 0) }
      ];
    }
  }

  return cleanedWaypoints;
}

// Remove redundant waypoints
function cleanupWaypoints(waypoints: Point[], from: Point, to: Point): Point[] {
  if (waypoints.length === 0) return [];

  const result: Point[] = [];
  const allPoints = [from, ...waypoints, to];

  for (let i = 1; i < allPoints.length - 1; i++) {
    const prev = allPoints[i - 1];
    const curr = allPoints[i];
    const next = allPoints[i + 1];

    // Skip if too close to previous or next
    const distToPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const distToNext = Math.hypot(curr.x - next.x, curr.y - next.y);
    if (distToPrev < 10 || distToNext < 10) continue;

    // Skip if collinear (on same line as prev and next)
    const cross = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);
    if (Math.abs(cross) < 1) continue; // Nearly collinear

    result.push(curr);
  }

  return result;
}

// ========== End Auto-Routing Algorithm ==========

// Server setup
const server = new Server(
  {
    name: "diagram-editor-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "open_editor",
        description: `웹 에디터를 브라우저에서 엽니다. 에디터가 실행 중이 아니면 자동으로 시작합니다.

【자동 시작 기능】
- 웹 에디터(localhost:5173)가 실행 중인지 자동 확인
- 실행 중이 아니면 자동으로 Vite 개발 서버 시작
- 서버가 준비되면 브라우저를 자동으로 엽니다

【중요】
- 다이어그램 작업 시작 전에 이 도구를 먼저 호출하세요.
- MCP로 추가한 요소들이 실시간으로 브라우저에 반영됩니다.
- 사용자가 직접 드래그, 크기 조절, 속성 변경 등을 할 수 있습니다.

【사용 시점】
1. 새 다이어그램 작업 시작 시 (필수)
2. 사용자가 다이어그램을 보고 싶어할 때
3. 수동 편집이 필요할 때`,
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_usage_guide",
        description: `다이어그램 에디터 사용 가이드를 반환합니다.

【시스템 구조】
- MCP 서버: 다이어그램 데이터를 관리하고 도구를 제공
- HTTP API (localhost:3001): 브라우저와 실시간 동기화
- 웹 에디터: HTML 기반 다이어그램 편집기

【실행 방법】
1. MCP 서버 실행: cd mcp-server && npm start
2. 웹 에디터 실행: cd diagram_editor && npm run dev
3. 브라우저에서 http://localhost:5173 접속
4. 또는 open_editor 도구로 자동 열기

【레이아웃 가이드】
- 영역(Zone) 간격: 요소가 많을 때는 Zone 사이에 최소 100px 이상 여백 확보
- 컴포넌트 간격: 가로 180~220px, 세로 120~160px 권장
- 화살표 정리: waypoints를 활용해 겹치는 화살표 분리
  예: {x: 250, y: 150}로 중간점을 추가해 우회 경로 생성
- 컴포넌트 크기: 텍스트 길이에 따라 자동 조절됨

【waypoints 활용 팁】
1. 가로로 긴 경로: waypoints를 수직으로 꺾어 정리
2. 여러 화살표가 겹칠 때: 각 화살표에 다른 y좌표 waypoint 설정
3. 컴포넌트 우회: 중간에 waypoint를 추가해 다른 요소를 피해가기
예시: waypoints: [{x: 200, y: 100}, {x: 200, y: 300}] // 수직으로 꺾기

【파일 구조】
- mcp-server/: MCP 서버 코드
- src/: 웹 에디터 프론트엔드 코드
- JSON 버튼으로 다이어그램 내보내기/가져오기 가능`,
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "create_diagram",
        description: `새 다이어그램을 생성합니다 (기존 다이어그램 초기화).

【사용 예시】
create_diagram({ width: 1600, height: 1000 })

【웹 에디터 연동】
생성 후 웹 에디터(localhost:5173)에서 실시간으로 확인 가능합니다.
JSON 버튼 → 가져오기로 get_diagram 결과를 붙여넣어도 됩니다.`,
        inputSchema: {
          type: "object",
          properties: {
            width: { type: "number", description: "캔버스 너비 (기본값: 1400)" },
            height: { type: "number", description: "캔버스 높이 (기본값: 900)" }
          }
        }
      },
      {
        name: "add_component",
        description: `다이어그램에 컴포넌트(박스)를 추가합니다.

【자동 크기 조절】
- 이름(name)과 부제목(sub) 길이에 따라 컴포넌트 크기가 자동 계산됩니다.
- 이름이 20자를 초과하면 2줄로 표시되고 컴포넌트 높이가 자동 증가합니다.
- width/height를 직접 지정하면 자동 계산을 무시합니다.

【좌표 가이드 - 화살표 공간 확보 필수!】
- 좌측 상단이 (0, 0)
- ⚠️ 최소 간격: 가로 250px, 세로 180px (화살표 라벨 공간)
- 권장 간격: 가로 300px, 세로 200px
- 컴포넌트 너비: 약 120~180px, 높이: 약 80~100px

【색상 가이드 - 비슷한 요소끼리 통일!】
- 프론트엔드/클라이언트: #2196f3 (파랑)
- 백엔드/API 서버: #4caf50 (초록)
- 데이터베이스/저장소: #9c27b0 (보라)
- 캐시/메모리: #00bcd4 (청록)
- 메시지큐/이벤트: #ff9800 (주황)
- 인증/보안: #f44336 (빨강)
- 외부 서비스: #607d8b (회색)
- 모니터링/로깅: #795548 (갈색)

【사용 예시】
add_component({ name: "웹서버", x: 100, y: 100, color: "#4caf50" })
add_component({ name: "PostgreSQL", x: 300, y: 100, sub: "Primary", color: "#9c27b0" })
add_component({ name: "Redis Cache", x: 500, y: 100, color: "#00bcd4" })

【아이콘 (선택)】
필요한 경우에만 icon 파라미터로 이모지 추가:
🌐 웹, 📱 모바일, ⚙️ 서버, 🗄️ DB, 🔐 인증, ⚡ 캐시, 📬 큐, 💾 스토리지`,
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "컴포넌트 이름" },
            icon: { type: "string", description: "이모지 아이콘" },
            x: { type: "number", description: "X 좌표 (0부터 시작, 우측으로 증가)" },
            y: { type: "number", description: "Y 좌표 (0부터 시작, 아래로 증가)" },
            color: { type: "string", description: "배경색 (hex, 예: #2196f3)" },
            sub: { type: "string", description: "부제목 (선택)" },
            width: { type: "number", description: "너비 (생략시 텍스트 기준 자동 계산)" },
            height: { type: "number", description: "높이 (생략시 텍스트 기준 자동 계산)" },
            fontSize: { type: "number", description: "글자 크기 (기본값: 14)" }
          },
          required: ["name", "x", "y"]
        }
      },
      {
        name: "add_zone",
        description: `영역(Zone)을 추가합니다. 컴포넌트들을 그룹화하는 점선 박스입니다.

【자동 크기 계산 기능】
- containsIds 파라미터에 컴포넌트 ID 배열을 넣으면 자동으로 크기/위치 계산
- 내부 컴포넌트들을 모두 포함하는 최적 크기로 설정됨
- x, y, width, height를 직접 지정하면 자동 계산 무시

【배치 팁】
- Zone은 컴포넌트 뒤에 배치됨 (자동으로 맨 아래 레이어)
- 내부 여백: 컴포넌트 주변 40px 자동 확보
- Zone 간 간격: 100px 이상 여유 두기

【수동 크기 계산 공식】
- width = (컴포넌트 수 * 250) + 80
- height = (행 수 * 180) + 80

【사용 예시】
// 자동 크기 계산
add_zone({ label: "프론트엔드", containsIds: ["comp_1", "comp_2"] })

// 수동 지정
add_zone({ label: "백엔드", x: 400, y: 50, width: 450, height: 350, color: "#4caf50" })`,
        inputSchema: {
          type: "object",
          properties: {
            label: { type: "string", description: "영역 라벨 (좌측 상단에 표시)" },
            x: { type: "number", description: "X 좌표 (containsIds 사용 시 생략 가능)" },
            y: { type: "number", description: "Y 좌표 (containsIds 사용 시 생략 가능)" },
            width: { type: "number", description: "너비 (containsIds 사용 시 생략 가능)" },
            height: { type: "number", description: "높이 (containsIds 사용 시 생략 가능)" },
            color: { type: "string", description: "테두리/라벨 색상 (hex)" },
            containsIds: {
              type: "array",
              items: { type: "string" },
              description: "내부에 포함될 컴포넌트 ID 배열 (자동 크기 계산)"
            },
            padding: { type: "number", description: "내부 여백 (기본값: 40)" }
          },
          required: ["label"]
        }
      },
      {
        name: "add_arrow",
        description: `두 컴포넌트를 화살표로 연결합니다.

【자동 앵커 선택】
- fromAnchor/toAnchor를 생략하면 두 요소의 위치에 따라 자동으로 최적의 방향이 선택됩니다.
- 컴포넌트 사이의 가장 가까운 면을 자동으로 선택
- 다른 컴포넌트를 피해 자동으로 경로 계산

【화살표 마커 스타일】
- startMarker: 시작점 모양 (none: ─, arrow: ◀─, circle: ●─)
- endMarker: 끝점 모양 (none: ─, arrow: ─▶, circle: ─●)

★ 상황별 추천 스타일:
- 일반 데이터 흐름: startMarker: "none", endMarker: "arrow" (기본값)
- 양방향 통신: startMarker: "arrow", endMarker: "arrow"
- 연관 관계: startMarker: "circle", endMarker: "circle"
- 의존성: startMarker: "none", endMarker: "arrow", style: "dashed"
- 이벤트/신호: startMarker: "circle", endMarker: "arrow"

【선 스타일】
- solid: 실선 (일반 연결, 데이터 흐름)
- dashed: 점선 (옵션, 비동기, 의존성)

【사용 예시】
add_arrow({ from: "comp_1", to: "comp_2", label: "API 호출" })
add_arrow({ from: "comp_1", to: "comp_2", label: "양방향", startMarker: "arrow", endMarker: "arrow" })
add_arrow({ from: "comp_1", to: "comp_2", label: "의존성", style: "dashed" })
add_arrow({ from: "comp_1", to: "comp_2", label: "이벤트", startMarker: "circle", endMarker: "arrow" })`,
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string", description: "시작 컴포넌트 ID" },
            fromAnchor: { type: "string", enum: ["top", "bottom", "left", "right"], description: "시작점 위치 (생략 시 자동)" },
            to: { type: "string", description: "끝 컴포넌트 ID" },
            toAnchor: { type: "string", enum: ["top", "bottom", "left", "right"], description: "끝점 위치 (생략 시 자동)" },
            label: { type: "string", description: "화살표 위에 표시할 텍스트" },
            color: { type: "string", description: "화살표 색상 (hex)" },
            style: { type: "string", enum: ["solid", "dashed"], description: "solid: 실선, dashed: 점선 (기본: solid)" },
            startMarker: { type: "string", enum: ["none", "arrow", "circle"], description: "시작점 모양 (기본: none)" },
            endMarker: { type: "string", enum: ["none", "arrow", "circle"], description: "끝점 모양 (기본: arrow)" },
            waypoints: {
              type: "array",
              items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
              description: "꺾는점 좌표 배열 (자동 계산됨, 수동 지정 시 우선)"
            }
          },
          required: ["from", "to"]
        }
      },
      {
        name: "add_note",
        description: `노란색 메모 박스를 추가합니다. 설명이나 주석용으로 사용합니다.

【사용 예시】
add_note({ title: "참고", text: "• 인증 필요\\n• Rate limit: 100/분", x: 400, y: 100 })`,
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "노트 제목" },
            text: { type: "string", description: "노트 내용 (줄바꿈: \\n)" },
            x: { type: "number", description: "X 좌표" },
            y: { type: "number", description: "Y 좌표" }
          },
          required: ["text", "x", "y"]
        }
      },
      {
        name: "add_scenario",
        description: `시나리오 박스를 추가합니다. 플로우 설명이나 범례로 사용합니다.

【사용 예시】
add_scenario({ title: "시나리오 1", subtitle: "로그인 흐름", desc: "파란 화살표", x: 50, y: 400, color: "#667eea" })`,
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "시나리오 제목" },
            subtitle: { type: "string", description: "부제목" },
            desc: { type: "string", description: "설명" },
            x: { type: "number", description: "X 좌표" },
            y: { type: "number", description: "Y 좌표" },
            color: { type: "string", description: "배경색 (hex)" }
          },
          required: ["title", "x", "y"]
        }
      },
      {
        name: "remove_element",
        description: "다이어그램에서 요소를 제거합니다. 연결된 화살표도 함께 제거됩니다.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "제거할 요소의 ID (list_elements로 확인)" }
          },
          required: ["id"]
        }
      },
      {
        name: "update_element",
        description: `기존 요소의 속성을 업데이트합니다.

【사용 예시】
update_element({ id: "comp_1", updates: { name: "새이름", color: "#ff0000", x: 200 } })
update_element({ id: "comp_1", updates: { width: 200, height: 120 } })`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "업데이트할 요소의 ID" },
            updates: {
              type: "object",
              description: "변경할 속성들 (name, color, x, y, width, height 등)"
            }
          },
          required: ["id", "updates"]
        }
      },
      {
        name: "resize_element",
        description: `요소의 크기를 조절합니다.

【지원 요소】
- component: 컴포넌트 박스
- zone: 영역
- note: 메모
- scenario: 시나리오 박스

【사용 예시】
resize_element({ id: "comp_1", width: 200, height: 120 })
resize_element({ id: "zone_1", width: 400, height: 300 })`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "크기를 조절할 요소의 ID" },
            width: { type: "number", description: "새 너비 (픽셀)" },
            height: { type: "number", description: "새 높이 (픽셀)" }
          },
          required: ["id"]
        }
      },
      {
        name: "get_diagram",
        description: `현재 다이어그램의 JSON 데이터를 반환합니다.

【웹 에디터 연동】
이 JSON을 웹 에디터의 "가져오기" 버튼으로 붙여넣으면 다이어그램을 볼 수 있습니다.
웹 에디터 주소: http://localhost:5173`,
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "load_diagram",
        description: `JSON 데이터로 다이어그램을 로드합니다.

【사용법】
웹 에디터에서 "JSON" 버튼으로 내보낸 JSON을 여기에 입력하면 됩니다.`,
        inputSchema: {
          type: "object",
          properties: {
            data: { type: "string", description: "다이어그램 JSON 문자열" }
          },
          required: ["data"]
        }
      },
      {
        name: "list_elements",
        description: "현재 다이어그램의 모든 요소 ID와 타입을 반환합니다. 화살표 연결이나 삭제 시 ID 확인용으로 사용합니다.",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["component", "zone", "arrow", "note", "scenario"],
              description: "특정 타입만 필터링 (선택)"
            }
          }
        }
      },
      {
        name: "generate_architecture",
        description: `텍스트 설명을 기반으로 아키텍처 다이어그램을 자동 생성합니다.

【인식되는 키워드】
frontend, backend, api, database, db, auth, cache, queue, storage, client, browser, mobile, server, gateway, load

【사용 예시】
generate_architecture({ description: "프론트엔드, 백엔드 API, 데이터베이스로 구성된 웹 애플리케이션" })`,
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "아키텍처 설명"
            }
          },
          required: ["description"]
        }
      },
      {
        name: "set_session_title",
        description: `현재 세션의 제목을 설정합니다.

【사용 목적】
- LLM이 다이어그램 내용을 분석하여 적절한 제목 자동 생성
- 사용자가 수동으로 제목을 설정할 때도 사용 가능

【제목 생성 가이드라인】
- 간결하고 명확하게 (최대 50자)
- 다이어그램의 핵심 내용을 반영
- 예: "마이크로서비스 아키텍처", "로그인 흐름 시퀀스"

【사용 예시】
set_session_title({ title: "E-commerce 시스템 아키텍처" })`,
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "세션 제목 (최대 50자)"
            }
          },
          required: ["title"]
        }
      },
      {
        name: "build_diagram",
        description: `한 번의 호출로 전체 다이어그램을 구축합니다. 가장 효율적인 방법!

【색상 가이드 - 비슷한 요소끼리 통일!】
- 프론트엔드/클라이언트: #2196f3 (파랑)
- 백엔드/API 서버: #4caf50 (초록)
- 데이터베이스/저장소: #9c27b0 (보라)
- 캐시/메모리: #00bcd4 (청록)
- 메시지큐/이벤트: #ff9800 (주황)
- 인증/보안: #f44336 (빨강)
- 외부 서비스: #607d8b (회색)

【Zone 자동 크기 계산】
containsIndices에 컴포넌트 인덱스 배열을 넣으면 자동으로 해당 컴포넌트들을 포함하는 크기로 계산됩니다.
zones: [
  { label: "Frontend", containsIndices: [0, 1], color: "#2196f3" },  // 0, 1번 컴포넌트 포함
  { label: "Backend", containsIndices: [2, 3, 4], color: "#4caf50" }  // 2, 3, 4번 컴포넌트 포함
]

【사용 예시】
build_diagram({
  zones: [
    { label: "Frontend", containsIndices: [0], color: "#2196f3" },  // 자동 크기
    { label: "Backend", x: 400, y: 50, width: 400, height: 350, color: "#4caf50" }  // 수동 크기
  ],
  components: [
    { name: "React App", x: 100, y: 100, color: "#2196f3" },
    { name: "API Server", x: 450, y: 100, color: "#4caf50" },
    { name: "PostgreSQL", x: 450, y: 280, color: "#9c27b0" }
  ],
  arrows: [
    { from: 0, to: 1, label: "REST" },
    { from: 1, to: 2, label: "Query" }
  ]
})

【arrows 연결 방식】
- from/to에 컴포넌트 인덱스 사용 (0부터 시작)
- 자동으로 최적 앵커 선택

【⚠️ 필수: waypoints로 선 정리!】
화살표가 3개 이상이면 반드시 waypoints로 정리하세요:
arrows: [
  { from: 0, to: 1, label: "직선" },
  { from: 0, to: 2, waypoints: [{x: 200, y: 300}] },
  { from: 1, to: 3, waypoints: [{x: 500, y: 150}, {x: 500, y: 350}] }
]

★ 여러 화살표 분리: 각각 다른 Y좌표 waypoint 사용
★ 컴포넌트 우회: 중간 지점에 waypoint 추가
★ ㄱ자/ㄴ자 경로: 2개 waypoint로 직각 꺾기`,
        inputSchema: {
          type: "object",
          properties: {
            width: { type: "number", description: "캔버스 너비 (기본값: 1400)" },
            height: { type: "number", description: "캔버스 높이 (기본값: 900)" },
            zones: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  x: { type: "number", description: "X 좌표 (containsIndices 사용 시 생략 가능)" },
                  y: { type: "number", description: "Y 좌표 (containsIndices 사용 시 생략 가능)" },
                  width: { type: "number", description: "너비 (containsIndices 사용 시 생략 가능)" },
                  height: { type: "number", description: "높이 (containsIndices 사용 시 생략 가능)" },
                  color: { type: "string" },
                  containsIndices: {
                    type: "array",
                    items: { type: "number" },
                    description: "포함할 컴포넌트 인덱스 배열 (자동 크기 계산)"
                  },
                  padding: { type: "number", description: "내부 여백 (기본값: 40)" }
                },
                required: ["label"]
              }
            },
            components: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  x: { type: "number" },
                  y: { type: "number" },
                  icon: { type: "string" },
                  color: { type: "string" },
                  sub: { type: "string" }
                },
                required: ["name", "x", "y"]
              }
            },
            arrows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "number", description: "시작 컴포넌트 인덱스" },
                  to: { type: "number", description: "끝 컴포넌트 인덱스" },
                  label: { type: "string" },
                  color: { type: "string" },
                  style: { type: "string", enum: ["solid", "dashed"] },
                  waypoints: {
                    type: "array",
                    items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
                    description: "꺾는점 좌표 배열 - 선 정리에 필수!"
                  }
                },
                required: ["from", "to"]
              }
            },
            notes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  text: { type: "string" },
                  x: { type: "number" },
                  y: { type: "number" }
                },
                required: ["text", "x", "y"]
              }
            }
          }
        }
      }
    ]
  };
});

// Helper function to open URL in browser
function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const os = platform();
    let command: string;

    if (os === 'darwin') {
      command = `open "${url}"`;
    } else if (os === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// Check if editor is running
function isEditorRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: EDITOR_PORT,
      path: '/',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// Start the web editor
function startEditor(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (editorProcess) {
      resolve();
      return;
    }

    // Use shell: true to inherit PATH and find npm/npx properly
    const isWin = platform() === 'win32';
    const command = isWin ? 'npx.cmd' : 'npx';

    // IMPORTANT: Use 'ignore' for stdio to avoid EPIPE errors with MCP's stdio
    editorProcess = spawn(command, ['vite', '--port', String(EDITOR_PORT)], {
      cwd: EDITOR_DIR,
      stdio: 'ignore',  // Completely ignore stdio to avoid MCP conflicts
      shell: true,
      detached: true,   // Detach process so it runs independently
      env: { ...process.env }
    });

    // Unref so the parent process can exit independently
    editorProcess.unref();

    editorProcess.on('error', (err) => {
      editorProcess = null;
      reject(err);
    });

    // Since we can't listen to stdout, poll the server instead
    let attempts = 0;
    const maxAttempts = 30;

    const checkServer = () => {
      attempts++;

      const req = http.request({
        hostname: 'localhost',
        port: EDITOR_PORT,
        path: '/',
        method: 'GET',
        timeout: 1000
      }, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(checkServer, 1000);
        } else {
          reject(new Error('Editor did not respond with 200'));
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(checkServer, 1000);
        } else {
          reject(new Error('Editor startup timeout'));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(checkServer, 1000);
        } else {
          reject(new Error('Editor startup timeout'));
        }
      });

      req.end();
    };

    // Start checking after a brief delay
    setTimeout(checkServer, 2000);
  });
}

// Ensure editor is running and open browser
async function ensureEditorAndOpen(): Promise<{ success: boolean; message: string }> {
  try {
    const running = await isEditorRunning();

    if (!running) {
      await startEditor();
    }

    await openBrowser(EDITOR_URL);

    return {
      success: true,
      message: running
        ? '기존 웹 에디터에 연결되었습니다.'
        : '웹 에디터가 자동으로 시작되었습니다.'
    };
  } catch (error) {
    return {
      success: false,
      message: `에디터 시작 실패: ${error}`
    };
  }
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "open_editor": {
      const result = await ensureEditorAndOpen();

      if (result.success) {
        return {
          content: [{
            type: "text",
            text: `✅ ${result.message}

【에디터 URL】 ${EDITOR_URL}

【사용 방법】
- MCP로 추가한 요소들이 실시간으로 반영됩니다.
- 요소를 드래그하여 위치 조정 가능
- 요소 선택 후 우측 패널에서 속성 변경
- 화살표 편집 모드(✏️)로 연결선 수정

【동기화】
웹 에디터에서 수정한 내용은 MCP 서버와 자동 동기화됩니다.`
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: `❌ ${result.message}

수동으로 다음 명령어를 실행해주세요:
cd ${EDITOR_DIR} && npm run dev

그 후 브라우저에서 ${EDITOR_URL} 를 열어주세요.`
          }]
        };
      }
    }

    case "create_diagram": {
      // 로딩 시작 알림
      notifyLoadingStart();

      // 새 세션 생성
      currentSessionId = generateSessionId();
      currentSessionTitle = getDefaultSessionTitle();

      diagram = {
        elements: [],
        canvasSize: {
          width: (args?.width as number) || 1400,
          height: (args?.height as number) || 900
        }
      };
      idCounter = 0;

      // 세션 저장 및 클라이언트에 알림
      await saveDiagramToCache();
      notifyClientsWithSession();
      notifySessionListChange();

      // 로딩 완료 알림
      notifyLoadingEnd();

      return {
        content: [{
          type: "text",
          text: `새 다이어그램이 생성되었습니다. 캔버스 크기: ${diagram.canvasSize.width}x${diagram.canvasSize.height}
세션 ID: ${currentSessionId}

💡 open_editor 도구로 브라우저에서 실시간 편집 화면을 열 수 있습니다.`
        }]
      };
    }

    case "add_component": {
      const name = args?.name as string || "Component";
      const sub = args?.sub as string;
      const fontSize = args?.fontSize as number || 14;
      const size = calculateComponentSize(name, sub, fontSize);

      const component: Component & { width?: number; height?: number; fontSize?: number } = {
        id: generateId("comp"),
        type: "component",
        name,
        icon: args?.icon as string || "",
        color: args?.color as string || "#2196f3",
        x: args?.x as number || 100,
        y: args?.y as number || 100,
        sub,
        width: args?.width as number || size.width,
        height: args?.height as number || size.height,
        fontSize
      };
      diagram.elements.push(component as Component);
      notifyClients();
      return {
        content: [{
          type: "text",
          text: `컴포넌트가 추가되었습니다. ID: ${component.id}, 이름: ${component.name}, 크기: ${component.width}x${component.height}`
        }]
      };
    }

    case "add_zone": {
      const containsIds = args?.containsIds as string[] | undefined;
      const padding = args?.padding as number || 40;

      let x = args?.x as number | undefined;
      let y = args?.y as number | undefined;
      let width = args?.width as number | undefined;
      let height = args?.height as number | undefined;

      // 자동 크기 계산
      if (containsIds && containsIds.length > 0) {
        const containedComponents = diagram.elements.filter(el =>
          containsIds.includes(el.id) && el.type !== 'arrow'
        ).map(el => ({
          x: (el as Component | Zone | Note | Scenario).x,
          y: (el as Component | Zone | Note | Scenario).y,
          width: (el as any).width,
          height: (el as any).height
        }));

        if (containedComponents.length > 0) {
          const autoSize = calculateZoneSizeForComponents(containedComponents, padding);
          if (x === undefined) x = autoSize.x;
          if (y === undefined) y = autoSize.y;
          if (width === undefined) width = autoSize.width;
          if (height === undefined) height = autoSize.height;
        }
      }

      const zone: Zone = {
        id: generateId("zone"),
        type: "zone",
        label: args?.label as string || "Zone",
        color: args?.color as string || "#2196f3",
        x: x ?? 50,
        y: y ?? 50,
        width: width ?? 200,
        height: height ?? 150
      };
      diagram.elements.unshift(zone); // 영역은 맨 아래에
      notifyClients();
      return {
        content: [{
          type: "text",
          text: `영역이 추가되었습니다. ID: ${zone.id}, 라벨: ${zone.label}, 크기: ${zone.width}x${zone.height}`
        }]
      };
    }

    case "add_arrow": {
      const fromId = args?.from as string;
      const toId = args?.to as string;

      // Find the elements to calculate best anchors
      const fromElement = diagram.elements.find(el => el.id === fromId) as Component | Zone | Note | Scenario | undefined;
      const toElement = diagram.elements.find(el => el.id === toId) as Component | Zone | Note | Scenario | undefined;

      let fromAnchor = args?.fromAnchor as Arrow['fromAnchor'];
      let toAnchor = args?.toAnchor as Arrow['toAnchor'];

      // Auto-calculate anchors if not provided and elements exist
      if ((!fromAnchor || !toAnchor) && fromElement && toElement) {
        const bestAnchors = calculateBestAnchors(fromElement, toElement);
        if (!fromAnchor) fromAnchor = bestAnchors.fromAnchor;
        if (!toAnchor) toAnchor = bestAnchors.toAnchor;
      }

      // Auto-calculate waypoints to avoid obstacles (if not provided)
      const providedWaypoints = args?.waypoints as Point[] | undefined;
      let calculatedWaypoints: Point[] = [];

      if (fromElement && toElement) {
        const fromWithId = { ...fromElement, id: fromId, width: (fromElement as any).width || 100, height: (fromElement as any).height || 80 };
        const toWithId = { ...toElement, id: toId, width: (toElement as any).width || 100, height: (toElement as any).height || 80 };
        calculatedWaypoints = calculateAutoWaypoints(
          fromWithId,
          toWithId,
          fromAnchor || "right",
          toAnchor || "left",
          providedWaypoints
        );
      }

      const arrow: Arrow = {
        id: generateId("arrow"),
        type: "arrow",
        from: fromId,
        fromAnchor: fromAnchor || "right",
        to: toId,
        toAnchor: toAnchor || "left",
        waypoints: calculatedWaypoints,
        label: args?.label as string || "",
        color: args?.color as string || "#2196f3",
        style: (args?.style as Arrow['style']) || "solid"
      };
      diagram.elements.push(arrow);
      notifyClients();
      return {
        content: [{
          type: "text",
          text: `화살표가 추가되었습니다. ID: ${arrow.id}, ${arrow.from}(${arrow.fromAnchor}) → ${arrow.to}(${arrow.toAnchor})${calculatedWaypoints.length > 0 ? ` (자동 우회 경로: ${calculatedWaypoints.length}개 지점)` : ''}`
        }]
      };
    }

    case "add_note": {
      const title = args?.title as string || "";
      const text = args?.text as string || "";
      const size = calculateNoteSize(title, text);

      const note: Note & { width?: number; height?: number } = {
        id: generateId("note"),
        type: "note",
        title,
        text,
        x: args?.x as number || 100,
        y: args?.y as number || 100,
        width: args?.width as number || size.width,
        height: args?.height as number || size.height
      };
      diagram.elements.push(note as Note);
      notifyClients();
      return {
        content: [{
          type: "text",
          text: `노트가 추가되었습니다. ID: ${note.id}, 크기: ${note.width}x${note.height}`
        }]
      };
    }

    case "add_scenario": {
      const title = args?.title as string || "Scenario";
      const subtitle = args?.subtitle as string || "";
      const desc = args?.desc as string || "";
      const fontSize = args?.fontSize as number || 14;
      const size = calculateScenarioSize(title, subtitle, desc, fontSize);

      const scenario: Scenario & { width?: number; height?: number; fontSize?: number } = {
        id: generateId("scenario"),
        type: "scenario",
        title,
        subtitle,
        desc,
        color: args?.color as string || "#667eea",
        x: args?.x as number || 100,
        y: args?.y as number || 100,
        width: args?.width as number || size.width,
        height: args?.height as number || size.height,
        fontSize
      };
      diagram.elements.push(scenario as Scenario);
      notifyClients();
      return {
        content: [{
          type: "text",
          text: `시나리오가 추가되었습니다. ID: ${scenario.id}`
        }]
      };
    }

    case "remove_element": {
      const id = args?.id as string;
      const index = diagram.elements.findIndex(el => el.id === id);
      if (index === -1) {
        return {
          content: [{ type: "text", text: `요소를 찾을 수 없습니다: ${id}` }]
        };
      }
      // 화살표 연결도 제거
      diagram.elements = diagram.elements.filter(el => {
        if (el.type === "arrow") {
          return el.from !== id && el.to !== id;
        }
        return el.id !== id;
      });
      notifyClients();
      return {
        content: [{ type: "text", text: `요소가 제거되었습니다: ${id}` }]
      };
    }

    case "update_element": {
      const id = args?.id as string;
      const updates = args?.updates as Record<string, unknown>;
      const element = diagram.elements.find(el => el.id === id);
      if (!element) {
        return {
          content: [{ type: "text", text: `요소를 찾을 수 없습니다: ${id}` }]
        };
      }
      Object.assign(element, updates);
      notifyClients();
      return {
        content: [{ type: "text", text: `요소가 업데이트되었습니다: ${id}` }]
      };
    }

    case "resize_element": {
      const id = args?.id as string;
      const width = args?.width as number | undefined;
      const height = args?.height as number | undefined;

      const element = diagram.elements.find(el => el.id === id);
      if (!element) {
        return {
          content: [{ type: "text", text: `요소를 찾을 수 없습니다: ${id}` }]
        };
      }

      if (element.type === 'arrow') {
        return {
          content: [{ type: "text", text: `화살표는 크기 조절이 불가능합니다: ${id}` }]
        };
      }

      const updates: Record<string, number> = {};
      if (width !== undefined) updates.width = width;
      if (height !== undefined) updates.height = height;

      Object.assign(element, updates);
      notifyClients();

      return {
        content: [{
          type: "text",
          text: `요소 크기가 조절되었습니다: ${id} (${width || '변경없음'}x${height || '변경없음'})`
        }]
      };
    }

    case "get_diagram": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify(diagram, null, 2)
        }]
      };
    }

    case "load_diagram": {
      try {
        const data = JSON.parse(args?.data as string);
        diagram = {
          elements: data.elements || [],
          canvasSize: data.canvasSize || { width: 1400, height: 900 }
        };
        notifyClients();
        return {
          content: [{
            type: "text",
            text: `다이어그램이 로드되었습니다. 요소 수: ${diagram.elements.length}`
          }]
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `JSON 파싱 오류: ${e}` }]
        };
      }
    }

    case "list_elements": {
      const filterType = args?.type as string;
      let elements = diagram.elements;
      if (filterType) {
        elements = elements.filter(el => el.type === filterType);
      }
      const list = elements.map(el => {
        const name = (el as Component).name || (el as Zone).label || (el as Note).title || el.id;
        return `- ${el.id} (${el.type}): ${name}`;
      }).join("\n");
      return {
        content: [{
          type: "text",
          text: `요소 목록 (${elements.length}개):\n${list || "(없음)"}`
        }]
      };
    }

    case "generate_architecture": {
      // 로딩 시작 알림
      notifyLoadingStart();

      const description = args?.description as string || "";

      // 간단한 아키텍처 생성 로직
      diagram = { elements: [], canvasSize: { width: 1400, height: 900 } };
      idCounter = 0;

      // 키워드 기반 컴포넌트 생성
      const keywords = {
        frontend: { icon: "", color: "#2196f3", label: "프론트엔드" },
        backend: { icon: "", color: "#4caf50", label: "백엔드" },
        api: { icon: "", color: "#4caf50", label: "API" },
        database: { icon: "", color: "#9c27b0", label: "데이터베이스" },
        db: { icon: "", color: "#9c27b0", label: "DB" },
        auth: { icon: "", color: "#ff9800", label: "인증" },
        cache: { icon: "", color: "#00bcd4", label: "캐시" },
        queue: { icon: "", color: "#795548", label: "메시지 큐" },
        storage: { icon: "", color: "#607d8b", label: "스토리지" },
        client: { icon: "", color: "#ff9800", label: "클라이언트" },
        browser: { icon: "", color: "#ff9800", label: "브라우저" },
        mobile: { icon: "", color: "#e91e63", label: "모바일" },
        server: { icon: "", color: "#4caf50", label: "서버" },
        gateway: { icon: "", color: "#ff5722", label: "게이트웨이" },
        load: { icon: "", color: "#9e9e9e", label: "로드밸런서" }
      };

      const lowerDesc = description.toLowerCase();
      const foundComponents: { key: string; data: typeof keywords[keyof typeof keywords] }[] = [];

      for (const [key, data] of Object.entries(keywords)) {
        if (lowerDesc.includes(key)) {
          foundComponents.push({ key, data });
        }
      }

      if (foundComponents.length === 0) {
        // 기본 구조 생성
        foundComponents.push(
          { key: "client", data: keywords.client },
          { key: "server", data: keywords.server },
          { key: "database", data: keywords.database }
        );
      }

      // 컴포넌트 배치
      const spacing = 200;
      const startX = 100;
      const startY = 100;

      foundComponents.forEach((comp, index) => {
        const component: Component = {
          id: generateId("comp"),
          type: "component",
          name: comp.data.label,
          icon: comp.data.icon,
          color: comp.data.color,
          x: startX + (index * spacing),
          y: startY + (index % 2 === 0 ? 0 : 80)
        };
        diagram.elements.push(component);
      });

      // 순차적으로 화살표 연결 (스마트 앵커 + 자동 우회 라우팅)
      const comps = diagram.elements.filter(el => el.type === "component") as (Component & { width?: number; height?: number })[];
      for (let i = 0; i < comps.length - 1; i++) {
        const fromComp = comps[i];
        const toComp = comps[i + 1];
        const bestAnchors = calculateBestAnchors(fromComp, toComp);

        // Auto-calculate waypoints to avoid obstacles
        const calculatedWaypoints = calculateAutoWaypoints(
          { x: fromComp.x, y: fromComp.y, width: fromComp.width || 100, height: fromComp.height || 80, id: fromComp.id },
          { x: toComp.x, y: toComp.y, width: toComp.width || 100, height: toComp.height || 80, id: toComp.id },
          bestAnchors.fromAnchor,
          bestAnchors.toAnchor
        );

        const arrow: Arrow = {
          id: generateId("arrow"),
          type: "arrow",
          from: fromComp.id,
          fromAnchor: bestAnchors.fromAnchor,
          to: toComp.id,
          toAnchor: bestAnchors.toAnchor,
          waypoints: calculatedWaypoints,
          label: "",
          color: "#666",
          style: "solid"
        };
        diagram.elements.push(arrow);
      }

      notifyClients();

      // 로딩 완료 알림
      notifyLoadingEnd();

      return {
        content: [{
          type: "text",
          text: `아키텍처 다이어그램이 생성되었습니다.\n생성된 컴포넌트: ${foundComponents.map(c => c.data.label).join(", ")}\n\n💡 open_editor 도구로 브라우저에서 실시간 편집 화면을 열 수 있습니다.`
        }]
      };
    }

    case "build_diagram": {
      // 로딩 시작 알림
      notifyLoadingStart();

      // Reset diagram
      diagram = {
        elements: [],
        canvasSize: {
          width: (args?.width as number) || 1400,
          height: (args?.height as number) || 900
        }
      };
      idCounter = 0;

      const componentIds: string[] = [];
      const componentData: Array<{x: number; y: number; width: number; height: number}> = [];

      // Add components first (to calculate zone sizes)
      const components = (args?.components as Array<{name: string; x: number; y: number; icon?: string; color?: string; sub?: string}>) || [];
      components.forEach(c => {
        const size = calculateComponentSize(c.name, c.sub);
        const component: Component & { width?: number; height?: number } = {
          id: generateId("comp"),
          type: "component",
          name: c.name,
          icon: c.icon || "",
          color: c.color || "#2196f3",
          x: c.x,
          y: c.y,
          sub: c.sub,
          width: size.width,
          height: size.height
        };
        componentIds.push(component.id);
        componentData.push({ x: c.x, y: c.y, width: size.width, height: size.height });
        diagram.elements.push(component as Component);
      });

      // Add zones (background) - support auto-sizing with containsIndices
      const zones = (args?.zones as Array<{label: string; x?: number; y?: number; width?: number; height?: number; color?: string; containsIndices?: number[]; padding?: number}>) || [];
      zones.forEach(z => {
        let x = z.x;
        let y = z.y;
        let width = z.width;
        let height = z.height;

        // 자동 크기 계산 (containsIndices 사용)
        if (z.containsIndices && z.containsIndices.length > 0) {
          const containedComps = z.containsIndices
            .filter(i => i >= 0 && i < componentData.length)
            .map(i => componentData[i]);

          if (containedComps.length > 0) {
            const autoSize = calculateZoneSizeForComponents(containedComps, z.padding || 40);
            if (x === undefined) x = autoSize.x;
            if (y === undefined) y = autoSize.y;
            if (width === undefined) width = autoSize.width;
            if (height === undefined) height = autoSize.height;
          }
        }

        const zone: Zone = {
          id: generateId("zone"),
          type: "zone",
          label: z.label,
          color: z.color || "#2196f3",
          x: x ?? 50,
          y: y ?? 50,
          width: width ?? 300,
          height: height ?? 200
        };
        // Zone을 맨 앞에 추가 (배경으로)
        diagram.elements.unshift(zone);
      });

      // Add arrows (using component indices) with auto-routing
      const arrows = (args?.arrows as Array<{from: number; to: number; label?: string; color?: string; style?: 'solid' | 'dashed'; waypoints?: Point[]}>) || [];
      arrows.forEach(a => {
        if (a.from >= 0 && a.from < componentIds.length && a.to >= 0 && a.to < componentIds.length) {
          const fromComp = components[a.from];
          const toComp = components[a.to];
          const fromData = componentData[a.from];
          const toData = componentData[a.to];

          const bestAnchors = calculateBestAnchors(
            { x: fromComp.x, y: fromComp.y, width: fromData.width, height: fromData.height } as unknown as Component,
            { x: toComp.x, y: toComp.y, width: toData.width, height: toData.height } as unknown as Component
          );

          // Auto-calculate waypoints to avoid obstacles (if not provided)
          const calculatedWaypoints = calculateAutoWaypoints(
            { x: fromComp.x, y: fromComp.y, width: fromData.width, height: fromData.height, id: componentIds[a.from] },
            { x: toComp.x, y: toComp.y, width: toData.width, height: toData.height, id: componentIds[a.to] },
            bestAnchors.fromAnchor,
            bestAnchors.toAnchor,
            a.waypoints
          );

          const arrow: Arrow = {
            id: generateId("arrow"),
            type: "arrow",
            from: componentIds[a.from],
            fromAnchor: bestAnchors.fromAnchor,
            to: componentIds[a.to],
            toAnchor: bestAnchors.toAnchor,
            waypoints: calculatedWaypoints,
            label: a.label || "",
            color: a.color || "#2196f3",
            style: a.style || "solid"
          };
          diagram.elements.push(arrow);
        }
      });

      // Add notes
      const notes = (args?.notes as Array<{title?: string; text: string; x: number; y: number}>) || [];
      notes.forEach(n => {
        const size = calculateNoteSize(n.title || "", n.text);
        const note: Note & { width?: number; height?: number } = {
          id: generateId("note"),
          type: "note",
          title: n.title || "",
          text: n.text,
          x: n.x,
          y: n.y,
          width: size.width,
          height: size.height
        };
        diagram.elements.push(note as Note);
      });

      notifyClients();

      // 로딩 완료 알림
      notifyLoadingEnd();

      return {
        content: [{
          type: "text",
          text: `다이어그램이 구축되었습니다!\n- Zone: ${zones.length}개\n- Component: ${components.length}개\n- Arrow: ${arrows.length}개\n- Note: ${notes.length}개\n\n💡 open_editor로 브라우저에서 확인하세요.`
        }]
      };
    }

    case "set_session_title": {
      const title = ((args?.title as string) || "").slice(0, 50);
      currentSessionTitle = title;

      // 캐시에 저장 및 클라이언트에 알림
      await saveDiagramToCache();
      notifyClientsWithSession();
      notifySessionListChange();

      return {
        content: [{
          type: "text",
          text: `세션 제목이 설정되었습니다: "${title}"`
        }]
      };
    }

    case "get_usage_guide": {
      return {
        content: [{
          type: "text",
          text: `【다이어그램 에디터 사용 가이드】

【빠른 시작】
1. open_editor 도구를 호출하여 브라우저에서 편집기를 엽니다.
2. create_diagram으로 새 다이어그램을 생성합니다.
3. add_component, add_zone, add_arrow로 요소를 추가합니다.
4. 브라우저에서 실시간으로 결과를 확인하고 수정합니다.

【주요 도구】
- open_editor: 브라우저에서 편집기 열기
- create_diagram: 새 다이어그램 생성
- add_component: 컴포넌트 추가
- add_zone: 영역 추가
- add_arrow: 화살표 연결
- add_note: 메모 추가
- list_elements: 요소 목록 확인
- get_diagram: JSON 내보내기

【레이아웃 팁】
- 컴포넌트 간격: 가로 180~220px, 세로 120~160px
- Zone 간 간격: 최소 100px 여백
- 화살표 정리: waypoints로 경로 조정

【웹 에디터 기능】
- 드래그로 요소 이동
- 우측 패널에서 속성 변경
- 화살표 편집 모드로 연결선 수정
- PDF/PNG/JSON 내보내기`
        }]
      };
    }

    default:
      return {
        content: [{ type: "text", text: `알 수 없는 도구: ${name}` }]
      };
  }
});

// List resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "diagram://current",
        name: "현재 다이어그램",
        description: "현재 작업 중인 다이어그램 JSON 데이터",
        mimeType: "application/json"
      }
    ]
  };
});

// Read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "diagram://current") {
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(diagram, null, 2)
      }]
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// HTTP Server for browser connection
const app = express();
app.use(cors());
app.use(express.json());

// HTTP_PORT and WS_PORT are defined at the top of the file

// WebSocket server and clients
let wss: WebSocketServer | null = null;
const wsClients: Set<WebSocket> = new Set();

// Auto-shutdown timer (1 minute after last activity)
let autoShutdownTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SHUTDOWN_MS = config.autoShutdownMs;

// Reset auto-shutdown timer
function resetAutoShutdownTimer() {
  if (autoShutdownTimer) {
    clearTimeout(autoShutdownTimer);
  }
  autoShutdownTimer = setTimeout(() => {
    console.error('[WebSocket] 1분간 활동 없음 - WebSocket 서버 종료');
    stopWebSocketServer();
  }, AUTO_SHUTDOWN_MS);
}

// Start WebSocket server
function startWebSocketServer() {
  if (wss) {
    console.error('[WebSocket] 이미 실행 중');
    resetAutoShutdownTimer();
    return;
  }

  wss = new WebSocketServer({ port: WS_PORT });
  console.error(`[WebSocket] 서버 시작 - 포트 ${WS_PORT}`);

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.error(`[WebSocket] 클라이언트 연결됨, 총: ${wsClients.size}`);

    // Reset shutdown timer on new connection
    resetAutoShutdownTimer();

    // Send initial data
    const initialData = JSON.stringify({
      type: 'diagram',
      data: {
        ...diagram,
        sessionId: currentSessionId,
        sessionTitle: currentSessionTitle
      }
    });
    ws.send(initialData);

    ws.on('message', (message) => {
      // Reset timer on any activity
      resetAutoShutdownTimer();

      try {
        const parsed = JSON.parse(message.toString());
        console.error('[WebSocket] 메시지 수신:', parsed.type);
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
      console.error(`[WebSocket] 클라이언트 연결 해제, 총: ${wsClients.size}`);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] 클라이언트 오류:', error.message);
      wsClients.delete(ws);
    });
  });

  wss.on('error', (error) => {
    console.error('[WebSocket] 서버 오류:', error.message);
  });

  // Start auto-shutdown timer
  resetAutoShutdownTimer();
}

// Stop WebSocket server
function stopWebSocketServer() {
  if (autoShutdownTimer) {
    clearTimeout(autoShutdownTimer);
    autoShutdownTimer = null;
  }

  if (wss) {
    // Close all client connections
    wsClients.forEach(ws => {
      try {
        ws.close();
      } catch (e) {
        // Ignore close errors
      }
    });
    wsClients.clear();

    wss.close(() => {
      console.error('[WebSocket] 서버 종료 완료');
    });
    wss = null;
  }
}

// Notify all WebSocket clients of diagram change and save to cache
async function notifyClients() {
  // Start WebSocket server if not running
  if (!wss) {
    startWebSocketServer();
  }

  // Reset shutdown timer on activity
  resetAutoShutdownTimer();

  // Send to all clients
  notifyClientsWithSession();

  // Auto-save to cache file when diagram changes
  await saveDiagramToCache();
}

// Notify clients with session info included
function notifyClientsWithSession() {
  if (wsClients.size === 0) return;

  const data = JSON.stringify({
    type: 'diagram',
    data: {
      ...diagram,
      sessionId: currentSessionId,
      sessionTitle: currentSessionTitle
    }
  });

  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// Notify clients that session list has changed
function notifySessionListChange() {
  if (wsClients.size === 0) return;

  const data = JSON.stringify({
    type: 'sessionListChange',
    data: {}
  });

  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// Notify clients that AI is generating (loading start)
function notifyLoadingStart() {
  // Start WebSocket server if not running
  if (!wss) {
    startWebSocketServer();
  }
  resetAutoShutdownTimer();

  const data = JSON.stringify({
    type: 'loadingStart',
    data: { message: 'AI가 다이어그램을 생성중입니다' }
  });

  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  console.error('[MCP] 로딩 시작 알림 전송');
}

// Notify clients that AI generation is complete (loading end)
function notifyLoadingEnd() {
  const data = JSON.stringify({
    type: 'loadingEnd',
    data: {}
  });

  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  console.error('[MCP] 로딩 완료 알림 전송');
}

// Save current diagram to cache file
async function saveDiagramToCache() {
  try {
    await ensureCacheDir();

    // Create session if not exists
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      currentSessionTitle = getDefaultSessionTitle();
    }

    const sessionData: SessionData = {
      id: currentSessionId,
      title: currentSessionTitle,
      createdAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
      elements: diagram.elements,
      canvasSize: diagram.canvasSize
    };

    const filePath = join(CACHE_DIR, `${currentSessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
    console.error(`[Cache] Saved diagram to ${filePath}`);
  } catch (error) {
    console.error('[Cache] Failed to save diagram:', error);
  }
}

// WebSocket info endpoint (for clients to check WebSocket port)
app.get("/api/ws-info", (req, res) => {
  res.json({
    wsPort: WS_PORT,
    wsUrl: `ws://localhost:${WS_PORT}`,
    isRunning: wss !== null
  });
});

// Start WebSocket server endpoint (called by frontend to ensure WS is running)
app.post("/api/ws-start", (req, res) => {
  startWebSocketServer();
  res.json({
    success: true,
    wsPort: WS_PORT,
    wsUrl: `ws://localhost:${WS_PORT}`
  });
});

// Get current diagram
app.get("/api/diagram", (req, res) => {
  res.json(diagram);
});

// Update entire diagram
app.put("/api/diagram", (req, res) => {
  try {
    const data = req.body;
    diagram = {
      elements: data.elements || [],
      canvasSize: data.canvasSize || { width: 1400, height: 900 }
    };
    res.json({ success: true, message: "다이어그램이 업데이트되었습니다." });
  } catch (e) {
    res.status(400).json({ success: false, error: String(e) });
  }
});

// Add element
app.post("/api/elements", (req, res) => {
  try {
    const element = req.body;
    if (!element.id) {
      element.id = generateId(element.type || "el");
    }
    diagram.elements.push(element);
    res.json({ success: true, element });
  } catch (e) {
    res.status(400).json({ success: false, error: String(e) });
  }
});

// Update element
app.put("/api/elements/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const element = diagram.elements.find(el => el.id === id);
  if (!element) {
    return res.status(404).json({ success: false, error: "요소를 찾을 수 없습니다" });
  }
  Object.assign(element, updates);
  res.json({ success: true, element });
});

// Delete element
app.delete("/api/elements/:id", (req, res) => {
  const { id } = req.params;
  const index = diagram.elements.findIndex(el => el.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: "요소를 찾을 수 없습니다" });
  }
  // Also remove connected arrows
  diagram.elements = diagram.elements.filter(el => {
    if (el.type === "arrow") {
      return el.from !== id && el.to !== id;
    }
    return el.id !== id;
  });
  res.json({ success: true, message: "요소가 삭제되었습니다" });
});

// List elements
app.get("/api/elements", (req, res) => {
  const { type } = req.query;
  let elements = diagram.elements;
  if (type) {
    elements = elements.filter(el => el.type === type);
  }
  res.json(elements);
});

// Clear diagram
app.delete("/api/diagram", (req, res) => {
  diagram = { elements: [], canvasSize: { width: 1400, height: 900 } };
  idCounter = 0;
  res.json({ success: true, message: "다이어그램이 초기화되었습니다" });
});

// ========== Session API Endpoints ==========

// Get session list
app.get("/api/sessions", async (req, res) => {
  try {
    await ensureCacheDir();
    const files = await fs.readdir(CACHE_DIR);
    const sessions: SessionListItem[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(join(CACHE_DIR, file), 'utf-8');
        const session = JSON.parse(content) as SessionData;
        sessions.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          lastSavedAt: session.lastSavedAt
        });
      } catch (e) {
        // Skip invalid files
      }
    }

    // Sort by lastSavedAt descending (newest first)
    sessions.sort((a, b) =>
      new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime()
    );

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Get specific session
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const filePath = join(CACHE_DIR, `${req.params.id}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (e) {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Create new session
app.post("/api/sessions", async (req, res) => {
  try {
    await ensureCacheDir();
    const session: SessionData = req.body;
    if (!session.id) {
      session.id = generateSessionId();
    }
    if (!session.title) {
      session.title = getDefaultSessionTitle();
    }
    if (!session.createdAt) {
      session.createdAt = new Date().toISOString();
    }
    session.lastSavedAt = new Date().toISOString();

    const filePath = join(CACHE_DIR, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));

    // Update current session
    currentSessionId = session.id;
    currentSessionTitle = session.title;

    res.json({ success: true, id: session.id, session });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update session
app.put("/api/sessions/:id", async (req, res) => {
  try {
    const filePath = join(CACHE_DIR, `${req.params.id}.json`);
    const session: SessionData = req.body;
    session.lastSavedAt = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));

    // Update current session info if it's the active one
    if (currentSessionId === req.params.id) {
      currentSessionTitle = session.title;
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save session' });
  }
});

// Delete session
app.delete("/api/sessions/:id", async (req, res) => {
  try {
    const filePath = join(CACHE_DIR, `${req.params.id}.json`);
    await fs.unlink(filePath);

    // Clear current session if deleted
    if (currentSessionId === req.params.id) {
      currentSessionId = null;
      currentSessionTitle = '';
    }

    res.json({ success: true });
  } catch (e) {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Get current session info
app.get("/api/session/current", (req, res) => {
  res.json({
    sessionId: currentSessionId,
    sessionTitle: currentSessionTitle
  });
});

// Set current session info
app.put("/api/session/current", (req, res) => {
  const { sessionId, sessionTitle } = req.body;
  if (sessionId !== undefined) currentSessionId = sessionId;
  if (sessionTitle !== undefined) currentSessionTitle = sessionTitle;
  res.json({ success: true, sessionId: currentSessionId, sessionTitle: currentSessionTitle });
});

// Start HTTP server with error handling
const httpServer = app.listen(HTTP_PORT)
  .on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Port already in use - another instance is running, skip HTTP server
      // MCP server will still work, just won't have its own HTTP API
    } else {
      // Re-throw other errors
      throw err;
    }
  });

// Start MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Diagram Editor MCP Server running on stdio");

  // Start WebSocket server automatically when MCP server starts
  // This ensures WebSocket is available even if HTTP port is in use
  startWebSocketServer();
  console.error("[MCP] WebSocket 서버 자동 시작됨");
}

main().catch(console.error);
