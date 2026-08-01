import type { Finding } from '../../shared/lint'

const ICON: Record<string, string> = { error: '⛔', warning: '⚠', suggestion: '›' }

export function LintPanel({
  findings,
  custom,
  onLocate,
}: {
  findings: Finding[]
  custom: boolean
  onLocate: (offset: number) => void
}) {
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.level] = (acc[f.level] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="lint-panel">
      <div className="lint-head">
        <span>
          {findings.length === 0 ? 'No issues' : `${findings.length} issue${findings.length === 1 ? '' : 's'}`}
        </span>
        <span className="lint-counts">
          {counts.warning ? <span className="lc warning">⚠ {counts.warning}</span> : null}
          {counts.suggestion ? <span className="lc suggestion">› {counts.suggestion}</span> : null}
        </span>
      </div>
      <div className="lint-source muted">{custom ? 'project voice/rules.yml' : 'built-in house style'}</div>

      {findings.length === 0 ? (
        <div className="lint-empty muted">Nothing flagged in this chapter. Clean prose.</div>
      ) : (
        <ol className="lint-list">
          {findings.map((f, i) => (
            <li key={i} className={`lint-item ${f.level}`} onClick={() => onLocate(f.start)}>
              <span className="li-icon">{ICON[f.level] ?? '›'}</span>
              <div className="li-body">
                <div className="li-top">
                  <span className="li-rule">{f.rule}</span>
                  <span className="li-loc">L{f.line}</span>
                </div>
                <div className="li-msg">{f.message}</div>
                <div className="li-match">“{f.match}”</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
