// A tiny observable activity log. Every server operation flows through apiFetch()
// (see api.ts) which records a running/ok/error entry here; the Console panel renders it.

export type ActivityKind = 'git' | 'file' | 'ai' | 'char' | 'project' | 'voice'
export type ActivityStatus = 'running' | 'ok' | 'error'

export interface Activity {
  id: number
  time: number
  kind: ActivityKind
  label: string
  detail?: string
  status: ActivityStatus
  durationMs?: number
  message?: string
}

type Listener = (log: Activity[]) => void

const MAX = 300
let log: Activity[] = []
let seq = 1
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(log)
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  l(log)
  return () => listeners.delete(l)
}

export function pushActivity(kind: ActivityKind, label: string, detail?: string): number {
  const id = seq++
  log = [{ id, time: Date.now(), kind, label, detail, status: 'running' as const }, ...log].slice(0, MAX)
  emit()
  return id
}

export function finishActivity(id: number, patch: Partial<Activity>) {
  log = log.map((a) => (a.id === id ? { ...a, ...patch } : a))
  emit()
}

export function clearActivity() {
  log = []
  emit()
}

/** Log a client-side (non-HTTP) operation that runs a promise. */
export async function track<T>(kind: ActivityKind, label: string, work: () => Promise<T>, detail?: string): Promise<T> {
  const id = pushActivity(kind, label, detail)
  const t0 = performance.now()
  try {
    const result = await work()
    finishActivity(id, { status: 'ok', durationMs: Math.round(performance.now() - t0) })
    return result
  } catch (e) {
    finishActivity(id, { status: 'error', durationMs: Math.round(performance.now() - t0), message: (e as Error).message })
    throw e
  }
}
