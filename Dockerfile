# Diagram Editor (Frontend + MCP Server)
FROM node:20-alpine

WORKDIR /app

# Copy and install frontend dependencies
COPY package*.json ./
RUN npm install

# Copy and install MCP server dependencies
COPY mcp-server/package*.json ./mcp-server/
RUN cd mcp-server && npm install

# Copy source files
COPY . .

# Build MCP server
RUN cd mcp-server && npm run build

# Expose ports
EXPOSE 41173 41001 41002

# Start script will be used
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
