import { useEffect, useState } from 'react'
import { clearActivity, subscribe, type Activity } from '../lib/activity'

const KIND_LABEL: Record<string, string> = {
  git: 'GIT',
  file: 'FILE',
  ai: 'AI',
  char: 'CHAR',
  project: 'PROJ',
  voice: 'VOICE',
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour12: false })
}

export function ConsoleToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [running, setRunning] = useState(0)
  useEffect(() => subscribe((log) => setRunning(log.filter((a) => a.status === 'running').length)), [])
  return (
    <button className={`console-toggle${running > 0 ? ' busy' : ''}`} onClick={onToggle} title="Activity console">
      <span className="ct-dot" />
      {open ? 'Console ▾' : 'Console ▴'}
      {running > 0 && <span className="ct-count">{running}</span>}
    </button>
  )
}

export function ConsolePanel({ onClose }: { onClose: () => void }) {
  const [log, setLog] = useState<Activity[]>([])
  useEffect(() => subscribe(setLog), [])
  const running = log.filter((a) => a.status === 'running').length

  return (
    <div className="console-panel">
      <div className="console-head">
        <span className="console-title">Activity</span>
        <span className="console-meta">{running > 0 ? `${running} running` : `${log.length} events`}</span>
        <span className="spacer" />
        <button className="linklike" onClick={clearActivity}>
          Clear
        </button>
        <button className="linklike" onClick={onClose}>
          Close ▾
        </button>
      </div>
      <div className="console-body">
        {log.length === 0 && (
          <div className="console-empty muted">No activity yet. Git, file, AI and character operations appear here.</div>
        )}
        {log.map((a) => (
          <div key={a.id} className={`console-row ${a.status}`}>
            <span className="c-time">{fmtTime(a.time)}</span>
            <span className={`c-kind k-${a.kind}`}>{KIND_LABEL[a.kind] ?? a.kind}</span>
            <span className="c-icon">{a.status === 'running' ? '⏳' : a.status === 'ok' ? '✓' : '✗'}</span>
            <span className="c-label">{a.label}</span>
            <span className="c-detail">{a.detail}</span>
            <span className="c-dur">{a.durationMs != null ? `${a.durationMs}ms` : ''}</span>
            {a.message && <span className="c-msg">{a.message}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
