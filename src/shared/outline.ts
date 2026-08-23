// Parse & serialize a per-chapter outline note. The on-disk format is fixed and is
// ALSO read by the server (timeline.ts, characters.ts), so serialize() must round-trip it
// exactly:
//
//   # <title>
//
//   **One purpose:** <one line>
//
//   **Characters:** <one line>
//
//   **Key events:**
//
//   - <event>
//   - <event>
//
//   ## TODO
//
//   - [ ] <task>
//   - [x] <done task>

export interface TodoItem {
  text: string
  done: boolean
}

export interface Outline {
  title: string
  onePurpose: string
  characters: string
  keyEvents: string[]
  todos: TodoItem[]
}

/** Collapse to a single line — the "One purpose" / "Characters" fields must stay inline. */
function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').trim()
}

export function parseOutline(md: string): Outline {
  const title = md.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim() ?? ''
  const onePurpose = md.match(/\*\*One purpose:\*\*\s*(.*)/i)?.[1]?.trim() ?? ''
  const characters = md.match(/\*\*Characters:\*\*\s*(.*)/i)?.[1]?.trim() ?? ''

  let keyEvents: string[] = []
  const keyIdx = md.search(/\*\*Key events:\*\*/i)
  const todoIdx = md.search(/^##\s+TODO/im)
  if (keyIdx >= 0) {
    const end = todoIdx > keyIdx ? todoIdx : md.length
    // skip past the "**Key events:**" label line itself
    const after = md.slice(md.indexOf('\n', keyIdx) + 1, end)
    keyEvents = Array.from(after.matchAll(/^\s*-\s+(?!\[[ xX]\])(.+?)\s*$/gm))
      .map((m) => m[1].trim())
      .filter(Boolean)
  }

  let todos: TodoItem[] = []
  if (todoIdx >= 0) {
    const after = md.slice(todoIdx)
    todos = Array.from(after.matchAll(/^\s*-\s+\[([ xX])\]\s*(.*?)\s*$/gm))
      .map((m) => ({ done: m[1].toLowerCase() === 'x', text: m[2].trim() }))
      .filter((t) => t.text.length > 0)
  }

  return { title, onePurpose, characters, keyEvents, todos }
}

export function serializeOutline(o: Outline): string {
  const events = o.keyEvents.map((e) => oneLine(e)).filter(Boolean)
  const todos = o.todos.filter((t) => t.text.trim().length > 0)

  const lines = [
    `# ${o.title || 'Untitled'}`,
    '',
    `**One purpose:** ${oneLine(o.onePurpose)}`,
    '',
    `**Characters:** ${oneLine(o.characters)}`,
    '',
    '**Key events:**',
    '',
    ...(events.length ? events.map((e) => `- ${e}`) : ['- ']),
    '',
    '## TODO',
    '',
    ...(todos.length ? todos.map((t) => `- [${t.done ? 'x' : ' '}] ${oneLine(t.text)}`) : ['- [ ] ']),
    '',
  ]
  return lines.join('\n')
}
