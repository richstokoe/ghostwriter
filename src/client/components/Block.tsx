import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import type { Block as BlockT } from '../../shared/blocks'
import { AiWriteButton } from './AiWriteButton'

// A CodeMirror theme that reads the app's own CSS variables, so the editor honours
// light/dark like everything else (instead of the fixed dark theme it used before).
// Values compile to real CSS rules, so `var(--…)` resolves against the active theme.
const appTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--prose)' },
  '.cm-content': { padding: '0', caretColor: 'var(--prose)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--prose)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--accent-dim)',
  },
})

// lineWrapping stops the editor scrolling horizontally (no more horizontal bar).
const mdExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  appTheme,
]

// A GFM table's delimiter row is only pipes, colons, dashes and spaces (with ≥1 dash).
const TABLE_DELIM = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/m

/**
 * "Ordinary text" blocks — paragraphs, headings, lists, blockquotes — edit in the same
 * serif reading font as the rendered display. Code and tables keep the monospace font
 * that actually suits them.
 */
function isProseBlock(source: string): boolean {
  const s = source.trimStart()
  if (/^(```|~~~)/.test(s)) return false // fenced code
  if (/^( {4,}|\t)/.test(source)) return false // indented code
  if (s.includes('|') && TABLE_DELIM.test(s)) return false // table
  return true
}

export function Block({
  block,
  number,
  editing,
  onStartEdit,
  onCommit,
  onCancel,
  onDelete,
  onAiWrite,
}: {
  block: BlockT
  number: number
  editing: boolean
  onStartEdit: () => void
  onCommit: (source: string) => void
  onCancel: () => void
  onDelete: () => void
  onAiWrite?: (onDelta: (t: string) => void) => Promise<string>
}) {
  const [draft, setDraft] = useState(block.source)
  const prose = useMemo(() => isProseBlock(block.source), [block.source])

  useEffect(() => {
    if (editing) setDraft(block.source)
  }, [editing, block.source])

  if (!editing) {
    return (
      <div
        className="block preview"
        title="Click to edit"
        data-start={block.start}
        onClick={(e) => {
          e.stopPropagation()
          onStartEdit()
        }}
      >
        <span className="block-num" aria-hidden>
          {number}
        </span>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.source}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div
      className={`block editing ${prose ? 'prose' : 'code'}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onCommit(draft)
        }
      }}
      onBlur={(e) => {
        // Save as soon as focus leaves the block (but not when moving within it).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit(draft)
      }}
    >
      <CodeMirror
        value={draft}
        theme="none"
        autoFocus
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        extensions={mdExtensions}
        onChange={setDraft}
      />
      <div className="block-toolbar">
        <span className="hint">⌘/Ctrl+↵ save · Esc cancel</span>
        <span className="spacer" />
        {onAiWrite && !draft.trim() && (
          <AiWriteButton onAiWrite={onAiWrite} onAppend={(t) => setDraft((d) => d + t)} />
        )}
        <button
          className="btn-icon danger"
          title="Delete block"
          onMouseDown={(e) => {
            e.preventDefault()
            onDelete()
          }}
        >
          Delete
        </button>
        <button
          className="btn small"
          onMouseDown={(e) => {
            e.preventDefault()
            onCommit(draft)
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}
