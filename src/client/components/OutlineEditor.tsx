import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchOutline, saveOutline } from '../lib/api'
import { parseOutline, serializeOutline, type Outline } from '../../shared/outline'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const EMPTY = (title: string): Outline => ({
  title,
  onePurpose: '',
  characters: '',
  keyEvents: [],
  todos: [],
})

/** A textarea that grows to fit its content instead of scrolling inside a fixed box. */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const cs = getComputedStyle(el)
    const border = parseFloat(cs.borderTopWidth || '0') + parseFloat(cs.borderBottomWidth || '0')
    el.style.height = `${el.scrollHeight + border}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * The per-chapter outline as an editable form: One purpose, Characters, a growable list
 * of Key events, and a TODO checklist. Fields grow to fit their text; the pane scrolls if
 * it overflows. Round-trips the exact markdown the timeline/character features also read.
 */
export function OutlineEditor({
  root,
  selectedFile,
  chapterTitle,
}: {
  root?: string
  selectedFile: string | null
  chapterTitle: string
}) {
  const [outline, setOutline] = useState<Outline | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!selectedFile) {
      setOutline(null)
      return
    }
    let active = true
    fetchOutline(selectedFile, root)
      .then((o) => active && setOutline(parseOutline(o.content)))
      .catch(() => active && setOutline(EMPTY(chapterTitle)))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, root])

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const scheduleSave = (next: Outline) => {
    const file = selectedFile
    if (!file) return
    if (timer.current) window.clearTimeout(timer.current)
    setSave('saving')
    timer.current = window.setTimeout(async () => {
      try {
        await saveOutline(file, serializeOutline({ ...next, title: next.title || chapterTitle }), root)
        setSave('saved')
        window.setTimeout(() => setSave((s) => (s === 'saved' ? 'idle' : s)), 1400)
      } catch {
        setSave('error')
      }
    }, 700)
  }

  const apply = (fn: (prev: Outline) => Outline) => {
    setOutline((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      scheduleSave(next)
      return next
    })
  }

  if (!selectedFile) {
    return <div className="outline-empty muted">Select a chapter to edit its outline.</div>
  }
  if (!outline) {
    return <div className="outline-empty muted">Loading outline…</div>
  }

  return (
    <div className="outline-editor">
      <div className="outline-head">
        <span className="outline-title">Outline</span>
        <span className={`save-state ${save}`}>
          {save === 'saving' && 'Saving…'}
          {save === 'saved' && 'Saved'}
          {save === 'error' && 'Save failed'}
        </span>
      </div>

      <div className="ol-section">
        <span className="ol-label">One purpose</span>
        <AutoTextarea
          className="ol-field"
          value={outline.onePurpose}
          placeholder="The single main plot point this chapter drives forward…"
          onChange={(v) => apply((p) => ({ ...p, onePurpose: v }))}
        />
      </div>

      <div className="ol-section">
        <span className="ol-label">Characters</span>
        <AutoTextarea
          className="ol-field"
          value={outline.characters}
          placeholder="Who is in the scene / chapter…"
          onChange={(v) => apply((p) => ({ ...p, characters: v }))}
        />
      </div>

      <div className="ol-section">
        <span className="ol-label">Key events</span>
        <ul className="ol-list">
          {outline.keyEvents.map((ev, i) => (
            <li className="ol-row" key={i}>
              <span className="ol-bullet" aria-hidden>
                •
              </span>
              <AutoTextarea
                className="ol-item"
                value={ev}
                placeholder="What happens…"
                onChange={(v) =>
                  apply((p) => ({ ...p, keyEvents: p.keyEvents.map((x, j) => (j === i ? v : x)) }))
                }
              />
              <button
                className="ol-del"
                title="Remove event"
                onClick={() => apply((p) => ({ ...p, keyEvents: p.keyEvents.filter((_, j) => j !== i) }))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button className="ol-add" onClick={() => apply((p) => ({ ...p, keyEvents: [...p.keyEvents, ''] }))}>
          + Add event
        </button>
      </div>

      <div className="ol-section">
        <span className="ol-label">TODO</span>
        <ul className="ol-list">
          {outline.todos.map((t, i) => (
            <li className="ol-row ol-todo" key={i}>
              <input
                type="checkbox"
                checked={t.done}
                title={t.done ? 'Mark not done' : 'Mark done'}
                onChange={(e) =>
                  apply((p) => ({
                    ...p,
                    todos: p.todos.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)),
                  }))
                }
              />
              <AutoTextarea
                className={`ol-item${t.done ? ' done' : ''}`}
                value={t.text}
                placeholder="Task or open question…"
                onChange={(v) =>
                  apply((p) => ({
                    ...p,
                    todos: p.todos.map((x, j) => (j === i ? { ...x, text: v } : x)),
                  }))
                }
              />
              <button
                className="ol-del"
                title="Remove task"
                onClick={() => apply((p) => ({ ...p, todos: p.todos.filter((_, j) => j !== i) }))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          className="ol-add"
          onClick={() => apply((p) => ({ ...p, todos: [...p.todos, { text: '', done: false }] }))}
        >
          + Add task
        </button>
      </div>
    </div>
  )
}
