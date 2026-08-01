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
import type { Root } from 'mdast'

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

export { countWords } from './words'
