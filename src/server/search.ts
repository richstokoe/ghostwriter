import fs from 'node:fs/promises'
import path from 'node:path'
import { loadConfig, rolesOf } from './config'
import type { Roles } from '../shared/types'

// Directories never worth searching (mirrors api.ts's listDirs ignore set).
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.ghostwriter', '.obsidian'])
// Only text formats a book project stores prose/metadata in.
const TEXT_EXT = new Set(['.md', '.markdown', '.mdx', '.txt', '.yml', '.yaml'])

const MAX_FILE_BYTES = 2_000_000 // skip anything implausibly large for prose
const MAX_MATCHES_PER_FILE = 30
const MAX_TOTAL_MATCHES = 800
const CLIP_CONTEXT = 80 // characters of context shown either side of a long-line match

// Role display order; anything unmapped falls through to 'other'.
const ROLE_ORDER = ['chapters', 'outline', 'characters', 'timeline', 'voice', 'other']

export interface SearchMatch {
  /** 1-based line number in the file */
  line: number
  /** 0-based column of the match within `text` (already adjusted for any clipping) */
  col: number
  /** length of the matched substring */
  length: number
  /** the (possibly clipped) line text to show, with … markers when clipped */
  text: string
}

export interface SearchFileResult {
  /** path relative to the project root, posix-style */
  file: string
  /** which mapped role this file belongs to (chapters/outline/…/other) */
  role: string
  /** friendly label — the basename without its extension */
  label: string
  matches: SearchMatch[]
}

export interface SearchResults {
  query: string
  results: SearchFileResult[]
  fileCount: number
  matchCount: number
  /** true when the match/ file caps were hit and some results were dropped */
  truncated: boolean
}

/** Build [role, dir] pairs sorted longest-dir-first so the most specific role wins. */
function roleDirs(roles: Roles): [string, string][] {
  return Object.entries(roles)
    .filter(([, dir]) => dir)
    .map(([role, dir]) => [role, dir.replace(/\/+$/, '')] as [string, string])
    .sort((a, b) => b[1].length - a[1].length)
}

function roleForPath(rel: string, dirs: [string, string][]): string {
  for (const [role, dir] of dirs) {
    if (rel === dir || rel.startsWith(dir + '/')) return role
  }
  return 'other'
}

/** Clip a long line down to a readable window around the match, keeping col in sync. */
function clip(line: string, col: number, length: number): { text: string; col: number } {
  if (line.length <= CLIP_CONTEXT * 2 + length) return { text: line, col }
  const start = Math.max(0, col - CLIP_CONTEXT)
  const end = Math.min(line.length, col + length + CLIP_CONTEXT)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < line.length ? '…' : ''
  return { text: prefix + line.slice(start, end) + suffix, col: col - start + prefix.length }
}

/** Recursively collect searchable text files under root (relative posix paths). */
async function walk(root: string): Promise<string[]> {
  const out: string[] = []
  async function recurse(rel: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(path.join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name) || e.name.startsWith('dist')) continue
        await recurse(child)
      } else if (e.isFile() && TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
        out.push(child)
      }
    }
  }
  await recurse('')
  return out.sort((a, b) => a.localeCompare(b))
}

/** Case-insensitive plain-substring search across every text file in the project. */
export async function searchProject(root: string, rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim()
  const empty: SearchResults = { query, results: [], fileCount: 0, matchCount: 0, truncated: false }
  if (query.length < 2) return empty

  const dirs = roleDirs(rolesOf(await loadConfig(root)))
  const needle = query.toLowerCase()
  const files = await walk(root)

  const results: SearchFileResult[] = []
  let matchCount = 0
  let truncated = false

  for (const rel of files) {
    if (matchCount >= MAX_TOTAL_MATCHES) {
      truncated = true
      break
    }
    let content: string
    try {
      const stat = await fs.stat(path.join(root, rel))
      if (stat.size > MAX_FILE_BYTES) continue
      content = await fs.readFile(path.join(root, rel), 'utf8')
    } catch {
      continue
    }
    if (!content.toLowerCase().includes(needle)) continue

    const matches: SearchMatch[] = []
    const lines = content.split('\n')
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
      const lower = lines[i].toLowerCase()
      let from = 0
      let col = lower.indexOf(needle, from)
      while (col >= 0 && matches.length < MAX_MATCHES_PER_FILE) {
        const clipped = clip(lines[i], col, query.length)
        matches.push({ line: i + 1, col: clipped.col, length: query.length, text: clipped.text })
        from = col + needle.length
        col = lower.indexOf(needle, from)
      }
    }
    if (matches.length === 0) continue
    if (matches.length >= MAX_MATCHES_PER_FILE) truncated = true

    matchCount += matches.length
    results.push({
      file: rel,
      role: roleForPath(rel, dirs),
      label: path.basename(rel).replace(/\.[^.]+$/, ''),
      matches,
    })
  }

  results.sort((a, b) => {
    const ra = ROLE_ORDER.indexOf(a.role)
    const rb = ROLE_ORDER.indexOf(b.role)
    const oa = ra < 0 ? ROLE_ORDER.length : ra
    const ob = rb < 0 ? ROLE_ORDER.length : rb
    return oa - ob || a.file.localeCompare(b.file)
  })

  return { query, results, fileCount: results.length, matchCount, truncated }
}
