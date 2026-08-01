import fs from 'node:fs/promises'
import path from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { apiRoutes } from './api'
import { gitRoutes } from './git-routes'
import { aiRoutes } from './ai-routes'

/** Build the Fastify app with all API routes (no static serving / no dev middleware). */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(apiRoutes, { prefix: '/api' })
  await app.register(gitRoutes, { prefix: '/api/git' })
  await app.register(aiRoutes, { prefix: '/api/ai' })
  return app
}

/** Serve the built client (dist/client) plus an SPA fallback. Used in production / Electron. */
export async function serveStatic(app: FastifyInstance, clientDir: string): Promise<void> {
  await app.register(import('@fastify/static'), { root: clientDir, wildcard: false })
  app.setNotFoundHandler(async (req, reply) => {
    if (req.raw.url?.startsWith('/api')) {
      reply.code(404)
      return { error: 'not found' }
    }
    reply.type('text/html')
    return fs.readFile(path.join(clientDir, 'index.html'), 'utf8')
  })
}

/** Start a production server that serves the built client and the API. */
export async function startProd(opts: {
  clientDir: string
  port?: number
  host?: string
}): Promise<{ app: FastifyInstance; url: string; port: number }> {
  const app = await buildApp()
  await serveStatic(app, opts.clientDir)
  const port = opts.port ?? Number(process.env.PORT ?? 8787)
  const host = opts.host ?? '127.0.0.1'
  await app.listen({ port, host })
  return { app, url: `http://${host}:${port}`, port }
}
