// MCP Server Configuration
// Modify these values to match mcp-server/src/config.ts

export const config = {
  // WebSocket port (must match mcp-server config.wsPort)
  mcpWsPort: 41002,

  // REST API port (must match mcp-server config.httpPort)
  mcpHttpPort: 41001,

  // Get WebSocket URL (browser connects to localhost, Docker ports are exposed)
  get wsUrl(): string {
    return `ws://localhost:${this.mcpWsPort}`;
  },

  // Get API base URL
  get apiBase(): string {
    return `http://localhost:${this.mcpHttpPort}/api`;
  }
};
