#!/bin/sh

# Start HTTP/WebSocket server in background
node /app/mcp-server/dist/http-server.js &

# Start frontend dev server
npm run dev
