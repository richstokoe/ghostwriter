import fs from 'node:fs/promises'
import path from 'node:path'
import { buildApp, serveStatic } from './server'

// CLI entry: `npm run dev` (Vite middleware, one process) or `npm start` (production).
// Electron does not use this file — it calls startProd() from ./server directly.
const isProd = process.env.NODE_ENV === 'production'
const base = process.cwd()
const port = Number(process.env.PORT ?? 8787)

const app = await buildApp()

if (isProd) {
  await serveStatic(app, path.join(base, 'dist/client'))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({ root: base, appType: 'custom', server: { middlewareMode: true } })
  await app.register(import('@fastify/middie'))
  app.use(vite.middlewares)
  app.get('/*', async (req, reply) => {
    try {
      const template = await fs.readFile(path.join(base, 'index.html'), 'utf8')
      const html = await vite.transformIndexHtml(req.raw.url ?? '/', template)
      reply.type('text/html')
      return html
    } catch (err) {
      vite.ssrFixStacktrace(err as Error)
      reply.code(500)
      return (err as Error).stack ?? String(err)
    }
  })
}

await app.listen({ port, host: '127.0.0.1' })
console.log(`\n  Ghostwriter → http://localhost:${port}  (${isProd ? 'production' : 'dev'})\n`)
