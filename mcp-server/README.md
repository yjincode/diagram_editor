# Diagram Editor MCP Server

Claude Desktop에서 다이어그램 에디터를 제어할 수 있는 MCP 서버입니다.

## 설치

```bash
cd mcp-server
npm install
npm run build
```

## Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json` 파일에 다음을 추가하세요:

```json
{
  "mcpServers": {
    "diagram-editor": {
      "command": "node",
      "args": ["/Users/youngjin/Desktop/mcpserver/diagram_editor/mcp-server/dist/index.js"]
    }
  }
}
```

## 사용 가능한 도구

### 다이어그램 관리
- `create_diagram` - 새 다이어그램 생성
- `get_diagram` - 현재 다이어그램 JSON 가져오기
- `load_diagram` - JSON으로 다이어그램 로드
- `list_elements` - 요소 목록 조회

### 요소 추가
- `add_component` - 컴포넌트 추가
- `add_zone` - 영역 추가
- `add_arrow` - 화살표 연결
- `add_note` - 노트 추가
- `add_scenario` - 시나리오 추가

### 요소 편집
- `update_element` - 요소 속성 수정
- `remove_element` - 요소 삭제

### 자동 생성
- `generate_architecture` - 텍스트 설명으로 아키텍처 자동 생성

## 사용 예시

Claude에게 다음과 같이 요청할 수 있습니다:

- "웹 애플리케이션 아키텍처 다이어그램을 만들어줘"
- "프론트엔드, 백엔드, 데이터베이스로 구성된 시스템을 그려줘"
- "현재 다이어그램에 Redis 캐시 컴포넌트를 추가해줘"
- "comp_1에서 comp_2로 화살표를 연결해줘"

## 에디터와 연동

MCP 서버에서 생성한 다이어그램 JSON을 에디터에서 사용하려면:

1. Claude에서 `get_diagram` 도구로 JSON을 받기
2. 에디터의 "가져오기" 버튼을 클릭
3. JSON을 붙여넣기

또는 에디터에서 내보낸 JSON을 `load_diagram` 도구로 MCP 서버에 로드할 수 있습니다.
