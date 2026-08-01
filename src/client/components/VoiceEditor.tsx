import { useEffect, useRef, useState } from 'react'
import { fetchVoice, saveVoice } from '../lib/api'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * A simple editor for the project's voice/voice.md — the prose guide that shapes
 * AI drafting and review. Saving refreshes the app's voice config (via onSaved),
 * so the lint rule set is re-read at the same time.
 */
export function VoiceEditor({ root, onSaved }: { root?: string; onSaved: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [save, setSave] = useState<SaveState>('idle')
  const clearTimer = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    fetchVoice(root)
      .then((v) => active && setText(v.voice))
      .catch(() => active && setText(''))
    return () => {
      active = false
    }
  }, [root])

  useEffect(() => () => {
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
  }, [])

  const doSave = async () => {
    if (text == null || !dirty) return
    setSave('saving')
    try {
      await saveVoice(text, root)
      setDirty(false)
      setSave('saved')
      onSaved() // re-reads voice + lint rules in the app
      clearTimer.current = window.setTimeout(() => setSave('idle'), 1500)
    } catch {
      setSave('error')
    }
  }

  if (text == null) {
    return (
      <div className="scroll">
        <p className="empty">Loading voice…</p>
      </div>
    )
  }

  return (
    <>
      <header className="chapter-head">
        <div className="chapter-title">Voice &amp; style</div>
        <div className="head-right">
          <div className={`save-state ${save}`}>
            {save === 'saving' && 'Saving…'}
            {save === 'saved' && 'Saved'}
            {save === 'error' && 'Save failed'}
          </div>
          <button className="btn" disabled={!dirty || save === 'saving'} onClick={doSave}>
            Save
          </button>
        </div>
      </header>
      <div className="scroll">
        <div className="voice-editor">
          <textarea
            className="voice-textarea"
            value={text}
            spellCheck
            onChange={(e) => {
              setText(e.target.value)
              setDirty(true)
            }}
            onBlur={doSave}
            placeholder="Describe the story's voice: point of view, sentence rhythm, what to favour and avoid…"
          />
          <p className="voice-hint muted">
            This guide shapes AI drafting and review. It is not the lint rule set — the
            linter runs the house-style rules from <code>voice/rules.yml</code> (or the
            built-in defaults).
          </p>
        </div>
      </div>
    </>
  )
}
