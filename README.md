# Diagram Editor MCP

AI와 함께 다이어그램을 실시간으로 생성하고 편집할 수 있는 MCP 서버입니다.

## 폴더 구조

```
diagram_editor/
├── config.json          # 포트 설정
├── src/                 # 프론트엔드 (React)
├── mcp-server/
│   ├── src/index.ts     # MCP 서버 메인
│   └── dist/            # 빌드 결과
├── cache/               # 세션 저장소
└── vite.config.ts
```

---

## 설치

```bash
cd diagram_editor

# 프론트엔드 의존성
npm install

# MCP 서버 빌드
cd mcp-server
npm install
npm run build
```

---

## MCP 설정

### Claude Desktop (macOS)

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/경로/diagram_editor/mcp-server/dist/index.js"]
    }
  }
}
```

### Claude Desktop (Windows)

`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["C:\\경로\\diagram_editor\\mcp-server\\dist\\index.js"]
    }
  }
}
```

### Cursor IDE

`.cursor/mcp.json` (프로젝트 루트)

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/경로/diagram_editor/mcp-server/dist/index.js"]
    }
  }
}
```

### Claude Code

`~/.claude.json`

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/경로/diagram_editor/mcp-server/dist/index.js"]
    }
  }
}
```

> 경로를 본인 환경에 맞게 수정하세요. 설정 후 앱 재시작 필수!

---

## 포트 설정

`config.json`으로 통합 관리:

```json
{
  "httpPort": 51001,
  "wsPort": 51002,
  "editorPort": 51173
}
```

| 포트 | 용도 |
|------|------|
| 51173 | 웹 에디터 |
| 51001 | REST API |
| 51002 | WebSocket |

---

## MCP 도구 목록

### 기본

| 도구 | 설명 |
|------|------|
| `open_editor` | 브라우저에서 에디터 열기 |
| `get_usage_guide` | 사용 가이드 |

### 다이어그램 생성

| 도구 | 설명 |
|------|------|
| `build_diagram` | 전체 다이어그램 한번에 생성 |
| `generate_architecture` | 텍스트로 자동 생성 |

### 요소 추가

| 도구 | 설명 |
|------|------|
| `add_component` | 컴포넌트 추가 |
| `add_zone` | 영역 추가 |
| `add_arrow` | 화살표 연결 |
| `add_note` | 노트 추가 |
| `add_scenario` | 시나리오 박스 |

### 수정/삭제

| 도구 | 설명 |
|------|------|
| `update_element` | 요소 수정 |
| `resize_element` | 크기 조절 |
| `remove_element` | 요소 삭제 |
| `clear_diagram` | 전체 초기화 |

### 기타

| 도구 | 설명 |
|------|------|
| `create_diagram` | 새 다이어그램 생성 |
| `get_diagram` | JSON 내보내기 |
| `load_diagram` | JSON 가져오기 |
| `list_elements` | 요소 목록 조회 |

---

## 색상 가이드

### 컴포넌트 색상

| 용도 | 색상 |
|------|------|
| 프론트엔드 | `#2196f3` (파랑) |
| 백엔드 | `#4caf50` (초록) |
| 데이터베이스 | `#9c27b0` (보라) |
| 캐시 | `#00bcd4` (청록) |
| 메시지큐 | `#ff9800` (주황) |
| 인증 | `#f44336` (빨강) |
| 외부 서비스 | `#607d8b` (회색) |

### 화살표 색상 (흐름 구분용)

| 용도 | 색상 |
|------|------|
| 주요 데이터 흐름 | `#2196f3` (파랑) |
| 인증/보안 흐름 | `#f44336` (빨강) |
| 비동기/이벤트 | `#ff9800` (주황) |
| DB 쿼리 | `#9c27b0` (보라) |
| 캐시 조회 | `#00bcd4` (청록) |
| 외부 API 호출 | `#607d8b` (회색) |
| 응답/콜백 | `#4caf50` (초록) |

---

## 사용 예시

```
"웹 애플리케이션 아키텍처 다이어그램을 만들어줘"
"마이크로서비스 구조를 그려줘"
"현재 다이어그램에 Redis 캐시를 추가해줘"
```

---

## 문제 해결

```bash
# 포트 충돌 확인
lsof -i:51001,51002,51173

# 빌드 오류 시
cd mcp-server
rm -rf dist node_modules
npm install
npm run build
```

---

## 라이선스

MIT License
