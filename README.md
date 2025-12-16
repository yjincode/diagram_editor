# Diagram Editor MCP

AI와 함께 다이어그램을 실시간으로 생성하고 편집할 수 있는 MCP 서버입니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                          │
│  ┌─────────────────────┐    ┌─────────────────────┐         │
│  │   Frontend (Vite)   │    │    HTTP Server      │  항상 ON │
│  │      :41173         │    │      :41001         │         │
│  └─────────────────────┘    └─────────────────────┘         │
│                             ┌─────────────────────┐         │
│                             │  WebSocket Server   │  요청시  │
│                             │      :41002         │  ON/OFF │
│                             └──────────▲──────────┘         │
└────────────────────────────────────────│────────────────────┘
                                         │
┌────────────────────────────────────────▼────────────────────┐
│              Claude Desktop (docker exec)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 설치 (Docker)

### 1. 의존성 설치 및 빌드

```bash
cd diagram_editor

# 프론트엔드 의존성
npm install

# MCP 서버 빌드
cd mcp-server
npm install
npm run build
cd ..
```

### 2. Docker 컨테이너 실행

```bash
docker-compose up -d --build
```

### 3. Claude Desktop 설정

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "docker",
      "args": ["exec", "-i", "diagram-editor", "node", "/app/mcp-server/dist/mcp-handler.js"]
    }
  }
}
```

**설정 후 Claude Desktop 재시작 필수!**

### 4. 브라우저 접속

```
http://localhost:41173
```

---

## 포트 정보

| 포트 | 용도 | 상태 |
|------|------|------|
| 41173 | Frontend (웹 에디터) | 항상 실행 |
| 41001 | REST API | 항상 실행 |
| 41002 | WebSocket (실시간 동기화) | MCP 요청 시 실행, 1분 후 자동 종료 |

---

## 포트 변경 방법

포트 충돌 시 아래 두 파일의 포트 번호를 동일하게 수정하세요:

### 1. 서버 설정: `mcp-server/src/config.ts`

```typescript
export const config = {
  editorPort: 41173,   // Frontend
  httpPort: 41001,     // REST API
  wsPort: 41002,       // WebSocket
  autoShutdownMs: 60000,
};
```

### 2. 프론트엔드 설정: `src/config.ts`

```typescript
export const config = {
  mcpWsPort: 41002,    // WebSocket (서버와 동일하게)
  mcpHttpPort: 41001,  // REST API (서버와 동일하게)
  // ...
};
```

### 3. Docker 재빌드

```bash
docker-compose down
docker-compose up -d --build
```

---

## 사용법

Claude Desktop에서 다음과 같이 요청:

```
"웹 애플리케이션 아키텍처 다이어그램을 만들어줘"
"마이크로서비스 구조를 그려줘"
"현재 다이어그램에 Redis 캐시를 추가해줘"
```

---

## 문제 해결

### Docker 상태 확인

```bash
docker ps | grep diagram-editor
docker logs diagram-editor
```

### 컨테이너 재시작

```bash
docker-compose restart
```

### MCP 연결 테스트

```bash
docker exec -i diagram-editor node /app/mcp-server/dist/mcp-handler.js
```

### 포트 충돌 확인

```bash
lsof -i:41001,41002,41173
```

---

## 로컬 개발 (Docker 없이)

```bash
# 프론트엔드 실행
npm run dev

# MCP 서버 (별도 터미널)
cd mcp-server && npm run build
```

Claude Desktop 설정 (로컬):

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/절대경로/diagram_editor/mcp-server/dist/index.js"]
    }
  }
}
```

---

## MCP 도구 목록

| 도구 | 설명 |
|------|------|
| `add_component` | 컴포넌트 추가 |
| `add_zone` | 영역 추가 |
| `add_arrow` | 화살표 연결 |
| `add_note` | 노트 추가 |
| `clear_diagram` | 다이어그램 초기화 |
| `get_diagram` | 현재 다이어그램 JSON |
| `generate_architecture` | 텍스트로 아키텍처 자동 생성 |
| `set_session_title` | 세션 제목 설정 |

---

## 라이선스

MIT License
