import { useState } from 'react'

/**
 * Inline "write the next paragraph with AI" control shown inside an empty block editor.
 * Streams generated tokens to `onAppend`. Uses onMouseDown+preventDefault so clicking it
 * doesn't blur (and thereby commit/close) the surrounding block editor.
 */
export function AiWriteButton({
  onAiWrite,
  onAppend,
}: {
  onAiWrite: (onDelta: (t: string) => void) => Promise<string>
  onAppend: (delta: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    if (busy) return
    setErr(null)
    setBusy(true)
    try {
      await onAiWrite(onAppend)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn small ghost ai-write-btn"
        disabled={busy}
        title="Draft the next paragraph with AI, using this chapter’s outline and your voice"
        onMouseDown={(e) => {
          e.preventDefault()
          run()
        }}
      >
        {busy ? '✨ Writing…' : '✨ Write with AI'}
      </button>
      {err && <span className="ai-inline-error">{err}</span>}
    </>
  )
}
