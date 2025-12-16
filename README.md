# Diagram Editor MCP

AI와 함께 다이어그램을 실시간으로 생성하고 편집할 수 있는 MCP 서버입니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Desktop                                              │
│  └── MCP Server (node index.js)                             │
│       - 다이어그램 데이터 관리                                │
│       - HTTP/WebSocket 서버 내장                             │
│       - 브라우저 자동 실행                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐    ┌─────────────────────┐
│   Frontend (Vite)   │◄──►│    WebSocket        │
│     :51173          │    │      :51002         │
│   웹 에디터 UI       │    │   실시간 동기화      │
└─────────────────────┘    └─────────────────────┘
```

---

## 설치

### 1. 의존성 설치

```bash
cd diagram_editor

# 프론트엔드 의존성
npm install

# MCP 서버 의존성 및 빌드
cd mcp-server
npm install
npm run build
cd ..
```

### 2. Claude Desktop 설정

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/Users/사용자명/Desktop/mcpserver/diagram_editor/mcp-server/dist/index.js"],
      "env": {
        "PATH": "/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

> **경로를 본인 환경에 맞게 수정하세요!**

**설정 후 Claude Desktop 재시작 필수!**

---

## 포트 설정

모든 포트는 `config.json` 하나로 관리됩니다:

```json
{
  "httpPort": 51001,
  "wsPort": 51002,
  "editorPort": 51173
}
```

| 포트 | 용도 |
|------|------|
| 51173 | Frontend (웹 에디터) |
| 51001 | REST API |
| 51002 | WebSocket (실시간 동기화) |

### 포트 변경

`config.json`만 수정하면 모든 곳에 자동 반영됩니다:

```bash
# config.json 수정 후
cd mcp-server && npm run build
# Claude Desktop 재시작
```

---

## 사용법

Claude Desktop에서 다음과 같이 요청:

```
"웹 애플리케이션 아키텍처 다이어그램을 만들어줘"
"마이크로서비스 구조를 그려줘"
"현재 다이어그램에 Redis 캐시를 추가해줘"
```

### 브라우저 자동 실행

`open_editor` 도구를 호출하면 자동으로:
1. Vite 개발 서버 시작
2. 브라우저에서 에디터 열기
3. WebSocket 연결로 실시간 동기화

---

## MCP 도구 목록

### 기본 도구

| 도구 | 설명 |
|------|------|
| `open_editor` | 브라우저에서 에디터 열기 (자동 시작) |
| `get_usage_guide` | 사용 가이드 보기 |

### 배치 작업 (권장)

| 도구 | 설명 |
|------|------|
| `build_diagram` | **한 번에 전체 다이어그램 구축** |
| `generate_architecture` | 텍스트 설명으로 자동 생성 |

### 개별 요소 추가

| 도구 | 설명 |
|------|------|
| `add_component` | 컴포넌트 추가 (자동 크기) |
| `add_zone` | 영역 추가 (자동 크기) |
| `add_arrow` | 화살표 연결 (자동 라우팅) |
| `add_note` | 노트 추가 |
| `add_scenario` | 시나리오 박스 추가 |

### 수정/삭제

| 도구 | 설명 |
|------|------|
| `update_element` | 요소 속성 변경 |
| `resize_element` | 크기 조절 |
| `remove_element` | 요소 삭제 |
| `clear_diagram` | 전체 초기화 |

### 기타

| 도구 | 설명 |
|------|------|
| `create_diagram` | 새 다이어그램 (캔버스 크기 설정) |
| `get_diagram` | JSON 내보내기 |
| `load_diagram` | JSON 가져오기 |
| `list_elements` | 요소 목록 조회 |
| `set_session_title` | 세션 제목 설정 |

---

## build_diagram 예시

한 번의 호출로 전체 다이어그램 구축:

```json
{
  "components": [
    { "name": "React App", "x": 100, "y": 100, "color": "#2196f3" },
    { "name": "API Server", "x": 400, "y": 100, "color": "#4caf50" },
    { "name": "PostgreSQL", "x": 400, "y": 280, "color": "#9c27b0" }
  ],
  "arrows": [
    { "from": 0, "to": 1, "label": "REST API" },
    { "from": 1, "to": 2, "label": "Query" }
  ],
  "zones": [
    { "label": "Frontend", "containsIndices": [0], "color": "#2196f3" },
    { "label": "Backend", "containsIndices": [1, 2], "color": "#4caf50" }
  ]
}
```

### 색상 가이드

| 용도 | 색상 |
|------|------|
| 프론트엔드 | `#2196f3` (파랑) |
| 백엔드 | `#4caf50` (초록) |
| 데이터베이스 | `#9c27b0` (보라) |
| 캐시 | `#00bcd4` (청록) |
| 메시지큐 | `#ff9800` (주황) |
| 인증 | `#f44336` (빨강) |
| 외부 서비스 | `#607d8b` (회색) |

---

## 문제 해결

### 포트 충돌 확인

```bash
lsof -i:51001,51002,51173
```

### MCP 연결 테스트

```bash
node mcp-server/dist/index.js
# Ctrl+C로 종료
```

### 빌드 오류 시

```bash
cd mcp-server
rm -rf dist node_modules
npm install
npm run build
```

---

## 파일 구조

```
diagram_editor/
├── config.json          # 포트 설정 (통합)
├── src/                 # 프론트엔드 소스
├── mcp-server/
│   ├── src/index.ts     # MCP 서버 메인
│   └── dist/            # 빌드 결과
├── cache/               # 세션 저장소
└── vite.config.ts       # Vite 설정
```

---

## 라이선스

MIT License
