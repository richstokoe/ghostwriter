// The block splitter — the core of the "click a block to edit" editor.
//
// A top-level mdast node *is* the cohesive entity the user means when they click:
// one table, one fenced code block, one list, one blockquote, one heading, one
// paragraph. Parsing with remark-parse + remark-gfm gives one such node per block,
// each carrying a source `position` (character offsets). We slice the ORIGINAL
// source by those offsets so formatting is preserved exactly, and the blank-line
// gaps between blocks stay outside any block (preserved on reassembly).

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString as mdastToString } from 'mdast-util-to-string'
import type { Nodes, Root } from 'mdast'

export interface Block {
  /** stable within one split: index-based, so a block keeps its identity across edits */
  id: string
  /** exact source text of this block (no surrounding blank lines) */
  source: string
  /** character offset of the block start within the whole document */
  start: number
  /** character offset just past the block end */
  end: number
}

const processor = unified().use(remarkParse).use(remarkGfm)

/** Split a Markdown document into top-level blocks. */
export function splitBlocks(doc: string): Block[] {
  const tree = processor.parse(doc) as Root
  const blocks: Block[] = []
  let i = 0
  for (const node of tree.children) {
    const pos = node.position
    if (!pos || pos.start.offset == null || pos.end.offset == null) continue
    const start = pos.start.offset
    const end = pos.end.offset
    blocks.push({
      id: `blk-${i++}`,
      start,
      end,
      source: doc.slice(start, end),
    })
  }
  return blocks
}

// Nodes that show something even with no text: a rule draws a line; an image (often alt-less in a draft) still renders.
const VISIBLE_WITHOUT_TEXT = new Set(['thematicBreak', 'image', 'imageReference'])

function rendersWithoutText(node: Nodes): boolean {
  if (VISIBLE_WITHOUT_TEXT.has(node.type)) return true
  return 'children' in node && (node.children as Nodes[]).some(rendersWithoutText)
}

/**
 * True when a block has no visible content — a blank paragraph, an empty list ("- "), an
 * empty blockquote ("> "). Judges by rendered text, not raw source, so markdown syntax
 * alone (e.g. "#") doesn't count as content.
 */
export function isEmptyBlockSource(source: string): boolean {
  const node = (processor.parse(source) as Root).children[0]
  if (!node || rendersWithoutText(node)) return false
  return mdastToString(node).trim().length === 0
}

/**
 * Replace one block's source in the document. The gaps before/after the block
 * (blank lines) live outside [start, end) and are therefore preserved verbatim.
 * Offsets are valid only for the `doc` the block was split from; callers re-split
 * after applying.
 */
export function replaceBlock(doc: string, block: Block, newSource: string): string {
  return doc.slice(0, block.start) + newSource + doc.slice(block.end)
}

/** Remove a block and collapse the blank lines it leaves behind. */
export function deleteBlock(doc: string, block: Block): string {
  const next = doc.slice(0, block.start) + doc.slice(block.end)
  return next.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
}

/**
 * Insert new block text at a character offset (a block's `start`, or the document
 * length to append), keeping exactly one blank line between blocks.
 */
export function insertBlockAt(doc: string, offset: number, text: string): string {
  const body = text.trim()
  if (!body) return doc
  const before = doc.slice(0, offset).replace(/\s*$/, '')
  const after = doc.slice(offset).replace(/^\s*/, '')
  const parts = [before, body, after].filter((p) => p.length > 0)
  return parts.join('\n\n') + (after.length === 0 ? '\n' : '')
}

// ---------- diffing two splits of the "same" document (live file-watch reconciliation) ----------
//
// Block ids are index-based and NOT stable across an external edit (inserting/removing a
// block earlier in the file shifts every id after it). To tell whether the block a user is
// actively editing was itself touched by an external change — without misattributing an
// unrelated edit elsewhere in the file — we align two block lists by CONTENT via a classic
// LCS diff, then locate the block by object identity rather than by id/index.

type BlockDiffOp =
  | { type: 'same'; oldBlock: Block; newBlock: Block }
  | { type: 'removed'; oldBlock: Block }
  | { type: 'added'; newBlock: Block }

/** Longest-common-subsequence alignment of two block lists, keyed on exact source text. */
function diffBlocks(oldBlocks: Block[], newBlocks: Block[]): BlockDiffOp[] {
  // Strip the common prefix/suffix first: an external edit usually touches a few blocks, so
  // this keeps the O(n·m) table tiny even for a whole novel kept in one file.
  const max = Math.min(oldBlocks.length, newBlocks.length)
  let pre = 0
  while (pre < max && oldBlocks[pre].source === newBlocks[pre].source) pre++
  let suf = 0
  while (
    suf < max - pre &&
    oldBlocks[oldBlocks.length - 1 - suf].source === newBlocks[newBlocks.length - 1 - suf].source
  ) {
    suf++
  }
  const a = oldBlocks.slice(pre, oldBlocks.length - suf)
  const b = newBlocks.slice(pre, newBlocks.length - suf)

  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].source === b[j].source ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: BlockDiffOp[] = []
  for (let k = 0; k < pre; k++) ops.push({ type: 'same', oldBlock: oldBlocks[k], newBlock: newBlocks[k] })
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].source === b[j].source) {
      ops.push({ type: 'same', oldBlock: a[i++], newBlock: b[j++] })
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'removed', oldBlock: a[i++] })
    } else {
      ops.push({ type: 'added', newBlock: b[j++] })
    }
  }
  while (i < n) ops.push({ type: 'removed', oldBlock: a[i++] })
  while (j < m) ops.push({ type: 'added', newBlock: b[j++] })
  for (let k = suf; k > 0; k--) {
    ops.push({ type: 'same', oldBlock: oldBlocks[oldBlocks.length - k], newBlock: newBlocks[newBlocks.length - k] })
  }
  return ops
}

export type ExternalChangeStatus =
  | { status: 'unchanged'; block: Block }
  | { status: 'changed'; incoming: Block }
  // Deleted upstream with nothing to pair it with; `insertBefore` (the next surviving block
  // in `newBlocks`, if any) is where re-inserting kept local text would slot back in.
  | { status: 'removed'; insertBefore: Block | null }

/**
 * Where did `target` (a block from `oldBlocks`) end up in `newBlocks`? Used to check whether
 * the block a user is actively editing was itself touched by an external file change.
 * `target` must be the same object instance as one of the entries in `oldBlocks`.
 */
export function findBlockAfterExternalChange(
  oldBlocks: Block[],
  newBlocks: Block[],
  target: Block,
): ExternalChangeStatus {
  const ops = diffBlocks(oldBlocks, newBlocks)
  const idx = ops.findIndex((op) => op.type !== 'added' && op.oldBlock === target)
  if (idx < 0) return { status: 'unchanged', block: target } // not in oldBlocks — never report a false conflict
  const op = ops[idx]
  if (op.type === 'same') return { status: 'unchanged', block: op.newBlock }

  // `op` is 'removed'. Pair it with the plausible replacement: the 'added' block at the same
  // position within this contiguous run of removed/added ops (a paragraph edited in place
  // shows up as one removed + one added, right next to each other).
  let lo = idx
  while (lo > 0 && ops[lo - 1].type !== 'same') lo--
  let hi = idx
  while (hi < ops.length - 1 && ops[hi + 1].type !== 'same') hi++
  const run = ops.slice(lo, hi + 1)
  const removedRun = run.filter((o): o is Extract<BlockDiffOp, { type: 'removed' }> => o.type === 'removed')
  const addedRun = run.filter((o): o is Extract<BlockDiffOp, { type: 'added' }> => o.type === 'added')
  const pos = removedRun.findIndex((o) => o.oldBlock === target)
  const paired = addedRun[pos] ?? addedRun[addedRun.length - 1]
  if (paired) return { status: 'changed', incoming: paired.newBlock }

  // Nothing to pair with. The run ends at a 'same' op (or the end of the document), which is
  // the surviving block to re-anchor kept local text before.
  const next = ops[hi + 1]
  return { status: 'removed', insertBefore: next?.type === 'same' ? next.newBlock : null }
}

/**
 * Resolve a conflict in favour of the user's local text: splice it into `incomingDoc` at the
 * conflicted block's position, or re-insert it where it was if it was deleted upstream.
 */
export function resolveKeepMine(
  incomingDoc: string,
  status: Extract<ExternalChangeStatus, { status: 'changed' | 'removed' }>,
  localText: string,
): string {
  if (status.status === 'changed') return replaceBlock(incomingDoc, status.incoming, localText)
  const offset = status.insertBefore ? status.insertBefore.start : incomingDoc.length
  return insertBlockAt(incomingDoc, offset, localText)
}

export { countWords } from './words'
