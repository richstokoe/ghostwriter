import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadVoice } from './voice'
import { ensureManifest, outlineFor } from './manifest'
import type { LintRule } from '../shared/lint'

export type Provider = 'ollama' | 'lmstudio' | 'openai' | 'anthropic'

export interface AiConfig {
  provider: Provider
  baseUrl: string
  model: string
  apiKey: string
}

export interface ProviderInfo {
  baseUrl: string
  label: string
  needsKey: boolean
}

export const PROVIDER_DEFAULTS: Record<Provider, ProviderInfo> = {
  ollama: { baseUrl: 'http://localhost:11434/v1', label: 'Ollama (local)', needsKey: false },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', label: 'LM Studio (local)', needsKey: false },
  openai: { baseUrl: 'https://api.openai.com/v1', label: 'OpenAI', needsKey: true },
  anthropic: { baseUrl: 'https://api.anthropic.com', label: 'Anthropic', needsKey: true },
}

const DEFAULT_CONFIG: AiConfig = {
  provider: 'ollama',
  baseUrl: PROVIDER_DEFAULTS.ollama.baseUrl,
  model: '',
  apiKey: '',
}

const CONFIG_PATH = path.join(os.homedir(), '.ghostwriter', 'config.json')

export async function loadConfig(): Promise<AiConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(patch: Partial<AiConfig>): Promise<AiConfig> {
  const current = await loadConfig()
  const next: AiConfig = { ...current }
  if (patch.provider && patch.provider in PROVIDER_DEFAULTS) next.provider = patch.provider
  if (typeof patch.baseUrl === 'string' && patch.baseUrl) next.baseUrl = patch.baseUrl
  if (typeof patch.model === 'string') next.model = patch.model
  // Only overwrite the key when a non-empty one is supplied (client sends "" for "unchanged").
  if (typeof patch.apiKey === 'string' && patch.apiKey.length > 0) next.apiKey = patch.apiKey
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8')
  return next
}

/** Config safe to send to the browser — never leaks the API key itself. */
export function publicConfig(cfg: AiConfig) {
  return { provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, hasKey: cfg.apiKey.length > 0 }
}

async function jfetch(url: string, opts: RequestInit, timeoutMs = 120000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } catch (err) {
    const e = err as Error
    if (e.name === 'AbortError') throw new Error(`request to ${url} timed out`)
    throw new Error(`could not reach ${url}: ${e.message}`)
  } finally {
    clearTimeout(timer)
  }
}

export async function listModels(cfg: AiConfig): Promise<string[]> {
  if (cfg.provider === 'anthropic') {
    const res = await jfetch(`${cfg.baseUrl}/v1/models`, {
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    }, 15000)
    if (!res.ok) throw new Error(`models ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return (data.data ?? []).map((m: { id: string }) => m.id)
  }
  const headers: Record<string, string> = {}
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`
  const res = await jfetch(`${cfg.baseUrl}/models`, { headers }, 15000)
  if (!res.ok) throw new Error(`models ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.data ?? []).map((m: { id: string }) => m.id)
}

// Generous ceiling for a slow local model that may also emit hidden reasoning tokens.
const GENERATE_TIMEOUT_MS = 600000

async function chat(cfg: AiConfig, system: string, user: string, maxTokens: number): Promise<string> {
  if (!cfg.model) throw new Error('no model selected — pick one in AI settings')

  if (cfg.provider === 'anthropic') {
    const res = await jfetch(
      `${cfg.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      },
      GENERATE_TIMEOUT_MS,
    )
    if (!res.ok) throw new Error(`generate ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return (data.content ?? []).map((c: { text?: string }) => c.text ?? '').join('')
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`
  const res = await jfetch(
    `${cfg.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        stream: false,
      }),
    },
    GENERATE_TIMEOUT_MS,
  )
  if (!res.ok) throw new Error(`generate ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const choice = data.choices?.[0]
  const content: string = choice?.message?.content ?? ''
  // Reasoning models put chain-of-thought in a separate field; if the answer is empty
  // because the token budget was spent thinking, say so plainly.
  if (!content.trim() && choice?.finish_reason === 'length') {
    throw new Error('the model hit its token limit before producing prose (it may be a reasoning model spending the budget on thinking) — try a higher limit or a non-reasoning model')
  }
  return content
}

function rulesSummary(rules: LintRule[]): string {
  const parts: string[] = []
  for (const r of rules) {
    if (r.tokens?.length) parts.push(...r.tokens)
    else if (r.pattern) parts.push(r.name)
  }
  // Keep the prompt compact — a long banned-word dump only makes a reasoning model
  // deliberate longer.
  const shown = parts.slice(0, 24)
  return shown.join(', ') + (parts.length > shown.length ? ', …' : '')
}

async function resolveOutline(root: string, chapterFile: string): Promise<string> {
  const m = await ensureManifest(root)
  const ch = m.chapters.find((c) => c.file === chapterFile)
  const rel = ch?.outline ?? outlineFor(chapterFile, m.roles)
  try {
    return await fs.readFile(path.join(root, rel), 'utf8')
  } catch {
    return ''
  }
}

export type DraftMode = 'paragraph' | 'chapter'

interface Prompt {
  system: string
  user: string
  maxTokens: number
}

export async function buildPrompt(root: string, chapterFile: string, mode: DraftMode, prose: string): Promise<Prompt> {
  const { voice, rules } = await loadVoice(root)
  const outline = await resolveOutline(root, chapterFile)

  const system = [
    "You are a novelist's drafting assistant. Write prose in the author's established voice.",
    'Output ONLY the prose itself — no preamble, no headings, no commentary, no markdown code fences.',
    'Answer directly with the prose; do not deliberate at length first.',
    voice ? `\nAUTHOR VOICE:\n${voice}` : '',
    rules.length ? `\nAvoid these tells of AI writing: ${rulesSummary(rules)}.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const user =
    mode === 'chapter'
      ? `CHAPTER OUTLINE:\n${outline || '(no outline provided)'}\n\nWrite the full chapter as immersive, scene-driven prose. Do not summarise; render it on the page.`
      : `CHAPTER OUTLINE:\n${outline || '(no outline provided)'}\n\nTHE CHAPTER SO FAR:\n${prose || '(empty — this is the opening)'}\n\nWrite ONLY the next paragraph that should follow, continuing seamlessly. Do not repeat existing text or add a heading.`

  return { system, user, maxTokens: mode === 'chapter' ? 16000 : 6000 }
}

/**
 * A hard editorial review of the chapter. Uses the author's "200-IQ editor at a top publisher"
 * persona and asks for STRICT JSON notes so each one can be applied as a find/replace edit.
 */
export async function buildReviewPrompt(root: string, chapterFile: string, prose: string): Promise<Prompt> {
  const { voice, rules } = await loadVoice(root)
  const outline = await resolveOutline(root, chapterFile)

  const system = [
    'You are a 200-IQ book editor at a top publishing house that publishes only genuinely ground-breaking, once-in-a-generation, life-changing fiction.',
    'Review the chapter with rigorous, unsparing scrutiny. No sycophancy — really, none. Challenge anything clichéd, on-the-nose, overwritten, melodramatic, or underdeveloped. The author wants scrutiny, not encouragement; a strong passage should survive the challenge.',
    'Respond with STRICT JSON ONLY: a single array of note objects and nothing else — no preamble, no commentary, no markdown, no code fences.',
    'Each note is an object with exactly these keys:',
    '  "quote": the exact, verbatim span of the author\'s text your note is about (copy it character-for-character so it can be located; keep it to a sentence or two),',
    '  "issue": what is weak and why, in one or two sentences,',
    '  "replacement": a concrete rewrite of that exact span, in the author\'s established voice — or an empty string "" if the note is purely structural and has no direct textual fix.',
    'Prefer 3–8 high-impact notes over exhaustive nitpicking. Respect the author\'s voice and the chapter outline.',
    voice ? `\nAUTHOR VOICE:\n${voice}` : '',
    rules.length ? `\nThe author is trying to avoid these tells of AI writing: ${rulesSummary(rules)}.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const user = `CHAPTER OUTLINE:\n${outline || '(none provided)'}\n\nCHAPTER TEXT:\n${prose || '(empty)'}\n\nReturn the JSON array of notes now.`
  return { system, user, maxTokens: 6000 }
}

export async function generateDraft(root: string, chapterFile: string, mode: DraftMode, prose: string): Promise<string> {
  const cfg = await loadConfig()
  const { system, user, maxTokens } = await buildPrompt(root, chapterFile, mode, prose)
  const text = await chat(cfg, system, user, maxTokens)
  return text.trim()
}

// ---------- streaming ----------

/** kind 'delta' = prose tokens; 'reasoning' = a reasoning model's hidden chain-of-thought. */
export type StreamEvent = (kind: 'reasoning' | 'delta', text: string) => void

export async function chatStream(cfg: AiConfig, system: string, user: string, maxTokens: number, onEvent: StreamEvent): Promise<void> {
  if (!cfg.model) throw new Error('no model selected — pick one in AI settings')

  if (cfg.provider === 'anthropic') {
    const res = await jfetch(
      `${cfg.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, stream: true, system, messages: [{ role: 'user', content: user }] }),
      },
      GENERATE_TIMEOUT_MS,
    )
    if (!res.ok) throw new Error(`generate ${res.status}: ${await res.text()}`)
    await parseSSE(res, (json) => {
      if (json.type === 'content_block_delta') {
        if (json.delta?.type === 'text_delta' && json.delta.text) onEvent('delta', json.delta.text)
        else if (json.delta?.type === 'thinking_delta' && json.delta.thinking) onEvent('reasoning', json.delta.thinking)
      }
    })
    return
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`
  const res = await jfetch(
    `${cfg.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        stream: true,
      }),
    },
    GENERATE_TIMEOUT_MS,
  )
  if (!res.ok) throw new Error(`generate ${res.status}: ${await res.text()}`)
  await parseSSE(res, (json) => {
    const delta = json.choices?.[0]?.delta
    if (!delta) return
    if (delta.reasoning_content) onEvent('reasoning', delta.reasoning_content)
    if (delta.content) onEvent('delta', delta.content)
  })
}

/** Read an SSE response body and hand each parsed `data:` JSON object to `onData`. */
async function parseSSE(res: Response, onData: (json: any) => void): Promise<void> {
  if (!res.body) throw new Error('no response body to stream')
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '')
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        onData(JSON.parse(data))
      } catch {
        /* skip non-JSON keep-alives */
      }
    }
  }
}
