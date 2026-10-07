import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import {
  deleteBlock,
  findBlockAfterExternalChange,
  insertBlockAt,
  isEmptyBlockSource,
  replaceBlock,
  resolveKeepMine,
  splitBlocks,
  type ExternalChangeStatus,
} from '../../shared/blocks'
import { Block, type BlockConflict } from './Block'
import { AiWriteButton } from './AiWriteButton'

type ConflictState = {
  status: Extract<ExternalChangeStatus, { status: 'changed' | 'removed' }>
}

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

export function BlockEditor({
  doc,
  incoming,
  onChange,
  onAdoptIncoming,
  onAiWrite,
  hideEmpty,
}: {
  doc: string
  /** Latest on-disk content, from the live file watcher, when it differs from `doc`. */
  incoming?: string | null
  onChange: (next: string) => void
  /** Adopt `incoming` as the working copy without writing it back — it's already on disk. */
  onAdoptIncoming?: () => void
  onAiWrite?: AiWrite
  /** Hide blocks with no visible content (blank paragraphs, empty list items…). The block
   *  currently being edited is always shown regardless, so it can never vanish mid-edit. */
  hideEmpty?: boolean
}) {
  const blocks = useMemo(() => splitBlocks(doc), [doc])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)

  // Reconcile a live file-watch update against whatever's being edited right now, rather
  // than silently overwriting an in-progress draft. Deliberately keyed only on `incoming`:
  // it should run once per distinct external change, reading `blocks`/`editingId` as they
  // stood at that moment (not re-run for every unrelated render in between).
  useEffect(() => {
    if (!incoming) {
      // Superseded — a save just wrote the file — so there's nothing left to reconcile against.
      setConflict(null)
      return
    }
    if (incoming === doc) return

    // A new block being composed isn't on disk yet, so it can't conflict; its draft lives in
    // NewBlockEditor's own state and survives the adoption below.
    const editingBlock = editingId ? blocks.find((b) => b.id === editingId) ?? null : null
    if (!editingBlock) {
      onAdoptIncoming?.() // nothing local at risk — just pick up the change
      return
    }

    const result = findBlockAfterExternalChange(blocks, splitBlocks(incoming), editingBlock)
    if (result.status === 'unchanged') {
      // The block being edited is untouched — safe to bring in everything else. Remapping
      // `editingId` to its (possibly shifted) new id is safe because the render below gives
      // the actively-edited block a fixed React key, so this swap can't unmount it mid-edit.
      setEditingId(result.block.id)
      setConflict(null)
      onAdoptIncoming?.()
    } else {
      setConflict({ status: result })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming])

  const commit = (id: string, newSource: string) => {
    const b = blocks.find((x) => x.id === id)
    setEditingId(null)
    setConflict(null)
    if (b && newSource !== b.source) onChange(replaceBlock(doc, b, newSource))
  }

  const cancelEdit = () => {
    const hadConflict = conflict != null
    setEditingId(null)
    setConflict(null)
    if (hadConflict) onAdoptIncoming?.() // no local edit left to protect — bring the file up to date
  }

  const remove = (id: string) => {
    const b = blocks.find((x) => x.id === id)
    setEditingId(null)
    setConflict(null)
    if (b) onChange(deleteBlock(doc, b))
  }

  // "Keep mine": splice the local draft into the incoming doc (preserving whatever else
  // changed externally) and save it — a decisive resolution, so it also closes the editor.
  const keepMine = (draft: string) => {
    if (!conflict || !incoming) return
    const merged = resolveKeepMine(incoming, conflict.status, draft)
    setConflict(null)
    setEditingId(null)
    onChange(merged)
  }

  // "Take incoming": drop the local draft, adopt the incoming doc, and keep editing the
  // block's new text (or close the editor if it was deleted upstream).
  const takeIncoming = () => {
    if (!conflict || !incoming) return
    setEditingId(conflict.status.status === 'changed' ? conflict.status.incoming.id : null)
    setConflict(null)
    onAdoptIncoming?.()
  }

  const openInsert = (index: number) => {
    const hadConflict = conflict != null
    setEditingId(null)
    setConflict(null)
    setInsertAt(index)
    if (hadConflict) onAdoptIncoming?.()
  }

  const commitInsert = (text: string) => {
    const index = insertAt
    setInsertAt(null)
    if (index == null || !text.trim()) return
    const offset = index < blocks.length ? blocks[index].start : doc.length
    onChange(insertBlockAt(doc, offset, text))
  }

  // A plain render function, not a component: a component declared inside this body would be
  // a new type every render, so React would remount the composer — losing its draft — on any
  // re-render (e.g. a live file-watch update arriving while a new block is being typed).
  const insertZone = (index: number) =>
    insertAt === index ? (
      <NewBlockEditor onCommit={commitInsert} onCancel={() => setInsertAt(null)} onAiWrite={onAiWrite} />
    ) : (
      <div className="insert-zone" onClick={() => openInsert(index)} title="Insert a block here">
        <span className="insert-plus">+</span>
      </div>
    )

  // Only worth the per-block parse when the toggle is actually on.
  const emptyIds = useMemo(() => {
    if (!hideEmpty) return null
    return new Set(blocks.filter((b) => isEmptyBlockSource(b.source)).map((b) => b.id))
  }, [blocks, hideEmpty])

  return (
    <div className="block-editor">
      {blocks.length === 0 && insertAt == null && (
        <p className="empty">This chapter is empty.</p>
      )}

      {blocks.map((b, i) => {
        const editing = editingId === b.id
        // Never hide the block someone's actively editing — it would vanish out from under them.
        const hidden = !editing && emptyIds?.has(b.id)
        const blockConflict: BlockConflict | null =
          editing && conflict
            ? conflict.status.status === 'changed'
              ? { kind: 'changed', incomingText: conflict.status.incoming.source }
              : { kind: 'removed', incomingText: null }
            : null
        return (
          // The block being edited keeps a fixed key for its whole session, even as a live
          // update remaps its underlying (index-based) id — otherwise React would remount
          // it mid-edit, and the user's unsaved draft would be lost with it.
          <div key={editing ? '__editing__' : b.id}>
            {insertZone(i)}
            {!hidden && (
              <Block
                block={b}
                number={i + 1}
                editing={editing}
                onStartEdit={() => {
                  setInsertAt(null)
                  setConflict(null)
                  setEditingId(b.id)
                }}
                onCommit={(src) => commit(b.id, src)}
                onCancel={cancelEdit}
                onDelete={() => remove(b.id)}
                onAiWrite={onAiWrite}
                conflict={blockConflict}
                onKeepMine={keepMine}
                onTakeIncoming={takeIncoming}
              />
            )}
          </div>
        )
      })}

      {insertZone(blocks.length)}

      <button className="add-block" onClick={() => openInsert(blocks.length)}>
        + Add block
      </button>
    </div>
  )
}
