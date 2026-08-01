import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureManifest } from './manifest'
import { loadConfig, rolesOf } from './config'

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

const FIELDS: (keyof Character)[] = ['name', 'role', 'age', 'aka', 'status']

async function charactersDir(root: string): Promise<string> {
  return rolesOf(await loadConfig(root)).characters
}

function safeId(id: string): string {
  return (id || '').replace(/[^a-z0-9-]/gi, '-').replace(/^-+|-+$/g, '') || 'character'
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: raw.trim() }
  const data: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { data, body: m[2].trim() }
}

function serialize(c: Character): string {
  const fm: string[] = []
  for (const f of FIELDS) {
    const v = c[f]
    if (v) fm.push(`${f}: ${v}`)
  }
  return `---\n${fm.join('\n')}\n---\n\n${c.description ?? ''}\n`
}

export async function listCharacters(root: string): Promise<Character[]> {
  const dir = path.join(root, await charactersDir(root))
  let names: string[]
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md')).sort()
  } catch {
    return []
  }
  const out: Character[] = []
  for (const n of names) {
    const raw = await fs.readFile(path.join(dir, n), 'utf8')
    const { data, body } = parseFrontmatter(raw)
    const id = n.replace(/\.md$/, '')
    out.push({
      id,
      name: data.name ?? id,
      role: data.role,
      age: data.age,
      aka: data.aka,
      status: data.status,
      description: body,
    })
  }
  return out
}

export async function saveCharacter(root: string, c: Character): Promise<Character> {
  const id = safeId(c.id)
  const dir = path.join(root, await charactersDir(root))
  await fs.mkdir(dir, { recursive: true })
  const saved = { ...c, id }
  await fs.writeFile(path.join(dir, `${id}.md`), serialize(saved), 'utf8')
  return saved
}

export async function deleteCharacter(root: string, id: string): Promise<void> {
  try {
    await fs.unlink(path.join(root, await charactersDir(root), `${safeId(id)}.md`))
  } catch {
    /* already gone */
  }
}

function parseOutline(content: string): { characters: string; events: string[] } {
  const characters = content.match(/\*\*Characters:\*\*\s*(.+)/i)?.[1] ?? ''
  let events: string[] = []
  const keyIdx = content.search(/\*\*Key events:\*\*/i)
  if (keyIdx >= 0) {
    let section = content.slice(keyIdx)
    const todoIdx = section.search(/^##\s+TODO/im)
    if (todoIdx >= 0) section = section.slice(0, todoIdx)
    events = Array.from(section.matchAll(/^\s*-\s+(.+)$/gm)).map((mm) => mm[1].trim())
  }
  return { characters, events }
}

/** Derive where a character appears and the key events of those chapters, from the outlines. */
export async function characterTimeline(root: string, name: string): Promise<CharacterEvent[]> {
  if (!name.trim()) return []
  const m = await ensureManifest(root)
  const needle = name.toLowerCase().trim()
  const first = needle.split(/\s+/)[0]
  const out: CharacterEvent[] = []
  for (const ch of m.chapters) {
    if (!ch.outline) continue
    let content = ''
    try {
      content = await fs.readFile(path.join(root, ch.outline), 'utf8')
    } catch {
      continue
    }
    const { characters, events } = parseOutline(content)
    const cl = characters.toLowerCase()
    const inList = cl.includes(needle) || (first.length > 2 && cl.includes(first))
    const inBody = content.toLowerCase().includes(needle)
    if (!inList && !inBody) continue
    const relevant = events.filter((e) => {
      const el = e.toLowerCase()
      return el.includes(needle) || (first.length > 2 && el.includes(first))
    })
    out.push({ chapter: ch.file, title: ch.title ?? ch.file, events: relevant.length ? relevant : events })
  }
  return out
}
