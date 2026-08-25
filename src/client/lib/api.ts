import type { FileContent, GitCommit, GitStatus, Project, Roles } from '../../shared/types'
import type { LintRule } from '../../shared/lint'
import { finishActivity, pushActivity, type ActivityKind } from './activity'

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null) u.set(k, v)
  const s = u.toString()
  return s ? `?${s}` : ''
}

/** Every server call goes through here so the Console panel can show it. */
async function apiFetch(kind: ActivityKind, label: string, url: string, init?: RequestInit): Promise<Response> {
  const id = pushActivity(kind, label, init?.method ?? 'GET')
  const t0 = performance.now()
  try {
    const res = await fetch(url, init)
    finishActivity(id, {
      status: res.ok ? 'ok' : 'error',
      durationMs: Math.round(performance.now() - t0),
      message: res.ok ? undefined : `HTTP ${res.status}`,
    })
    return res
  } catch (e) {
    finishActivity(id, { status: 'error', durationMs: Math.round(performance.now() - t0), message: (e as Error).message })
    throw e
  }
}

// ---------- project / files ----------

export async function fetchProject(root?: string): Promise<Project> {
  const res = await apiFetch('project', 'Load project', `/api/project${qs({ root })}`)
  if (!res.ok) throw new Error(`GET /project → ${res.status}`)
  return res.json()
}

// ---------- folder config / mapping ----------

export interface ConfigInfo {
  root: string
  configured: boolean
  autoRecognised: boolean
  title?: string
  wordTarget?: number
  roles: Roles
  extraRoles: Record<string, string>
}

export async function fetchConfig(root?: string): Promise<ConfigInfo> {
  const res = await apiFetch('project', 'Load folder config', `/api/config${qs({ root })}`)
  if (!res.ok) throw new Error(`GET /config → ${res.status}`)
  return res.json()
}

export async function listDirs(root?: string): Promise<string[]> {
  const res = await apiFetch('project', 'Scan folders', `/api/dirs${qs({ root })}`)
  if (!res.ok) throw new Error(`GET /dirs → ${res.status}`)
  return (await res.json()).dirs ?? []
}

export async function saveConfig(
  cfg: { roles: Partial<Roles>; extraRoles?: Record<string, string>; title?: string; wordTarget?: number },
  root?: string,
): Promise<Project> {
  const res = await apiFetch('project', 'Save folder config', '/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, ...cfg }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `POST /config → ${res.status}`)
  return data
}

export async function fetchFile(filePath: string, root?: string): Promise<FileContent> {
  const res = await apiFetch('file', `Open ${filePath}`, `/api/file${qs({ root, path: filePath })}`)
  if (!res.ok) throw new Error(`GET /file → ${res.status}`)
  return res.json()
}

export async function saveFile(filePath: string, content: string, root?: string): Promise<void> {
  const res = await apiFetch('file', `Save ${filePath}`, '/api/file', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, path: filePath, content }),
  })
  if (!res.ok) throw new Error(`PUT /file → ${res.status}`)
}

// ---------- chapters / project settings ----------

export async function createChapter(title: string, afterId?: string, root?: string): Promise<Project> {
  const res = await apiFetch('project', `Create chapter “${title}”`, '/api/chapters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, title, afterId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `POST /chapters → ${res.status}`)
  return data
}

export async function deleteChapter(id: string, root?: string): Promise<Project> {
  const res = await apiFetch('project', 'Delete chapter', '/api/chapters/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `POST /chapters/delete → ${res.status}`)
  return data
}

export async function reorderChapters(ids: string[], root?: string): Promise<Project> {
  const res = await apiFetch('project', 'Reorder chapters', '/api/chapters/reorder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, ids }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `POST /chapters/reorder → ${res.status}`)
  return data
}

export async function setWordTarget(wordTarget: number, root?: string): Promise<Project> {
  const res = await apiFetch('project', `Set word target → ${wordTarget.toLocaleString()}`, '/api/project/target', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, wordTarget }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `POST /project/target → ${res.status}`)
  return data
}

// ---------- characters ----------

export interface Character {
  id: string
  name: string
  role?: string
  age?: string
  aka?: string
  status?: string
  description: string
}

export interface CharacterEvent {
  chapter: string
  title: string
  events: string[]
}

export async function listCharacters(root?: string): Promise<Character[]> {
  const res = await apiFetch('char', 'Load characters', `/api/characters${qs({ root })}`)
  if (!res.ok) throw new Error(`GET /characters → ${res.status}`)
  return (await res.json()).characters ?? []
}

export async function saveCharacter(character: Character, root?: string): Promise<Character> {
  const res = await apiFetch('char', `Save character ${character.name}`, '/api/characters', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, character }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `PUT /characters → ${res.status}`)
  return data
}

export async function deleteCharacter(id: string, root?: string): Promise<void> {
  const res = await apiFetch('char', 'Delete character', '/api/characters/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, id }),
  })
  if (!res.ok) throw new Error(`POST /characters/delete → ${res.status}`)
}

export async function characterTimeline(name: string, root?: string): Promise<CharacterEvent[]> {
  const res = await apiFetch('ai', `Derive timeline: ${name}`, `/api/characters/timeline${qs({ root, name })}`)
  if (!res.ok) throw new Error(`GET /characters/timeline → ${res.status}`)
  return (await res.json()).appearances ?? []
}

// ---------- timeline ----------

export interface TimelineEvent {
  id: string
  when: string
  title: string
  chapter?: string
  note?: string
}
export interface DerivedGroup {
  chapter: string
  title: string
  events: string[]
}
export interface TimelineData {
  events: TimelineEvent[]
  derived: DerivedGroup[]
}

export async function fetchTimeline(root?: string): Promise<TimelineData> {
  const res = await apiFetch('project', 'Load timeline', `/api/timeline${qs({ root })}`)
  if (!res.ok) throw new Error(`GET /timeline → ${res.status}`)
  return res.json()
}

export async function saveTimeline(events: TimelineEvent[], root?: string): Promise<TimelineData> {
  const res = await apiFetch('project', 'Save timeline', '/api/timeline', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, events }),
  })
  if (!res.ok) throw new Error(`PUT /timeline → ${res.status}`)
  return res.json()
}

// ---------- voice / lint ----------

export interface VoiceConfig {
  voice: string
  rules: LintRule[]
  custom: boolean
}

export async function fetchVoice(root?: string): Promise<VoiceConfig> {
  const res = await apiFetch('voice', 'Load voice & rules', `/api/voice${qs({ root })}`)
  if (!res.ok) throw new Error(`GET /voice → ${res.status}`)
  return res.json()
}

export async function saveVoice(content: string, root?: string): Promise<void> {
  const res = await apiFetch('voice', 'Save voice', '/api/voice', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, content }),
  })
  if (!res.ok) throw new Error(`PUT /voice → ${res.status}`)
}

// ---------- ai ----------

export interface AiPublicConfig {
  provider: string
  baseUrl: string
  model: string
  hasKey: boolean
}
export interface ProviderInfo {
  baseUrl: string
  label: string
  needsKey: boolean
}

export async function fetchAiProviders(): Promise<Record<string, ProviderInfo>> {
  const res = await apiFetch('ai', 'AI: providers', '/api/ai/providers')
  if (!res.ok) throw new Error(`GET /ai/providers → ${res.status}`)
  return (await res.json()).providers
}

export async function fetchAiConfig(): Promise<AiPublicConfig> {
  const res = await apiFetch('ai', 'AI: load settings', '/api/ai/config')
  if (!res.ok) throw new Error(`GET /ai/config → ${res.status}`)
  return res.json()
}

export async function saveAiConfig(patch: Partial<AiPublicConfig & { apiKey: string }>): Promise<AiPublicConfig> {
  const res = await apiFetch('ai', 'AI: save settings', '/api/ai/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`PUT /ai/config → ${res.status}`)
  return res.json()
}

export async function fetchAiModels(): Promise<string[]> {
  const res = await apiFetch('ai', 'AI: list models', '/api/ai/models')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `GET /ai/models → ${res.status}`)
  return data.models ?? []
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  onReasoning?: (text: string) => void
}

/** POST a JSON body and consume the SSE reply (`delta`/`reasoning`/`error`); resolves with the full `delta` text. */
async function postSSE(url: string, label: string, body: unknown, handlers: StreamHandlers): Promise<string> {
  const id = pushActivity('ai', label, 'POST')
  const t0 = performance.now()
  let full = ''
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) throw new Error(`POST ${url} → ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let event = 'message'

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        if (line.startsWith('event:')) {
          event = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          const payload = JSON.parse(line.slice(5).trim())
          if (event === 'delta') {
            full += payload.text
            handlers.onDelta(payload.text)
          } else if (event === 'reasoning') {
            handlers.onReasoning?.(payload.text)
          } else if (event === 'error') {
            throw new Error(payload.message)
          }
        } else if (line === '') {
          event = 'message'
        }
      }
    }
    finishActivity(id, { status: 'ok', durationMs: Math.round(performance.now() - t0) })
    return full
  } catch (e) {
    finishActivity(id, { status: 'error', durationMs: Math.round(performance.now() - t0), message: (e as Error).message })
    throw e
  }
}

/** Streams a draft over SSE, invoking handlers as tokens arrive; resolves with the full prose. */
export function aiGenerateStream(
  chapterFile: string,
  mode: 'paragraph' | 'chapter',
  prose: string,
  root: string | undefined,
  handlers: StreamHandlers,
): Promise<string> {
  return postSSE('/api/ai/generate', `AI: stream ${mode}`, { root, chapterFile, mode, prose }, handlers)
}

export interface ReviewNote {
  quote: string
  issue: string
  replacement: string
}

/** Streams an editorial review; resolves with the raw JSON text to be parsed by parseReviewNotes. */
export function aiReviewStream(
  chapterFile: string,
  prose: string,
  root: string | undefined,
  handlers: StreamHandlers,
): Promise<string> {
  return postSSE('/api/ai/review', 'AI: review chapter', { root, chapterFile, prose }, handlers)
}

/** Leniently extract the JSON notes array from a model reply (tolerates code fences / stray prose). */
export function parseReviewNotes(raw: string): ReviewNote[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end < 0 || end < start) return []
  let arr: unknown
  try {
    arr = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .filter((n) => typeof n.quote === 'string' && typeof n.issue === 'string')
    .map((n) => ({
      quote: String(n.quote),
      issue: String(n.issue),
      replacement: typeof n.replacement === 'string' ? n.replacement : '',
    }))
}

// ---------- git ----------

export async function gitStatus(root?: string): Promise<GitStatus> {
  const res = await apiFetch('git', 'Git: status', `/api/git/status${qs({ root })}`)
  if (!res.ok) throw new Error(`GET /git/status → ${res.status}`)
  return res.json()
}

export async function gitInit(root?: string): Promise<GitStatus> {
  const res = await apiFetch('git', 'Git: init repository', '/api/git/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root }),
  })
  if (!res.ok) throw new Error(`POST /git/init → ${res.status}`)
  return res.json()
}

export async function gitCommit(message: string, paths?: string[], root?: string): Promise<void> {
  const res = await apiFetch('git', `Git: commit — ${message}`, '/api/git/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root, message, paths }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? `POST /git/commit → ${res.status}`)
}

export async function gitLog(filePath?: string, root?: string): Promise<GitCommit[]> {
  const res = await apiFetch('git', 'Git: history', `/api/git/log${qs({ root, path: filePath })}`)
  if (!res.ok) throw new Error(`GET /git/log → ${res.status}`)
  return (await res.json()).commits ?? []
}

export async function gitDiff(filePath?: string, hash?: string, root?: string): Promise<string> {
  const res = await apiFetch('git', 'Git: diff', `/api/git/diff${qs({ root, path: filePath, hash })}`)
  if (!res.ok) throw new Error(`GET /git/diff → ${res.status}`)
  return (await res.json()).diff ?? ''
}

// ---------- project-wide search ("Find anywhere") ----------

export interface SearchMatch {
  line: number
  col: number
  length: number
  text: string
}

export interface SearchFileResult {
  file: string
  role: string
  label: string
  matches: SearchMatch[]
}

export interface SearchResults {
  query: string
  results: SearchFileResult[]
  fileCount: number
  matchCount: number
  truncated: boolean
}

export async function searchAll(query: string, root?: string): Promise<SearchResults> {
  const res = await apiFetch('project', `Search: ${query}`, `/api/search${qs({ root, q: query })}`)
  if (!res.ok) throw new Error(`GET /search → ${res.status}`)
  return res.json()
}
