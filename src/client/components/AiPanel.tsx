import { useEffect, useState } from 'react'
import {
  aiGenerateStream,
  aiReviewStream,
  fetchAiConfig,
  fetchAiModels,
  fetchAiProviders,
  parseReviewNotes,
  saveAiConfig,
  type ProviderInfo,
  type ReviewNote,
} from '../lib/api'

export function AiPanel({
  root,
  selectedFile,
  doc,
  onInsert,
  onReplace,
}: {
  root?: string
  selectedFile: string | null
  doc: string
  onInsert: (text: string) => void
  onReplace: (find: string, replace: string) => boolean
}) {
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({})
  const [provider, setProvider] = useState('ollama')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [models, setModels] = useState<string[]>([])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')
  const [thinking, setThinking] = useState('')

  const [reviewing, setReviewing] = useState(false)
  const [reviewThinking, setReviewThinking] = useState('')
  const [notes, setNotes] = useState<ReviewNote[] | null>(null)
  const [rawReview, setRawReview] = useState('')
  const [applied, setApplied] = useState<Record<number, 'ok' | 'missing'>>({})

  useEffect(() => {
    fetchAiProviders().then(setProviders).catch(() => {})
    fetchAiConfig()
      .then((c) => {
        setProvider(c.provider)
        setBaseUrl(c.baseUrl)
        setModel(c.model)
        setHasKey(c.hasKey)
        if (!c.model) setSettingsOpen(true)
      })
      .catch(() => setSettingsOpen(true))
  }, [])

  const onProviderChange = (p: string) => {
    setProvider(p)
    const def = providers[p]
    if (def) setBaseUrl(def.baseUrl)
  }

  const saveSettings = async () => {
    setError(null)
    setStatus('Saving…')
    try {
      const c = await saveAiConfig({ provider, baseUrl, model, apiKey })
      setHasKey(c.hasKey)
      setApiKey('')
      setStatus('Settings saved')
    } catch (e) {
      setError((e as Error).message)
      setStatus('')
    }
  }

  const testConnection = async () => {
    setError(null)
    setStatus('Contacting provider…')
    try {
      await saveAiConfig({ provider, baseUrl, model, apiKey })
      setApiKey('')
      const list = await fetchAiModels()
      setModels(list)
      setStatus(`${list.length} model${list.length === 1 ? '' : 's'} available`)
      if (list.length && !model) setModel(list[0])
    } catch (e) {
      setError((e as Error).message)
      setStatus('')
    }
  }

  const generate = async (mode: 'paragraph' | 'chapter') => {
    if (!selectedFile) return
    setError(null)
    setOutput('')
    setThinking('')
    setBusy(true)
    setStatus(mode === 'chapter' ? 'Drafting chapter…' : 'Drafting paragraph…')
    try {
      await aiGenerateStream(selectedFile, mode, doc, root, {
        onReasoning: (t) => {
          setThinking((prev) => (prev + t).slice(-2000))
          setStatus('Thinking…')
        },
        onDelta: (t) => {
          setOutput((prev) => prev + t)
          setStatus('Streaming…')
        },
      })
      setStatus('Draft ready — review and insert')
    } catch (e) {
      setError((e as Error).message)
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  const runReview = async () => {
    if (!selectedFile) return
    setError(null)
    setNotes(null)
    setRawReview('')
    setApplied({})
    setReviewThinking('')
    setReviewing(true)
    setStatus('Reviewing chapter…')
    try {
      const raw = await aiReviewStream(selectedFile, doc, root, {
        onDelta: (t) => {
          setReviewThinking((prev) => (prev + t).slice(-4000))
          setStatus('Reading & critiquing…')
        },
        onReasoning: (t) => {
          setReviewThinking((prev) => (prev + t).slice(-4000))
          setStatus('Thinking…')
        },
      })
      const parsed = parseReviewNotes(raw)
      setNotes(parsed)
      if (parsed.length === 0) setRawReview(raw)
      setStatus(parsed.length ? `${parsed.length} note${parsed.length === 1 ? '' : 's'}` : 'No applyable notes returned')
    } catch (e) {
      setError((e as Error).message)
      setStatus('')
    } finally {
      setReviewing(false)
    }
  }

  const implement = (i: number, note: ReviewNote) => {
    if (!note.replacement) return
    const ok = onReplace(note.quote, note.replacement)
    setApplied((a) => ({ ...a, [i]: ok ? 'ok' : 'missing' }))
  }

  const providerInfo = providers[provider]
  const anyBusy = busy || reviewing

  return (
    <div className="ai-panel">
      <div className="ai-modelbar">
        <span className="ai-current">
          {providerInfo?.label ?? provider} · <b>{model || 'no model'}</b>
        </span>
        <button className="linklike" onClick={() => setSettingsOpen((s) => !s)}>
          {settingsOpen ? 'Close' : 'Settings'}
        </button>
      </div>

      {settingsOpen && (
        <div className="ai-settings">
          <label>
            Provider
            <select value={provider} onChange={(e) => onProviderChange(e.target.value)}>
              {Object.entries(providers).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
          </label>
          <label>
            API key {providerInfo && !providerInfo.needsKey && <span className="muted">(some local servers still require a non-blank key)</span>}
            <input
              type="password"
              value={apiKey}
              placeholder={hasKey ? '•••••••• (saved)' : providerInfo?.needsKey ? 'sk-…' : 'e.g. dummy-key'}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <label>
            Model
            <input
              value={model}
              list="ai-models"
              placeholder="model name"
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
            />
            <datalist id="ai-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <div className="ai-btnrow">
            <button className="btn ghost" onClick={testConnection}>
              Test &amp; list models
            </button>
            <button className="btn" onClick={saveSettings}>
              Save
            </button>
          </div>
        </div>
      )}

      <div className="ai-actions">
        <button className="btn" disabled={anyBusy || !selectedFile} onClick={runReview}>
          Review chapter
        </button>
        <button className="btn ghost" disabled={anyBusy || !selectedFile} onClick={() => generate('chapter')}>
          Write whole chapter
        </button>
      </div>
      <div className="ai-hint muted">
        Draft or critique using this chapter’s outline + your voice &amp; style rules. Draft a single paragraph
        from inside any empty block with <b>✨ Write with AI</b>.
      </div>

      {status && <div className="ai-status">{status}</div>}
      {error && <div className="ai-error">{error}</div>}

      {busy && thinking && !output && (
        <div className="ai-thinking">
          <span className="ai-thinking-tag">💭 thinking</span>
          <span className="ai-thinking-text">…{thinking.slice(-220)}</span>
        </div>
      )}

      {reviewing && (
        <div className="ai-thinking">
          <span className="ai-thinking-tag">📝 reviewing</span>
          <span className="ai-thinking-text">…{reviewThinking.slice(-220) || 'contacting editor…'}</span>
        </div>
      )}

      {!reviewing && notes && (
        <div className="ai-review">
          {notes.length === 0 && (
            <div className="muted small">
              The editor didn’t return structured notes.{rawReview ? ' Raw response:' : ''}
            </div>
          )}
          {notes.map((n, i) => (
            <div className="review-note" key={i}>
              <div className="rn-issue">{n.issue}</div>
              {n.quote && <blockquote className="rn-quote">{n.quote}</blockquote>}
              {n.replacement && <div className="rn-replace">{n.replacement}</div>}
              <div className="rn-actions">
                {n.replacement ? (
                  applied[i] === 'ok' ? (
                    <span className="rn-done">✓ Applied</span>
                  ) : applied[i] === 'missing' ? (
                    <span className="rn-missing">Couldn’t locate the original text to replace</span>
                  ) : (
                    <button className="btn small" onClick={() => implement(i, n)}>
                      Implement suggestion
                    </button>
                  )
                ) : (
                  <span className="muted small">Structural note — no automatic fix</span>
                )}
              </div>
            </div>
          ))}
          {rawReview && notes.length === 0 && <pre className="ai-raw">{rawReview}</pre>}
        </div>
      )}

      {(output || (busy && !thinking)) && (
        <div className="ai-output">
          <div className="ai-output-text">
            {output}
            {busy && <span className="ai-caret">▍</span>}
          </div>
          {!busy && output && (
            <div className="ai-btnrow">
              <button
                className="btn"
                onClick={() => {
                  onInsert(output)
                  setOutput('')
                  setStatus('Inserted')
                }}
              >
                Insert
              </button>
              <button className="btn ghost" onClick={() => setOutput('')}>
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
