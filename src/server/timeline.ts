import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { ensureManifest } from './manifest'
import { loadConfig, rolesOf } from './config'

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

const EVENTS_FILE = 'events.yml'

function parseKeyEvents(content: string): string[] {
  const keyIdx = content.search(/\*\*Key events:\*\*/i)
  if (keyIdx < 0) return []
  let section = content.slice(keyIdx)
  const todoIdx = section.search(/^##\s+TODO/im)
  if (todoIdx >= 0) section = section.slice(0, todoIdx)
  return Array.from(section.matchAll(/^\s*-\s+(.+)$/gm)).map((m) => m[1].trim())
}

export async function listTimeline(root: string): Promise<{ events: TimelineEvent[]; derived: DerivedGroup[] }> {
  const timelineDir = rolesOf(await loadConfig(root)).timeline
  let events: TimelineEvent[] = []
  try {
    const parsed = YAML.parse(await fs.readFile(path.join(root, timelineDir, EVENTS_FILE), 'utf8'))
    if (Array.isArray(parsed)) {
      events = parsed
        .filter((e) => e && typeof e.title === 'string')
        .map((e, i) => ({
          id: typeof e.id === 'string' ? e.id : `ev-${i}`,
          when: e.when ?? '',
          title: e.title,
          chapter: e.chapter,
          note: e.note,
        }))
    }
  } catch {
    /* no timeline yet */
  }

  const derived: DerivedGroup[] = []
  const m = await ensureManifest(root)
  for (const ch of m.chapters) {
    if (!ch.outline) continue
    let content = ''
    try {
      content = await fs.readFile(path.join(root, ch.outline), 'utf8')
    } catch {
      continue
    }
    const evs = parseKeyEvents(content)
    if (evs.length) derived.push({ chapter: ch.file, title: ch.title ?? ch.file, events: evs })
  }

  return { events, derived }
}

export async function saveTimeline(root: string, events: TimelineEvent[]): Promise<void> {
  const timelineDir = rolesOf(await loadConfig(root)).timeline
  await fs.mkdir(path.join(root, timelineDir), { recursive: true })
  const clean = events.map((e) => ({
    id: e.id,
    when: e.when ?? '',
    title: e.title ?? '',
    ...(e.chapter ? { chapter: e.chapter } : {}),
    ...(e.note ? { note: e.note } : {}),
  }))
  await fs.writeFile(path.join(root, timelineDir, EVENTS_FILE), YAML.stringify(clean), 'utf8')
}
