export function DiffView({ text, emptyLabel }: { text: string; emptyLabel: string }) {
  // Treat "no diff / no HEAD yet" sentinels (from a fresh repo) as empty.
  if (!text || !text.trim() || text.startsWith('# no diff available')) {
    return <div className="diff-empty muted">{emptyLabel}</div>
  }
  const lines = text.split('\n')
  return (
    <pre className="diff">
      {lines.map((l, i) => {
        let cls = 'ctx'
        if (l.startsWith('+') && !l.startsWith('+++')) cls = 'add'
        else if (l.startsWith('-') && !l.startsWith('---')) cls = 'del'
        else if (l.startsWith('@@')) cls = 'hunk'
        else if (
          l.startsWith('diff ') ||
          l.startsWith('index ') ||
          l.startsWith('+++') ||
          l.startsWith('---') ||
          l.startsWith('new file') ||
          l.startsWith('deleted file')
        )
          cls = 'meta'
        return (
          <div key={i} className={`dl ${cls}`}>
            {l || ' '}
          </div>
        )
      })}
    </pre>
  )
}
