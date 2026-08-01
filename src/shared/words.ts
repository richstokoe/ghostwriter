/** Word count used for progress toward the manuscript target. Kept dependency-free so
 *  the server can import it without pulling in the markdown parser. */
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
