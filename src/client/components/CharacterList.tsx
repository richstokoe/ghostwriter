import { useState } from 'react'
import { buildCharacters, type Character } from '../lib/api'

export function CharacterList({
  characters,
  selectedId,
  onSelect,
  onCreate,
  root,
  onBuilt,
}: {
  characters: Character[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  root?: string
  onBuilt: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [building, setBuilding] = useState(false)
  const [progress, setProgress] = useState('')
  const [buildError, setBuildError] = useState<string | null>(null)

  const submit = () => {
    const n = name.trim()
    if (n) onCreate(n)
    setName('')
    setAdding(false)
  }

  const build = async () => {
    setBuilding(true)
    setBuildError(null)
    setProgress('Starting…')
    try {
      const built = await buildCharacters(root, setProgress)
      setProgress(`Built ${built.length} profile${built.length === 1 ? '' : 's'}.`)
      onBuilt()
      window.setTimeout(() => setProgress(''), 2500)
    } catch (e) {
      setBuildError((e as Error).message)
      setProgress('')
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="organiser">
      <ol className="chapters">
        {characters.length === 0 && <li className="empty-hint muted">No characters yet.</li>}
        {characters.map((c) => (
          <li
            key={c.id}
            className={c.id === selectedId ? 'chapter active' : 'chapter'}
            onClick={() => onSelect(c.id)}
          >
            <span className="ch-title">{c.name}</span>
            <span className="ch-words">{c.role ?? ''}</span>
          </li>
        ))}
      </ol>

      {adding ? (
        <div className="new-chapter">
          <input
            autoFocus
            value={name}
            placeholder="Character name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') {
                setAdding(false)
                setName('')
              }
            }}
          />
          <button className="btn small" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
            Add
          </button>
        </div>
      ) : (
        <button className="add-chapter" onClick={() => setAdding(true)}>
          + New character
        </button>
      )}

      <div className="char-build">
        <button className="btn ghost build-btn" disabled={building} onClick={build}>
          {building ? 'Building…' : '✨ Build from chapters'}
        </button>
        <p className="char-build-hint muted">
          Reads every chapter and rebuilds a profile for each character, overwriting existing
          files.
        </p>
        {progress && <p className="char-build-progress muted">{progress}</p>}
        {buildError && <p className="char-build-error">{buildError}</p>}
      </div>
    </div>
  )
}
