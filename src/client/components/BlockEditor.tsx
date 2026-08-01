import { useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { deleteBlock, insertBlockAt, replaceBlock, splitBlocks } from '../../shared/blocks'
import { Block } from './Block'
import { AiWriteButton } from './AiWriteButton'

export type AiWrite = (onDelta: (t: string) => void) => Promise<string>

const mdExtensions = [markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping]

function NewBlockEditor({
  onCommit,
  onCancel,
  onAiWrite,
}: {
  onCommit: (text: string) => void
  onCancel: () => void
  onAiWrite?: AiWrite
}) {
  const [draft, setDraft] = useState('')
  return (
    <div
      className="block editing new"
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
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit(draft)
      }}
    >
      <CodeMirror
        value={draft}
        theme="dark"
        autoFocus
        placeholder="New block — Markdown…"
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        extensions={mdExtensions}
        onChange={setDraft}
      />
      <div className="block-toolbar">
        <span className="hint">⌘/Ctrl+↵ add · Esc cancel</span>
        <span className="spacer" />
        {onAiWrite && !draft.trim() && (
          <AiWriteButton onAiWrite={onAiWrite} onAppend={(t) => setDraft((d) => d + t)} />
        )}
        <button className="btn small" onMouseDown={(e) => { e.preventDefault(); onCommit(draft) }}>
          Add
        </button>
      </div>
    </div>
  )
}

export function BlockEditor({ doc, onChange, onAiWrite }: { doc: string; onChange: (next: string) => void; onAiWrite?: AiWrite }) {
  const blocks = useMemo(() => splitBlocks(doc), [doc])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)

  const commit = (id: string, newSource: string) => {
    const b = blocks.find((x) => x.id === id)
    setEditingId(null)
    if (b && newSource !== b.source) onChange(replaceBlock(doc, b, newSource))
  }

  const remove = (id: string) => {
    const b = blocks.find((x) => x.id === id)
    setEditingId(null)
    if (b) onChange(deleteBlock(doc, b))
  }

  const openInsert = (index: number) => {
    setEditingId(null)
    setInsertAt(index)
  }

  const commitInsert = (text: string) => {
    const index = insertAt
    setInsertAt(null)
    if (index == null || !text.trim()) return
    const offset = index < blocks.length ? blocks[index].start : doc.length
    onChange(insertBlockAt(doc, offset, text))
  }

  const InsertZone = ({ index }: { index: number }) =>
    insertAt === index ? (
      <NewBlockEditor onCommit={commitInsert} onCancel={() => setInsertAt(null)} onAiWrite={onAiWrite} />
    ) : (
      <div className="insert-zone" onClick={() => openInsert(index)} title="Insert a block here">
        <span className="insert-plus">+</span>
      </div>
    )

  return (
    <div className="block-editor">
      {blocks.length === 0 && insertAt == null && (
        <p className="empty">This chapter is empty.</p>
      )}

      {blocks.map((b, i) => (
        <div key={b.id}>
          <InsertZone index={i} />
          <Block
            block={b}
            editing={editingId === b.id}
            onStartEdit={() => {
              setInsertAt(null)
              setEditingId(b.id)
            }}
            onCommit={(src) => commit(b.id, src)}
            onCancel={() => setEditingId(null)}
            onDelete={() => remove(b.id)}
            onAiWrite={onAiWrite}
          />
        </div>
      ))}

      <InsertZone index={blocks.length} />

      <button className="add-block" onClick={() => openInsert(blocks.length)}>
        + Add block
      </button>
    </div>
  )
}
