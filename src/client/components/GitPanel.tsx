import { useEffect, useState } from 'react'
import { gitCommit, gitDiff, gitInit, gitLog } from '../lib/api'
import { DiffView } from './DiffView'
import type { GitCommit, GitStatus } from '../../shared/types'

export function GitPanel({
  root,
  selectedFile,
  chapterTitle,
  git,
  autoCommit,
  onToggleAuto,
  onChanged,
}: {
  root?: string
  selectedFile: string | null
  chapterTitle: string
  git: GitStatus | null
  autoCommit: boolean
  onToggleAuto: (v: boolean) => void
  onChanged: () => Promise<void> | void
}) {
  const [view, setView] = useState<'changes' | 'history'>('changes')
  const [scope, setScope] = useState<'project' | 'chapter'>(() =>
    localStorage.getItem('gw.gitScope') === 'chapter' ? 'chapter' : 'project',
  )
  const [diffText, setDiffText] = useState('')
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [activeHash, setActiveHash] = useState<string | undefined>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRepo = git?.isRepo ?? false

  // When scoped to the chapter, filter by the selected file; otherwise (whole
  // project) pass no path so History/Changes show the entire repository and
  // stay stable as you navigate between chapters.
  const scopePath = scope === 'chapter' ? (selectedFile ?? undefined) : undefined

  useEffect(() => {
    localStorage.setItem('gw.gitScope', scope)
  }, [scope])

  useEffect(() => {
    setMessage(chapterTitle ? `Update ${chapterTitle}` : 'Update manuscript')
  }, [chapterTitle])

  // Working-tree diff for the current scope.
  useEffect(() => {
    if (!isRepo || view !== 'changes') return
    setActiveHash(undefined)
    gitDiff(scopePath, undefined, root)
      .then(setDiffText)
      .catch(() => setDiffText(''))
  }, [isRepo, view, scopePath, root, git])

  // Commit history for the current scope.
  useEffect(() => {
    if (!isRepo || view !== 'history') return
    gitLog(scopePath, root)
      .then(setCommits)
      .catch(() => setCommits([]))
  }, [isRepo, view, scopePath, root, git])

  const showCommit = async (hash: string) => {
    setActiveHash(hash)
    try {
      setDiffText(await gitDiff(scopePath, hash, root))
    } catch {
      setDiffText('')
    }
  }

  const doInit = async () => {
    setBusy(true)
    setError(null)
    try {
      await gitInit(root)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doCommit = async () => {
    setBusy(true)
    setError(null)
    try {
      await gitCommit(message, undefined, root) // commit all staged/working changes
      await onChanged()
      if (view === 'history') gitLog(scopePath, root).then(setCommits).catch(() => {})
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!git) {
    return (
      <div className="git-panel">
        <div className="muted pad">Loading git…</div>
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className="git-panel">
        <div className="git-empty">
          <p className="muted">This project isn’t a git repository yet.</p>
          <button className="btn" disabled={busy} onClick={doInit}>
            Initialize repository
          </button>
          {error && <p className="git-error">{error}</p>}
        </div>
      </div>
    )
  }

  const changed = git.files?.length ?? 0

  return (
    <div className="git-panel">
      <div className="git-head">
        <span className="branch">⑂ {git.branch ?? 'HEAD'}</span>
        <span className={git.clean ? 'dirty clean' : 'dirty'}>
          {git.clean ? 'clean' : `${changed} changed`}
        </span>
      </div>

      <label className="auto-commit">
        <input type="checkbox" checked={autoCommit} onChange={(e) => onToggleAuto(e.target.checked)} />
        Auto-commit on save
      </label>

      {!git.clean && (
        <div className="commit-box">
          <textarea
            value={message}
            rows={2}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message"
          />
          <button className="btn" disabled={busy || !message.trim()} onClick={doCommit}>
            Commit all changes
          </button>
        </div>
      )}

      {error && <p className="git-error pad">{error}</p>}

      <div className="git-scope" role="group" aria-label="History & diff scope">
        <button
          className={scope === 'chapter' ? 'active' : ''}
          onClick={() => setScope('chapter')}
          title="Show history and changes for the current chapter only"
        >
          This chapter
        </button>
        <button
          className={scope === 'project' ? 'active' : ''}
          onClick={() => setScope('project')}
          title="Show history and changes for the whole project"
        >
          Whole project
        </button>
      </div>

      <div className="git-tabs">
        <button className={view === 'changes' ? 'active' : ''} onClick={() => setView('changes')}>
          Changes
        </button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
          History
        </button>
      </div>

      {view === 'history' && (
        <ol className="commits">
          {commits.length === 0 && (
            <li className="muted">
              {scope === 'chapter' ? 'No commits yet for this chapter.' : 'No commits yet.'}
            </li>
          )}
          {commits.map((c) => (
            <li
              key={c.hash}
              className={c.hash === activeHash ? 'commit active' : 'commit'}
              onClick={() => showCommit(c.hash)}
            >
              <span className="chash">{c.shortHash}</span>
              <span className="cmsg">{c.message}</span>
              <span className="cdate">{new Date(c.date).toLocaleDateString()}</span>
            </li>
          ))}
        </ol>
      )}

      <DiffView
        text={diffText}
        emptyLabel={
          view === 'changes'
            ? scope === 'chapter'
              ? 'No uncommitted changes in this chapter.'
              : 'No uncommitted changes.'
            : 'Select a commit to view its changes.'
        }
      />
    </div>
  )
}
