// MCP Server Configuration
// Modify these values to match your setup

export const config = {
  // Frontend editor port
  editorPort: 41173,

  // REST API port (for browser sync)
  httpPort: 41001,

  // WebSocket port (for real-time updates)
  wsPort: 41002,

  // Auto-shutdown timeout (ms) - WebSocket closes after inactivity
  autoShutdownMs: 60000, // 1 minute
};
