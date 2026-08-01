import { useState } from 'react'
import type { Character } from '../lib/api'

export function CharacterList({
  characters,
  selectedId,
  onSelect,
  onCreate,
}: {
  characters: Character[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    const n = name.trim()
    if (n) onCreate(n)
    setName('')
    setAdding(false)
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
    </div>
  )
}
