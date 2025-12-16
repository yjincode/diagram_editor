import { defineConfig, Plugin } from 'vite'
import { promises as fs } from 'fs'
import { join } from 'path'

// Cache folder API plugin - allows frontend to read sessions without MCP server
function cacheApiPlugin(): Plugin {
  const CACHE_DIR = join(__dirname, 'cache')

  return {
    name: 'cache-api',
    configureServer(server) {
      // GET /api/sessions - list all sessions
      server.middlewares.use('/api/sessions', async (req, res, next) => {
        if (req.method !== 'GET') return next()

        // If URL has an ID (e.g., /api/sessions/abc123), skip to next handler
        const urlPath = req.url || ''
        if (urlPath.length > 1) return next()

        try {
          await fs.mkdir(CACHE_DIR, { recursive: true })
          const files = await fs.readdir(CACHE_DIR)
          const sessions = []

          for (const file of files) {
            if (!file.endsWith('.json')) continue
            try {
              const content = await fs.readFile(join(CACHE_DIR, file), 'utf-8')
              const session = JSON.parse(content)
              sessions.push({
                id: session.id,
                title: session.title,
                createdAt: session.createdAt,
                lastSavedAt: session.lastSavedAt
              })
            } catch (e) {
              // Skip invalid files
            }
          }

          // Sort by lastSavedAt descending
          sessions.sort((a, b) =>
            new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime()
          )

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(sessions))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Failed to read sessions' }))
        }
      })

      // GET /api/sessions/:id - get specific session
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/sessions\/([^/]+)$/)
        if (!match || req.method !== 'GET') return next()

        const sessionId = match[1]
        try {
          const filePath = join(CACHE_DIR, `${sessionId}.json`)
          const content = await fs.readFile(filePath, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(content)
        } catch (e) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'Session not found' }))
        }
      })

      // PUT /api/sessions/:id - save session
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/sessions\/([^/]+)$/)
        if (!match || req.method !== 'PUT') return next()

        const sessionId = match[1]
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', async () => {
          try {
            await fs.mkdir(CACHE_DIR, { recursive: true })
            const filePath = join(CACHE_DIR, `${sessionId}.json`)
            await fs.writeFile(filePath, body, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to save session' }))
          }
        })
      })

      // POST /api/sessions - create new session
      server.middlewares.use('/api/sessions', async (req, res, next) => {
        if (req.method !== 'POST') return next()

        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', async () => {
          try {
            await fs.mkdir(CACHE_DIR, { recursive: true })
            const session = JSON.parse(body)
            const filePath = join(CACHE_DIR, `${session.id}.json`)
            await fs.writeFile(filePath, body, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, session }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to create session' }))
          }
        })
      })

      // DELETE /api/sessions/:id - delete session
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/sessions\/([^/]+)$/)
        if (!match || req.method !== 'DELETE') return next()

        const sessionId = match[1]
        try {
          const filePath = join(CACHE_DIR, `${sessionId}.json`)
          await fs.unlink(filePath)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ success: true }))
        } catch (e) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'Session not found' }))
        }
      })
    }
  }
}

// Port configuration (same as mcp-server/src/config.ts)
const EDITOR_PORT = 41173

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist'
  },
  plugins: [cacheApiPlugin()],
  server: {
    port: EDITOR_PORT,
    host: '0.0.0.0' // Allow access from Docker
  }
})
