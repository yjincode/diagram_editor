# Diagram Editor MCP

AI와 함께 다이어그램을 실시간으로 생성하고 편집할 수 있는 MCP(Model Context Protocol) 서버입니다.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 주요 기능

- **AI 다이어그램 생성**: Claude, GPT 등 LLM이 MCP를 통해 다이어그램을 자동 생성
- **실시간 동기화**: AI가 생성한 다이어그램이 웹 에디터에 즉시 반영
- **직관적인 웹 에디터**: 드래그 앤 드롭으로 요소 편집
- **다양한 요소 지원**: 컴포넌트, 영역(Zone), 화살표, 노트, 시나리오
- **자동 화살표 라우팅**: 화살표가 다른 컴포넌트를 자동으로 우회
- **세션 관리**: 여러 다이어그램을 세션으로 저장/불러오기
- **내보내기**: PNG, PDF, JSON 형식으로 내보내기

## 스크린샷

```
┌─────────────────────────────────────────────────────────────┐
│  [Session List]  │        Canvas                │ Properties │
│                  │   ┌─────────┐                │            │
│  > Session 1     │   │ Frontend│───────┐        │  Name: ... │
│    Session 2     │   └─────────┘       │        │  Color:... │
│                  │         │           ▼        │            │
│  + New Diagram   │   ┌─────────┐  ┌─────────┐   │            │
│                  │   │ Backend │──│   DB    │   │            │
│                  │   └─────────┘  └─────────┘   │            │
└─────────────────────────────────────────────────────────────┘
```

## 설치

### 1. 저장소 클론

```bash
git clone https://github.com/your-repo/diagram-editor-mcp.git
cd diagram-editor-mcp
```

### 2. 의존성 설치

```bash
# 프론트엔드 의존성
npm install

# MCP 서버 의존성
cd mcp-server
npm install
cd ..
```

### 3. 빌드

```bash
# MCP 서버 빌드
cd mcp-server
npm run build
cd ..

# 프론트엔드 빌드 (선택사항 - 개발 모드 사용 시 불필요)
npm run build
```

## MCP 클라이언트 설정

### Claude Desktop 설정

Claude Desktop의 설정 파일에 MCP 서버를 추가합니다.

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/절대경로/diagram-editor-mcp/mcp-server/dist/index.js"]
    }
  }
}
```

> **중요**: `/절대경로/`를 실제 프로젝트 경로로 변경하세요.

### Cline (VS Code Extension) 설정

VS Code의 Cline 확장 프로그램 설정에서:

```json
{
  "cline.mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/절대경로/diagram-editor-mcp/mcp-server/dist/index.js"]
    }
  }
}
```

### 기타 MCP 클라이언트

MCP를 지원하는 모든 클라이언트에서 사용 가능합니다. 클라이언트의 MCP 설정에서:

- **Command**: `node`
- **Args**: `["/절대경로/mcp-server/dist/index.js"]`

## 사용 방법

### 1. 웹 에디터 실행

```bash
# 개발 모드 (핫 리로드 지원)
npm run dev

# 또는 프로덕션 빌드 후 실행
npm run build
npm run preview
```

웹 에디터가 `http://localhost:5173`에서 실행됩니다.

### 2. AI에게 다이어그램 생성 요청

Claude Desktop 또는 다른 MCP 클라이언트에서:

```
"마이크로서비스 아키텍처 다이어그램을 만들어줘"
"프론트엔드, API 서버, 데이터베이스로 구성된 웹 앱 구조도를 그려줘"
"로그인 플로우를 다이어그램으로 표현해줘"
```

### 3. 실시간 편집

- AI가 생성한 다이어그램이 웹 에디터에 자동으로 표시됩니다
- 요소를 드래그하여 위치 조정
- 요소 선택 후 우측 패널에서 속성 편집
- 화살표 편집 모드(✏️)로 연결선 수정

## MCP 도구 목록

### 기본 도구

| 도구 | 설명 |
|------|------|
| `open_editor` | 웹 에디터를 브라우저에서 열기 |
| `create_diagram` | 새 다이어그램 생성 |
| `get_diagram` | 현재 다이어그램 JSON 반환 |
| `load_diagram` | JSON으로 다이어그램 로드 |
| `list_elements` | 모든 요소 목록 조회 |

### 요소 추가

| 도구 | 설명 |
|------|------|
| `add_component` | 컴포넌트(박스) 추가 |
| `add_zone` | 영역(점선 박스) 추가 |
| `add_arrow` | 화살표 연결 추가 |
| `add_note` | 메모 박스 추가 |
| `add_scenario` | 시나리오 박스 추가 |

### 요소 수정/삭제

| 도구 | 설명 |
|------|------|
| `update_element` | 요소 속성 업데이트 |
| `resize_element` | 요소 크기 조절 |
| `remove_element` | 요소 삭제 |

### 고급 도구

| 도구 | 설명 |
|------|------|
| `build_diagram` | 한 번의 호출로 전체 다이어그램 구축 |
| `generate_architecture` | 텍스트 설명으로 아키텍처 자동 생성 |
| `set_session_title` | 세션 제목 설정 |
| `get_usage_guide` | 사용 가이드 조회 |

## 사용 예시

### 간단한 다이어그램 생성

```javascript
// 1. 에디터 열기
open_editor()

// 2. 새 다이어그램 생성
create_diagram({ width: 1400, height: 900 })

// 3. 컴포넌트 추가
add_component({ name: "Frontend", x: 100, y: 100, color: "#2196f3" })
add_component({ name: "Backend", x: 350, y: 100, color: "#4caf50" })
add_component({ name: "Database", x: 600, y: 100, color: "#9c27b0" })

// 4. 화살표 연결
add_arrow({ from: "comp_1", to: "comp_2", label: "REST API" })
add_arrow({ from: "comp_2", to: "comp_3", label: "Query" })
```

### build_diagram으로 한 번에 생성

```javascript
build_diagram({
  width: 1400,
  height: 900,
  zones: [
    { label: "Client", containsIndices: [0], color: "#2196f3" },
    { label: "Server", containsIndices: [1, 2], color: "#4caf50" }
  ],
  components: [
    { name: "React App", x: 100, y: 100, color: "#2196f3" },
    { name: "API Server", x: 400, y: 100, color: "#4caf50" },
    { name: "PostgreSQL", x: 400, y: 250, color: "#9c27b0" }
  ],
  arrows: [
    { from: 0, to: 1, label: "HTTP" },
    { from: 1, to: 2, label: "SQL" }
  ],
  notes: [
    { text: "인증 필요", x: 250, y: 50 }
  ]
})
```

## 색상 가이드

| 역할 | 색상 | HEX |
|------|------|-----|
| 프론트엔드/클라이언트 | 파랑 | `#2196f3` |
| 백엔드/API 서버 | 초록 | `#4caf50` |
| 데이터베이스/저장소 | 보라 | `#9c27b0` |
| 캐시/메모리 | 청록 | `#00bcd4` |
| 메시지큐/이벤트 | 주황 | `#ff9800` |
| 인증/보안 | 빨강 | `#f44336` |
| 외부 서비스 | 회색 | `#607d8b` |

## 단축키

| 키 | 동작 |
|----|------|
| `Delete` / `Backspace` | 선택한 요소 삭제 |
| `Ctrl/Cmd + Z` | 실행 취소 |
| `Ctrl/Cmd + Shift + Z` | 다시 실행 |
| `Ctrl/Cmd + A` | 전체 선택 |
| `Ctrl/Cmd + C` | 복사 |
| `Ctrl/Cmd + V` | 붙여넣기 |
| `Escape` | 선택 해제 |
| `G` | 그리드 표시/숨기기 |
| 마우스 휠 | 확대/축소 |
| 마우스 드래그 (빈 공간) | 캔버스 이동 |

## 파일 구조

```
diagram-editor-mcp/
├── mcp-server/           # MCP 서버
│   ├── src/
│   │   └── index.ts      # MCP 서버 메인 코드
│   ├── dist/             # 빌드된 서버 코드
│   └── package.json
├── src/                  # 웹 에디터 프론트엔드
│   ├── core/             # 핵심 로직
│   │   ├── State.ts      # 상태 관리
│   │   ├── Canvas.ts     # 캔버스 렌더링
│   │   └── ...
│   ├── ui/               # UI 컴포넌트
│   └── styles/           # CSS 스타일
├── cache/                # 세션 저장 폴더 (자동 생성)
├── index.html
└── package.json
```

## 포트 정보

| 포트 | 용도 |
|------|------|
| 5173 | 웹 에디터 (Vite 개발 서버) |
| 3001 | HTTP API (브라우저 ↔ MCP 서버) |
| 3002 | WebSocket (실시간 동기화) |

## 문제 해결

### WebSocket 연결 실패

```
WebSocket connection to 'ws://localhost:3002/' failed
```

MCP 서버가 실행 중인지 확인하세요. Claude Desktop에서 MCP를 통해 도구를 호출하면 WebSocket 서버가 자동으로 시작됩니다.

### 포트 충돌

다른 프로세스가 포트를 사용 중인 경우:

```bash
# 포트 사용 프로세스 확인 (macOS/Linux)
lsof -i:3001,3002,5173

# 프로세스 종료
kill -9 <PID>
```

### MCP 서버가 인식되지 않음

1. `claude_desktop_config.json`의 경로가 올바른지 확인
2. MCP 서버가 빌드되었는지 확인 (`mcp-server/dist/index.js` 존재 여부)
3. Claude Desktop을 재시작

## 기여

버그 리포트, 기능 제안, Pull Request를 환영합니다!

## 라이선스

MIT License
