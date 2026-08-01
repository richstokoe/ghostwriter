import fs from 'node:fs/promises'
import path from 'node:path'
import {
  loadConfig,
  saveConfig,
  rolesOf,
  type GhostwriterConfig,
  type Roles,
} from './config'

export interface ManifestChapter {
  id: string
  file: string
  title?: string
  outline?: string
}

export interface Manifest {
  format: string
  version: number
  title: string
  /** directory holding chapter markdown (= roles.chapters) */
  manuscriptDir: string
  wordTarget: number
  chapters: ManifestChapter[]
  roles: Roles
  extraRoles?: Record<string, string>
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chapter'
}

function deriveTitle(content: string, file: string): string {
  const h1 = content.match(/^\s*#\s+(.+?)\s*$/m)
  if (h1) return h1[1].replace(/^\d+\s*[—–-]\s*/, '').trim()
  return path.basename(file).replace(/\.md$/i, '')
}

/** Map a chapter file to its outline note by mirroring the path from chapters/ into outline/. */
export function outlineFor(file: string, roles: Roles): string {
  const rel = path.relative(roles.chapters, file)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return path.join(roles.outline, path.basename(file))
  }
  return path.join(roles.outline, rel)
}

// Well-known meta files that live alongside chapters but aren't chapters themselves.
const NON_CHAPTER = new Set(['notes.md', 'readme.md', 'index.md', 'todo.md', 'outline.md'])

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Auto-discover chapters by scanning the chapters dir (numeric sort, title from H1). */
async function scanChapters(root: string, roles: Roles): Promise<ManifestChapter[]> {
  // Prefer the mapped chapters dir; if it's missing, fall back to top-level markdown.
  let dir = path.join(root, roles.chapters)
  let prefix = roles.chapters ? roles.chapters + '/' : ''
  if (!(await exists(dir))) {
    dir = root
    prefix = ''
  }
  let names: string[]
  try {
    names = (await fs.readdir(dir))
      .filter((n) => n.toLowerCase().endsWith('.md') && !n.startsWith('_') && !NON_CHAPTER.has(n.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  } catch {
    return []
  }
  const out: ManifestChapter[] = []
  for (let i = 0; i < names.length; i++) {
    const file = prefix + names[i]
    let content = ''
    try {
      content = await fs.readFile(path.join(root, file), 'utf8')
    } catch {
      /* unreadable */
    }
    out.push({
      id: `ch${String(i + 1).padStart(2, '0')}`,
      file,
      title: deriveTitle(content, file),
      outline: outlineFor(file, roles),
    })
  }
  return out
}

/** Always returns a mutable manifest; synthesizes chapters from a folder scan if none are listed. */
export async function ensureManifest(root: string): Promise<Manifest> {
  const cfg = await loadConfig(root)
  const roles = rolesOf(cfg)
  const title = cfg?.title ?? path.basename(root)
  const wordTarget = cfg?.wordTarget ?? 80000

  let chapters: ManifestChapter[]
  if (cfg && Array.isArray(cfg.chapters) && cfg.chapters.length > 0) {
    chapters = cfg.chapters
      .filter((c) => c && typeof c.file === 'string')
      .map((c) => ({
        id: c.id,
        file: c.file,
        title: c.title,
        outline: c.outline ?? outlineFor(c.file, roles),
      }))
  } else {
    chapters = await scanChapters(root, roles)
  }

  return {
    format: cfg?.format ?? 'ghostwriter-config',
    version: cfg?.version ?? 1,
    title,
    manuscriptDir: roles.chapters,
    wordTarget,
    chapters,
    roles,
    extraRoles: cfg?.extraRoles,
  }
}

/** Persist a manifest back into `.ghostwriter/config.json`, preserving roles/extras. */
export async function saveManifest(root: string, m: Manifest): Promise<void> {
  const cfg: GhostwriterConfig = {
    format: m.format || 'ghostwriter-config',
    version: m.version || 1,
    title: m.title,
    wordTarget: m.wordTarget,
    roles: m.roles,
    ...(m.extraRoles && Object.keys(m.extraRoles).length ? { extraRoles: m.extraRoles } : {}),
    chapters: m.chapters.map((c) => ({ id: c.id, file: c.file, title: c.title, outline: c.outline })),
  }
  await saveConfig(root, cfg)
}

function outlineTemplate(title: string): string {
  return `# ${title}\n\n**One purpose:** \n\n**Characters:** \n\n**Key events:**\n\n- \n\n## TODO\n\n- [ ] \n`
}

export async function createChapter(root: string, title: string, afterId?: string): Promise<Manifest> {
  const m = await ensureManifest(root)
  const num = String(m.chapters.length + 1).padStart(2, '0')
  const slug = slugify(title)
  let file = `${m.roles.chapters}/${num}-${slug}.md`
  let outline = outlineFor(file, m.roles)
  let n = 2
  while (await exists(path.join(root, file))) {
    file = `${m.roles.chapters}/${num}-${slug}-${n}.md`
    outline = outlineFor(file, m.roles)
    n++
  }
  let id = `ch-${slug}`
  let k = 2
  while (m.chapters.some((c) => c.id === id)) id = `ch-${slug}-${k++}`

  await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true })
  await fs.writeFile(
    path.join(root, file),
    `# ${m.chapters.length + 1} — ${title}\n\n> **Placeholder — not yet drafted.**\n`,
    'utf8',
  )
  await fs.mkdir(path.join(root, path.dirname(outline)), { recursive: true })
  await fs.writeFile(path.join(root, outline), outlineTemplate(title), 'utf8')

  const entry: ManifestChapter = { id, file, title, outline }
  const idx = afterId ? m.chapters.findIndex((c) => c.id === afterId) : -1
  if (idx >= 0) m.chapters.splice(idx + 1, 0, entry)
  else m.chapters.push(entry)
  await saveManifest(root, m)
  return m
}

export async function deleteChapter(root: string, id: string): Promise<Manifest> {
  const m = await ensureManifest(root)
  const idx = m.chapters.findIndex((c) => c.id === id)
  if (idx < 0) return m
  const [removed] = m.chapters.splice(idx, 1)
  await saveManifest(root, m)
  try {
    await fs.unlink(path.join(root, removed.file))
  } catch {
    /* already gone */
  }
  if (removed.outline) {
    try {
      await fs.unlink(path.join(root, removed.outline))
    } catch {
      /* already gone */
    }
  }
  return m
}

export async function reorderChapters(root: string, ids: string[]): Promise<Manifest> {
  const m = await ensureManifest(root)
  const byId = new Map(m.chapters.map((c) => [c.id, c]))
  const next: ManifestChapter[] = []
  for (const id of ids) {
    const c = byId.get(id)
    if (c) {
      next.push(c)
      byId.delete(id)
    }
  }
  for (const c of byId.values()) next.push(c)
  m.chapters = next
  await saveManifest(root, m)
  return m
}

export async function setWordTarget(root: string, wordTarget: number): Promise<Manifest> {
  const m = await ensureManifest(root)
  m.wordTarget = Math.max(1, Math.round(wordTarget))
  await saveManifest(root, m)
  return m
}
