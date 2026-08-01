import fs from 'node:fs/promises'
import path from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import { loadProject } from './project'
import { loadVoice } from './voice'
import { resolveRoot, safeJoin } from './paths'
import { loadConfig, saveConfig, rolesOf, isConfigured, isAutoRecognised } from './config'
import type { Roles } from '../shared/types'
import * as manifest from './manifest'
import * as chars from './characters'
import * as timeline from './timeline'

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.ghostwriter', '.obsidian'])

/** List sub-directories under root (relative, posix) up to `maxDepth` levels for the mapper. */
async function listDirs(root: string, maxDepth = 2): Promise<string[]> {
  const out: string[] = []
  async function walk(rel: string, depth: number): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('dist')) continue
      const child = rel ? `${rel}/${e.name}` : e.name
      out.push(child)
      if (depth < maxDepth) await walk(child, depth + 1)
    }
  }
  await walk('', 1)
  return out.sort((a, b) => a.localeCompare(b))
}

function cleanRoles(raw: unknown): Partial<Roles> {
  const src = (raw ?? {}) as Record<string, unknown>
  const roles: Partial<Roles> = {}
  for (const k of ['chapters', 'outline', 'characters', 'timeline', 'voice'] as const) {
    const v = src[k]
    if (typeof v === 'string' && v.trim()) roles[k] = v.trim().replace(/^\/+|\/+$/g, '')
  }
  return roles
}

function cleanExtraRoles(raw: unknown): Record<string, string> {
  const src = (raw ?? {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(src)) {
    if (k.trim() && typeof v === 'string' && v.trim()) out[k.trim()] = v.trim().replace(/^\/+|\/+$/g, '')
  }
  return out
}

export const apiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ ok: true }))

  app.get('/project', async (req) => {
    const root = resolveRoot((req.query as Record<string, unknown>)?.root)
    return loadProject(root)
  })

  app.get('/voice', async (req) => {
    const root = resolveRoot((req.query as Record<string, unknown>)?.root)
    return loadVoice(root)
  })

  app.put('/voice', async (req, reply) => {
    const body = req.body as { root?: string; content?: string }
    const root = resolveRoot(body?.root)
    try {
      const voiceDir = rolesOf(await loadConfig(root)).voice
      const abs = safeJoin(root, path.join(voiceDir, 'voice.md'))
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, String(body?.content ?? ''), 'utf8')
      return { ok: true, bytes: Buffer.byteLength(String(body?.content ?? '')) }
    } catch (err) {
      reply.code(400)
      return { error: (err as Error).message }
    }
  })

  // ---- folder config / mapping ----

  app.get('/config', async (req) => {
    const root = resolveRoot((req.query as Record<string, unknown>)?.root)
    const cfg = await loadConfig(root)
    return {
      root,
      configured: await isConfigured(root),
      autoRecognised: await isAutoRecognised(root),
      title: cfg?.title,
      wordTarget: cfg?.wordTarget,
      roles: rolesOf(cfg),
      extraRoles: cfg?.extraRoles ?? {},
    }
  })

  app.get('/dirs', async (req) => {
    const root = resolveRoot((req.query as Record<string, unknown>)?.root)
    return { root, dirs: await listDirs(root) }
  })

  app.post('/config', async (req, reply) => {
    const b = req.body as {
      root?: string
      roles?: Partial<Roles>
      extraRoles?: Record<string, string>
      title?: string
      wordTarget?: number
    }
    const root = resolveRoot(b?.root)
    const existing = await loadConfig(root)
    const extraRoles = cleanExtraRoles(b?.extraRoles)
    const wt = Number(b?.wordTarget)
    try {
      await saveConfig(root, {
        format: existing?.format ?? 'ghostwriter-config',
        version: existing?.version ?? 1,
        title: typeof b?.title === 'string' && b.title.trim() ? b.title.trim() : existing?.title,
        wordTarget: Number.isFinite(wt) && wt > 0 ? Math.round(wt) : existing?.wordTarget,
        roles: cleanRoles(b?.roles),
        ...(Object.keys(extraRoles).length ? { extraRoles } : {}),
        // Drop any stale explicit chapter list: re-mapping folders means re-discovery.
      })
      return loadProject(root)
    } catch (err) {
      reply.code(400)
      return { error: (err as Error).message }
    }
  })

  app.get('/file', async (req, reply) => {
    const q = req.query as Record<string, unknown>
    const root = resolveRoot(q?.root)
    try {
      const rel = String(q?.path ?? '')
      const content = await fs.readFile(safeJoin(root, rel), 'utf8')
      return { path: rel, content }
    } catch (err) {
      reply.code(400)
      return { error: (err as Error).message }
    }
  })

  app.put('/file', async (req, reply) => {
    const body = req.body as { root?: string; path?: string; content?: string }
    const root = resolveRoot(body?.root)
    try {
      const abs = safeJoin(root, String(body?.path ?? ''))
      const content = String(body?.content ?? '')
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, content, 'utf8')
      return { ok: true, bytes: Buffer.byteLength(content) }
    } catch (err) {
      reply.code(400)
      return { error: (err as Error).message }
    }
  })

  // ---- chapters / project settings ----

  app.post('/chapters', async (req, reply) => {
    const b = req.body as { root?: string; title?: string; afterId?: string }
    const root = resolveRoot(b?.root)
    const title = String(b?.title ?? '').trim()
    if (!title) {
      reply.code(400)
      return { error: 'title required' }
    }
    await manifest.createChapter(root, title, b?.afterId)
    return loadProject(root)
  })

  app.post('/chapters/delete', async (req, reply) => {
    const b = req.body as { root?: string; id?: string }
    const root = resolveRoot(b?.root)
    if (!b?.id) {
      reply.code(400)
      return { error: 'id required' }
    }
    await manifest.deleteChapter(root, b.id)
    return loadProject(root)
  })

  app.post('/chapters/reorder', async (req, reply) => {
    const b = req.body as { root?: string; ids?: string[] }
    const root = resolveRoot(b?.root)
    if (!Array.isArray(b?.ids)) {
      reply.code(400)
      return { error: 'ids array required' }
    }
    await manifest.reorderChapters(root, b.ids)
    return loadProject(root)
  })

  app.post('/project/target', async (req, reply) => {
    const b = req.body as { root?: string; wordTarget?: number }
    const root = resolveRoot(b?.root)
    const n = Number(b?.wordTarget)
    if (!Number.isFinite(n) || n <= 0) {
      reply.code(400)
      return { error: 'wordTarget must be a positive number' }
    }
    await manifest.setWordTarget(root, n)
    return loadProject(root)
  })

  // ---- characters ----

  app.get('/characters', async (req) => {
    const root = resolveRoot((req.query as Record<string, unknown>)?.root)
    return { characters: await chars.listCharacters(root) }
  })

  app.put('/characters', async (req, reply) => {
    const b = req.body as { root?: string; character?: chars.Character }
    const root = resolveRoot(b?.root)
    if (!b?.character?.name) {
      reply.code(400)
      return { error: 'character.name required' }
    }
    return chars.saveCharacter(root, b.character)
  })

  app.post('/characters/delete', async (req, reply) => {
    const b = req.body as { root?: string; id?: string }
    const root = resolveRoot(b?.root)
    if (!b?.id) {
      reply.code(400)
      return { error: 'id required' }
    }
    await chars.deleteCharacter(root, b.id)
    return { ok: true }
  })

  app.get('/characters/timeline', async (req) => {
    const q = req.query as Record<string, unknown>
    const root = resolveRoot(q?.root)
    const name = typeof q?.name === 'string' ? q.name : ''
    return { appearances: await chars.characterTimeline(root, name) }
  })

  // ---- timeline ----

  app.get('/timeline', async (req) => {
    const root = resolveRoot((req.query as Record<string, unknown>)?.root)
    return timeline.listTimeline(root)
  })

  app.put('/timeline', async (req) => {
    const b = req.body as { root?: string; events?: timeline.TimelineEvent[] }
    const root = resolveRoot(b?.root)
    await timeline.saveTimeline(root, Array.isArray(b?.events) ? b.events : [])
    return timeline.listTimeline(root)
  })
}
