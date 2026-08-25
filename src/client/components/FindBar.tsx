import { useCallback, useEffect, useRef, useState } from 'react'

// The CSS Custom Highlight API lets us paint matches over the rendered prose without
// touching the React-managed DOM. Feature-detected so unsupported engines degrade to
// count-only navigation. (Casts avoid depending on lib.dom's optional Highlight types.)
const cssHighlights: { set(k: string, h: unknown): void; delete(k: string): void } | null =
  typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights: never }).highlights : null
const HighlightCtor: (new (...ranges: Range[]) => unknown) | null =
  typeof window !== 'undefined' ? ((window as unknown as { Highlight?: never }).Highlight ?? null) : null
const canHighlight = !!(cssHighlights && HighlightCtor)

/**
 * A floating "find in this chapter" bar. Searches the rendered block text (so Markdown
 * syntax is ignored and the author matches what they read), highlights every hit, and
 * steps through them with Enter / ⇧Enter or the arrows.
 */
export function FindBar({
  query,
  onQuery,
  onClose,
  doc,
}: {
  query: string
  onQuery: (q: string) => void
  onClose: () => void
  /** changes whenever the chapter text changes, so matches are recomputed */
  doc: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const rangesRef = useRef<Range[]>([])
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const clearHighlights = useCallback(() => {
    cssHighlights?.delete('gw-find')
    cssHighlights?.delete('gw-find-current')
  }, [])

  const paintCurrent = useCallback((i: number) => {
    const r = rangesRef.current[i]
    if (canHighlight && r) cssHighlights!.set('gw-find-current', new HighlightCtor!(r))
    else cssHighlights?.delete('gw-find-current')
    // Scroll the match into view even without the highlight API.
    const el = r?.startContainer.parentElement
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  // Recompute matches after the DOM has painted the current chapter/query.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      rangesRef.current = []
      setCount(0)
      setIndex(0)
      clearHighlights()
      return
    }
    const raf = requestAnimationFrame(() => {
      const container = document.querySelector('.block-editor')
      const ranges: Range[] = []
      if (container) {
        const needle = q.toLowerCase()
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode() as Text | null
        while (node) {
          const lower = (node.nodeValue ?? '').toLowerCase()
          let at = lower.indexOf(needle)
          while (at >= 0) {
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + needle.length)
            ranges.push(range)
            at = lower.indexOf(needle, at + needle.length)
          }
          node = walker.nextNode() as Text | null
        }
      }
      rangesRef.current = ranges
      setCount(ranges.length)
      setIndex(0)
      if (canHighlight) {
        if (ranges.length) cssHighlights!.set('gw-find', new HighlightCtor!(...ranges))
        else cssHighlights!.delete('gw-find')
      }
      paintCurrent(0)
    })
    return () => cancelAnimationFrame(raf)
  }, [query, doc, clearHighlights, paintCurrent])

  useEffect(() => () => clearHighlights(), [clearHighlights])

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((cur) => {
        const n = rangesRef.current.length
        if (n === 0) return 0
        const next = (cur + dir + n) % n
        paintCurrent(next)
        return next
      })
    },
    [paintCurrent],
  )

  const has = count > 0
  return (
    <div
      className="find-bar"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          go(e.shiftKey ? -1 : 1)
        }
      }}
    >
      <input
        ref={inputRef}
        className="find-input"
        placeholder="Find in chapter…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <span className="find-count">{has ? `${index + 1}/${count}` : query.trim() ? '0/0' : ''}</span>
      <button className="find-btn" title="Previous match (⇧⏎)" disabled={!has} onClick={() => go(-1)}>
        ↑
      </button>
      <button className="find-btn" title="Next match (⏎)" disabled={!has} onClick={() => go(1)}>
        ↓
      </button>
      <button className="find-btn" title="Close (Esc)" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
