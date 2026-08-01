import type { FastifyPluginAsync } from 'fastify'
import { resolveRoot } from './paths'
import * as git from './git'

export const gitRoutes: FastifyPluginAsync = async (app) => {
  app.get('/status', async (req) => git.status(resolveRoot((req.query as Record<string, unknown>)?.root)))

  app.post('/init', async (req) => {
    const root = resolveRoot((req.body as Record<string, unknown>)?.root)
    await git.init(root)
    return git.status(root)
  })

  app.post('/commit', async (req, reply) => {
    const b = req.body as { root?: string; message?: string; paths?: string[] }
    const root = resolveRoot(b?.root)
    const message = String(b?.message ?? '').trim()
    if (!message) {
      reply.code(400)
      return { error: 'commit message required' }
    }
    try {
      const res = await git.commit(root, message, Array.isArray(b?.paths) ? b.paths : undefined)
      return { ok: true, ...res }
    } catch (err) {
      reply.code(400)
      return { error: (err as Error).message }
    }
  })

  app.get('/log', async (req) => {
    const q = req.query as Record<string, unknown>
    const file = typeof q?.path === 'string' && q.path ? q.path : undefined
    return { commits: await git.log(resolveRoot(q?.root), file) }
  })

  app.get('/diff', async (req) => {
    const q = req.query as Record<string, unknown>
    const file = typeof q?.path === 'string' && q.path ? q.path : undefined
    const hash = typeof q?.hash === 'string' && q.hash ? q.hash : undefined
    return { diff: await git.diff(resolveRoot(q?.root), file, hash) }
  })
}
