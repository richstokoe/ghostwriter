import { useEffect, useState } from 'react'
import { characterTimeline, type Character, type CharacterEvent } from '../lib/api'

const FIELDS: { key: keyof Character; label: string; placeholder: string }[] = [
  { key: 'name', label: 'Name', placeholder: 'Full name' },
  { key: 'aka', label: 'Also known as', placeholder: 'Nicknames, aliases' },
  { key: 'role', label: 'Role', placeholder: 'e.g. protagonist, analyst' },
  { key: 'age', label: 'Age', placeholder: 'e.g. 23' },
  { key: 'status', label: 'Status', placeholder: 'e.g. alive, offstage' },
]

export function CharacterEditor({
  character,
  root,
  onSave,
  onDelete,
}: {
  character: Character
  root?: string
  onSave: (c: Character) => Promise<void> | void
  onDelete: (id: string) => void
}) {
  const [form, setForm] = useState<Character>(character)
  const [timeline, setTimeline] = useState<CharacterEvent[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => setForm(character), [character.id])

  useEffect(() => {
    characterTimeline(character.name, root)
      .then(setTimeline)
      .catch(() => setTimeline([]))
  }, [character.name, character.id, root])

  const set = (key: keyof Character, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  const save = async () => {
    await onSave(form)
    setSaved(true)
  }

  return (
    <div className="char-editor" onBlur={() => save()}>
      <div className="char-head">
        <h2>{form.name || 'Unnamed character'}</h2>
        <div className="char-head-right">
          {saved && <span className="save-state saved">Saved</span>}
          <button className="btn small" onClick={save}>
            Save
          </button>
          <button
            className="btn-icon danger"
            onClick={() => {
              if (confirm(`Delete character “${form.name}”?`)) onDelete(form.id)
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="char-fields">
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              value={(form[f.key] as string) ?? ''}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <label className="char-bio">
        Notes &amp; background
        <textarea
          value={form.description ?? ''}
          rows={8}
          placeholder="Personal history, motivations, physical description, voice, relationships…"
          onChange={(e) => set('description', e.target.value)}
        />
      </label>

      <div className="char-timeline">
        <h3>Timeline &amp; key events</h3>
        <p className="muted small">
          Auto-derived from the chapter outlines where “{form.name}” appears.
        </p>
        {timeline.length === 0 ? (
          <p className="muted">No appearances found yet. Name the character in a chapter outline.</p>
        ) : (
          <ol className="ctl">
            {timeline.map((t) => (
              <li key={t.chapter}>
                <div className="ctl-chapter">{t.title}</div>
                <ul>
                  {t.events.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
