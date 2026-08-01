import { useEffect, useState } from 'react'
import { fetchTimeline, saveTimeline, type DerivedGroup, type TimelineEvent } from '../lib/api'
import type { ChapterMeta } from '../../shared/types'

function newId(): string {
  return 'ev-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36)
}

export function TimelineView({
  root,
  chapters,
  onOpenChapter,
}: {
  root?: string
  chapters: ChapterMeta[]
  onOpenChapter: (file: string) => void
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [derived, setDerived] = useState<DerivedGroup[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchTimeline(root)
      .then((d) => {
        setEvents(d.events)
        setDerived(d.derived)
      })
      .catch((err) => console.error(err))
  }, [root])

  const persist = async (next: TimelineEvent[]) => {
    setEvents(next)
    try {
      const d = await saveTimeline(next, root)
      setDerived(d.derived)
      setSaved(true)
    } catch (err) {
      console.error(err)
    }
  }

  const update = (id: string, patch: Partial<TimelineEvent>) =>
    setEvents((evs) => evs.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  const addEvent = () => persist([{ id: newId(), when: '', title: '' }, ...events])
  const remove = (id: string) => persist(events.filter((e) => e.id !== id))
  const move = (id: string, dir: -1 | 1) => {
    const i = events.findIndex((e) => e.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= events.length) return
    const next = events.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }
  const promote = (group: DerivedGroup, text: string) =>
    persist([...events, { id: newId(), when: '', title: text, chapter: group.chapter }])

  const chapterTitle = (file?: string) => chapters.find((c) => c.file === file)?.title

  return (
    <div className="timeline-view">
      <div className="tl-head">
        <h2>Timeline</h2>
        <div className="tl-head-right">
          {saved && <span className="save-state saved">Saved</span>}
          <button className="btn small" onClick={addEvent}>
            + Add event
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="muted tl-empty">
          No timeline events yet. Add one, or promote a key event from the outlines below.
        </p>
      ) : (
        <ol className="tl-list">
          {events.map((e, i) => (
            <li key={e.id} className="tl-event" onBlur={() => persist(events)}>
              <span className="tl-dot" />
              <div className="tl-body">
                <div className="tl-row1">
                  <input
                    className="tl-when"
                    value={e.when}
                    placeholder="when (e.g. Thu 15 Apr, 21:21)"
                    onChange={(ev) => update(e.id, { when: ev.target.value })}
                  />
                  <div className="tl-actions">
                    <button title="Move up" disabled={i === 0} onClick={() => move(e.id, -1)}>
                      ↑
                    </button>
                    <button title="Move down" disabled={i === events.length - 1} onClick={() => move(e.id, 1)}>
                      ↓
                    </button>
                    <button title="Delete" className="del" onClick={() => remove(e.id)}>
                      ×
                    </button>
                  </div>
                </div>
                <input
                  className="tl-title"
                  value={e.title}
                  placeholder="What happens"
                  onChange={(ev) => update(e.id, { title: ev.target.value })}
                />
                <div className="tl-meta">
                  <select
                    className="tl-chapter"
                    value={e.chapter ?? ''}
                    onChange={(ev) => update(e.id, { chapter: ev.target.value || undefined })}
                  >
                    <option value="">— no chapter —</option>
                    {chapters.map((c) => (
                      <option key={c.id} value={c.file}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  {e.chapter && (
                    <button className="tl-jump" onClick={() => onOpenChapter(e.chapter!)}>
                      open ↗
                    </button>
                  )}
                </div>
                <input
                  className="tl-note"
                  value={e.note ?? ''}
                  placeholder="note (optional)"
                  onChange={(ev) => update(e.id, { note: ev.target.value })}
                />
              </div>
            </li>
          ))}
        </ol>
      )}

      {derived.length > 0 && (
        <div className="tl-derived">
          <h3>Key events from chapter outlines</h3>
          <p className="muted small">Pulled automatically from each outline. Add any of them to the timeline above.</p>
          {derived.map((g) => (
            <div key={g.chapter} className="tl-dgroup">
              <div className="tl-dtitle" onClick={() => onOpenChapter(g.chapter)}>
                {chapterTitle(g.chapter) ?? g.title}
              </div>
              <ul>
                {g.events.map((ev, i) => (
                  <li key={i}>
                    <span>{ev}</span>
                    <button className="tl-add" title="Add to timeline" onClick={() => promote(g, ev)}>
                      + add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
