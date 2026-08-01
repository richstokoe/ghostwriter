import { GitPanel } from './GitPanel'
import { LintPanel } from './LintPanel'
import { AiPanel } from './AiPanel'
import type { Finding } from '../../shared/lint'
import type { GitStatus } from '../../shared/types'

export type PanelTab = 'ai' | 'git' | 'lint'

export function RightPanel({
  tab,
  onTab,
  root,
  selectedFile,
  chapterTitle,
  doc,
  onInsert,
  onReplace,
  git,
  autoCommit,
  onToggleAuto,
  onGitChanged,
  findings,
  lintCustom,
  onLocate,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  root?: string
  selectedFile: string | null
  chapterTitle: string
  doc: string
  onInsert: (text: string) => void
  onReplace: (find: string, replace: string) => boolean
  git: GitStatus | null
  autoCommit: boolean
  onToggleAuto: (v: boolean) => void
  onGitChanged: () => Promise<void> | void
  findings: Finding[]
  lintCustom: boolean
  onLocate: (offset: number) => void
}) {
  const gitBadge = git?.isRepo && !git.clean ? git.files?.length ?? 0 : 0
  const lintBadge = findings.length

  return (
    <aside className="right-panel">
      <div className="panel-tabs">
        <button className={tab === 'ai' ? 'active' : ''} onClick={() => onTab('ai')}>
          AI
        </button>
        <button className={tab === 'git' ? 'active' : ''} onClick={() => onTab('git')}>
          Git{gitBadge ? <span className="tab-badge">{gitBadge}</span> : null}
        </button>
        <button className={tab === 'lint' ? 'active' : ''} onClick={() => onTab('lint')}>
          Lint{lintBadge ? <span className="tab-badge warn">{lintBadge}</span> : null}
        </button>
      </div>

      <div className="panel-body">
        {tab === 'ai' && (
          <AiPanel root={root} selectedFile={selectedFile} doc={doc} onInsert={onInsert} onReplace={onReplace} />
        )}
        {tab === 'git' && (
          <GitPanel
            root={root}
            selectedFile={selectedFile}
            chapterTitle={chapterTitle}
            git={git}
            autoCommit={autoCommit}
            onToggleAuto={onToggleAuto}
            onChanged={onGitChanged}
          />
        )}
        {tab === 'lint' && <LintPanel findings={findings} custom={lintCustom} onLocate={onLocate} />}
      </div>
    </aside>
  )
}
