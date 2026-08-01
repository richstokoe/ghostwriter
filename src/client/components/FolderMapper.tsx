import { useEffect, useMemo, useState } from 'react'
import { fetchConfig, listDirs, saveConfig, type ConfigInfo } from '../lib/api'
import type { Project, Roles } from '../../shared/types'

type RoleKey = keyof Roles

const ROLE_ROWS: { key: RoleKey; label: string; hint: string }[] = [
  { key: 'chapters', label: 'Chapters', hint: 'Manuscript markdown — one file per chapter' },
  { key: 'outline', label: 'Outlines', hint: 'Per-chapter notes: purpose, characters, key events' },
  { key: 'characters', label: 'Characters', hint: 'One markdown file per character (with frontmatter)' },
  { key: 'timeline', label: 'Timeline', hint: 'Holds events.yml' },
  { key: 'voice', label: 'Voice & style', hint: 'voice.md + rules.yml' },
]

// Ordered name heuristics: the first dir matching any pattern wins.
const HEURISTICS: Record<RoleKey, RegExp[]> = {
  chapters: [/^(manuscript|chapters|novel|book)$/i, /(manuscript|chapter|novel)/i],
  outline: [/(outline|brief|spec)/i],
  characters: [/^(characters|cast)$/i, /(character|cast)/i],
  timeline: [/^timeline$/i, /(timeline|chronology)/i],
  voice: [/^(voice|style|styles)$/i, /(voice|style)/i],
}

function guessRoles(dirs: string[]): Partial<Roles> {
  const out: Partial<Roles> = {}
  for (const row of ROLE_ROWS) {
    for (const re of HEURISTICS[row.key]) {
      const hit = dirs.find((d) => re.test(d))
      if (hit) {
        out[row.key] = hit
        break
      }
    }
  }
  return out
}

export function FolderMapper({
  root,
  onSaved,
  onClose,
}: {
  root?: string
  onSaved: (p: Project) => void
  onClose: () => void
}) {
  const [info, setInfo] = useState<ConfigInfo | null>(null)
  const [dirs, setDirs] = useState<string[]>([])
  const [roles, setRoles] = useState<Partial<Roles>>({})
  const [extra, setExtra] = useState<{ name: string; dir: string }[]>([])
  const [title, setTitle] = useState('')
  const [wordTarget, setWordTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchConfig(root), listDirs(root)])
      .then(([cfg, ds]) => {
        if (!alive) return
        setInfo(cfg)
        setDirs(ds)
        setTitle(cfg.title ?? '')
        setWordTarget(cfg.wordTarget ? String(cfg.wordTarget) : '')
        setRoles(cfg.configured ? cfg.roles : guessRoles(ds))
        setExtra(Object.entries(cfg.extraRoles).map(([name, dir]) => ({ name, dir })))
      })
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
  }, [root])

  const setRole = (key: RoleKey, value: string) => setRoles((r) => ({ ...r, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const cleanRoles: Partial<Roles> = {}
      for (const row of ROLE_ROWS) {
        const v = roles[row.key]?.trim()
        if (v) cleanRoles[row.key] = v
      }
      const extraRoles: Record<string, string> = {}
      for (const e of extra) if (e.name.trim() && e.dir.trim()) extraRoles[e.name.trim()] = e.dir.trim()
      const wt = parseInt(wordTarget.replace(/[^\d]/g, ''), 10)
      const project = await saveConfig(
        {
          roles: cleanRoles,
          extraRoles,
          title: title.trim() || undefined,
          wordTarget: Number.isFinite(wt) && wt > 0 ? wt : undefined,
        },
        root,
      )
      onSaved(project)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const datalistId = useMemo(() => 'gw-dir-options', [])

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal folder-mapper" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Configure folders</h2>
            <p className="muted small">
              Map each role to a folder in this project. Files inside are discovered automatically.
              Saved to <code>.ghostwriter/config.json</code>.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <datalist id={datalistId}>
          {dirs.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>

        <div className="modal-body">
          <label className="map-field">
            <span className="map-label">Book title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled" />
          </label>
          <label className="map-field">
            <span className="map-label">Word target</span>
            <input
              value={wordTarget}
              onChange={(e) => setWordTarget(e.target.value)}
              placeholder="80000"
              inputMode="numeric"
            />
          </label>

          <div className="map-section-title">Roles</div>
          {ROLE_ROWS.map((row) => (
            <label className="map-field" key={row.key}>
              <span className="map-label">
                {row.label}
                <span className="map-hint muted">{row.hint}</span>
              </span>
              <input
                list={datalistId}
                value={roles[row.key] ?? ''}
                onChange={(e) => setRole(row.key, e.target.value)}
                placeholder="(unmapped)"
              />
            </label>
          ))}

          <div className="map-section-title">
            Extra roles <span className="muted small">— stored, not yet used by features</span>
          </div>
          {extra.map((e, i) => (
            <div className="map-extra-row" key={i}>
              <input
                className="map-extra-name"
                value={e.name}
                placeholder="name (e.g. research)"
                onChange={(ev) =>
                  setExtra((xs) => xs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))
                }
              />
              <input
                list={datalistId}
                className="map-extra-dir"
                value={e.dir}
                placeholder="folder"
                onChange={(ev) =>
                  setExtra((xs) => xs.map((x, j) => (j === i ? { ...x, dir: ev.target.value } : x)))
                }
              />
              <button className="icon-btn" onClick={() => setExtra((xs) => xs.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button className="linklike" onClick={() => setExtra((xs) => [...xs, { name: '', dir: '' }])}>
            + Add role
          </button>
        </div>

        <footer className="modal-foot">
          {error && <span className="map-error">{error}</span>}
          {info && !info.autoRecognised && (
            <span className="muted small">This folder isn’t in Ghostwriter Studio’s default layout — map it below.</span>
          )}
          <div className="modal-actions">
            <button className="icon-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-btn" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save & open'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
