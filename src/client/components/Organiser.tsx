import { useState } from 'react'
import type { Project } from '../../shared/types'

export function Organiser({
  project,
  selected,
  onSelect,
  onCreateChapter,
  onDeleteChapter,
  onMoveChapter,
  onSetTarget,
}: {
  project: Project | null
  selected: string | null
  onSelect: (file: string) => void
  onCreateChapter: (title: string) => void
  onDeleteChapter: (id: string) => void
  onMoveChapter: (id: string, dir: -1 | 1) => void
  onSetTarget: (n: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetDraft, setTargetDraft] = useState('')

  const chapters = project?.chapters ?? []
  const total = chapters.reduce((sum, c) => sum + c.words, 0)
  const target = project?.wordTarget ?? 0
  const pct = target > 0 ? Math.min(100, (total / target) * 100) : 0

  const submitNew = () => {
    const t = newTitle.trim()
    if (t) onCreateChapter(t)
    setNewTitle('')
    setAdding(false)
  }

  const commitTarget = () => {
    const n = parseInt(targetDraft.replace(/[^\d]/g, ''), 10)
    if (Number.isFinite(n) && n > 0 && n !== target) onSetTarget(n)
    setEditingTarget(false)
  }

  return (
    <div className="organiser">
      <ol className="chapters">
        {chapters.map((ch, i) => (
          <li
            key={ch.id}
            className={ch.file === selected ? 'chapter active' : 'chapter'}
            onClick={() => onSelect(ch.file)}
          >
            <span className="ch-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="ch-title">{ch.title}</span>
            <span className="ch-words">{ch.words.toLocaleString()}</span>
            <span className="ch-actions" onClick={(e) => e.stopPropagation()}>
              <button title="Move up" disabled={i === 0} onClick={() => onMoveChapter(ch.id, -1)}>
                ↑
              </button>
              <button
                title="Move down"
                disabled={i === chapters.length - 1}
                onClick={() => onMoveChapter(ch.id, 1)}
              >
                ↓
              </button>
              <button
                title="Delete chapter"
                className="del"
                onClick={() => {
                  if (confirm(`Delete chapter “${ch.title}”? This removes its manuscript and outline files.`))
                    onDeleteChapter(ch.id)
                }}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>

      {adding ? (
        <div className="new-chapter">
          <input
            autoFocus
            value={newTitle}
            placeholder="Chapter title"
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew()
              else if (e.key === 'Escape') {
                setAdding(false)
                setNewTitle('')
              }
            }}
          />
          <button className="btn small" onMouseDown={(e) => e.preventDefault()} onClick={submitNew}>
            Add
          </button>
        </div>
      ) : (
        <button className="add-chapter" onClick={() => setAdding(true)}>
          + New chapter
        </button>
      )}

      <div className="target">
        {editingTarget ? (
          <input
            className="target-input"
            autoFocus
            type="number"
            min={1}
            value={targetDraft}
            onChange={(e) => setTargetDraft(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTarget()
              else if (e.key === 'Escape') setEditingTarget(false)
            }}
          />
        ) : (
          <div
            className="target-row"
            title="Click to edit the word target"
            onClick={() => {
              setTargetDraft(String(target))
              setEditingTarget(true)
            }}
          >
            <span>{total.toLocaleString()}</span>
            <span className="muted">/ {target.toLocaleString()} words</span>
            <span className="edit-hint">✎</span>
          </div>
        )}
        <div className="bar">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
