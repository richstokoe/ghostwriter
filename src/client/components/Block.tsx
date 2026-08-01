import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import type { Block as BlockT } from '../../shared/blocks'
import { AiWriteButton } from './AiWriteButton'

// lineWrapping stops the editor scrolling horizontally (no more horizontal bar).
const mdExtensions = [markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping]

export function Block({
  block,
  editing,
  onStartEdit,
  onCommit,
  onCancel,
  onDelete,
  onAiWrite,
}: {
  block: BlockT
  editing: boolean
  onStartEdit: () => void
  onCommit: (source: string) => void
  onCancel: () => void
  onDelete: () => void
  onAiWrite?: (onDelta: (t: string) => void) => Promise<string>
}) {
  const [draft, setDraft] = useState(block.source)

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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.source}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div
      className="block editing"
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
        theme="dark"
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
