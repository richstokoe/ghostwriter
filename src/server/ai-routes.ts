import type { FastifyPluginAsync } from 'fastify'
import { resolveRoot } from './paths'
import {
  PROVIDER_DEFAULTS,
  buildCharacterProfiles,
  buildPrompt,
  buildReviewPrompt,
  chatStream,
  listModels,
  loadConfig,
  publicConfig,
  saveConfig,
  type AiConfig,
  type DraftMode,
} from './ai'
import { saveCharacter } from './characters'

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
} as const

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/providers', async () => ({ providers: PROVIDER_DEFAULTS }))

  app.get('/config', async () => publicConfig(await loadConfig()))

  app.put('/config', async (req) => {
    const cfg = await saveConfig((req.body ?? {}) as Partial<AiConfig>)
    return publicConfig(cfg)
  })

  app.get('/models', async (_req, reply) => {
    try {
      return { models: await listModels(await loadConfig()) }
    } catch (err) {
      reply.code(502)
      return { error: (err as Error).message }
    }
  })

  // Streams the draft as Server-Sent Events: `reasoning` (a reasoning model's
  // thinking), `delta` (prose tokens), then `done` — or `error`.
  app.post('/generate', async (req, reply) => {
    const b = req.body as { root?: string; chapterFile?: string; mode?: DraftMode; prose?: string }
    const root = resolveRoot(b?.root)
    if (!b?.chapterFile) {
      reply.code(400)
      return { error: 'chapterFile required' }
    }
    const mode: DraftMode = b?.mode === 'chapter' ? 'chapter' : 'paragraph'

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, SSE_HEADERS)
    const send = (event: string, data: unknown) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    try {
      const cfg = await loadConfig()
      const { system, user, maxTokens } = await buildPrompt(root, b.chapterFile, mode, b.prose ?? '')
      await chatStream(cfg, system, user, maxTokens, (kind, text) => send(kind, { text }))
      send('done', {})
    } catch (err) {
      send('error', { message: (err as Error).message })
    }
    raw.end()
  })

  // Streams an editorial review the same way as /generate; the client accumulates the
  // `delta` text and parses it as a JSON array of notes when `done` arrives.
  app.post('/review', async (req, reply) => {
    const b = req.body as { root?: string; chapterFile?: string; prose?: string }
    const root = resolveRoot(b?.root)
    if (!b?.chapterFile) {
      reply.code(400)
      return { error: 'chapterFile required' }
    }

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, SSE_HEADERS)
    const send = (event: string, data: unknown) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    try {
      const cfg = await loadConfig()
      const { system, user, maxTokens } = await buildReviewPrompt(root, b.chapterFile, b.prose ?? '')
      await chatStream(cfg, system, user, maxTokens, (kind, text) => send(kind, { text }))
      send('done', {})
    } catch (err) {
      send('error', { message: (err as Error).message })
    }
    raw.end()
  })

  // Reads every chapter and (re)builds a profile for each character, overwriting the
  // character files. Streams `progress` messages, then `done` with the saved profiles.
  app.post('/characters/build', async (req, reply) => {
    const b = req.body as { root?: string }
    const root = resolveRoot(b?.root)

    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, SSE_HEADERS)
    const send = (event: string, data: unknown) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    try {
      const profiles = await buildCharacterProfiles(root, (message) => send('progress', { message }))
      const saved = []
      for (const c of profiles) {
        send('progress', { message: `Saving profile for ${c.name}…` })
        saved.push(await saveCharacter(root, c))
      }
      send('done', { characters: saved })
    } catch (err) {
      send('error', { message: (err as Error).message })
    }
    raw.end()
  })
}
