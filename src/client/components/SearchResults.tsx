import { useEffect, useMemo, useState } from 'react'
import { searchAll, type SearchFileResult, type SearchResults as SR } from '../lib/api'

/** What a clicked result asks the app to open. */
export interface SearchOpen {
  file: string
  role: string
  query: string
  line: number
}

const ROLE_LABEL: Record<string, string> = {
  chapters: 'Chapters',
  outline: 'Outlines',
  characters: 'Characters',
  timeline: 'Timeline',
  voice: 'Voice',
  other: 'Other files',
}

// Roles the app can navigate to; others are shown but not clickable.
const OPENABLE = new Set(['chapters', 'outline', 'characters', 'timeline', 'voice'])

/** Global "Find anywhere" results, rendered inside the sidebar. */
export function SearchResults({
  root,
  query,
  onOpen,
}: {
  root?: string
  query: string
  onOpen: (hit: SearchOpen) => void
}) {
  const [data, setData] = useState<SR | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      searchAll(q, root)
        .then((r) => !cancelled && (setData(r), setError(null)))
        .catch((e) => !cancelled && setError((e as Error).message))
        .finally(() => !cancelled && setLoading(false))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, root])

  // Group consecutive files by role (server already orders by role, then path).
  const groups = useMemo(() => {
    const g: { role: string; files: SearchFileResult[] }[] = []
    for (const f of data?.results ?? []) {
      let last = g[g.length - 1]
      if (!last || last.role !== f.role) {
        last = { role: f.role, files: [] }
        g.push(last)
      }
      last.files.push(f)
    }
    return g
  }, [data])

  if (query.trim().length < 2) {
    return <div className="search-hint muted">Type at least two characters to search the whole project.</div>
  }

  return (
    <div className="search-results">
      <div className="search-summary muted">
        {loading
          ? 'Searching…'
          : error
            ? <span className="search-error">{error}</span>
            : data
              ? data.matchCount === 0
                ? 'No matches'
                : `${data.matchCount} match${data.matchCount === 1 ? '' : 'es'} in ${data.fileCount} file${data.fileCount === 1 ? '' : 's'}${data.truncated ? ' (truncated)' : ''}`
              : ''}
      </div>

      {groups.map((grp) => (
        <div className="search-group" key={grp.role}>
          <div className="search-group-head">{ROLE_LABEL[grp.role] ?? grp.role}</div>
          {grp.files.map((f) => {
            const openable = OPENABLE.has(f.role)
            return (
              <div className="search-file" key={f.file}>
                <div className="search-file-name" title={f.file}>
                  {f.label}
                </div>
                <ol className="search-matches">
                  {f.matches.map((m, i) => (
                    <li
                      key={i}
                      className={`search-match${openable ? '' : ' static'}`}
                      onClick={openable ? () => onOpen({ file: f.file, role: f.role, query, line: m.line }) : undefined}
                    >
                      <span className="search-line">{m.line}</span>
                      <span className="search-snippet">
                        {m.text.slice(0, m.col)}
                        <mark>{m.text.slice(m.col, m.col + m.length)}</mark>
                        {m.text.slice(m.col + m.length)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
