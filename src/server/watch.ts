import path from 'node:path'
import { watch as chokidarWatch } from 'chokidar'
import { IGNORED_DIRS, isIgnoredDir } from './paths'

export type ChangeKind = 'add' | 'change' | 'unlink'

export interface WatchHandle {
  close: () => Promise<void>
}

/**
 * Watch a project folder for on-disk changes — a git pull, another window, an external
 * editor — so an open client can react live instead of silently going stale. `onChange`
 * receives the changed file's path relative to `root`, posix-separated (matching how the
 * rest of the API addresses files).
 */
export function watchProject(root: string, onChange: (relPath: string, kind: ChangeKind) => void): WatchHandle {
  const watcher = chokidarWatch(root, {
    ignoreInitial: true,
    // Skip anything inside a directory we never surface (.git, node_modules, dist*, …) —
    // the same rule the folder mapper and search use. Ancestor segments are always
    // directories; the last segment may be a file, and chokidar doesn't always pass `stats`
    // to say which, so only apply the `dist*` prefix rule to it when we know it's a
    // directory — otherwise a chapter named "district.md" would never update live.
    ignored: (p, stats) => {
      const rel = path.relative(root, p)
      if (!rel || rel.startsWith('..')) return false
      const segments = rel.split(path.sep)
      const last = segments.pop() as string
      if (segments.some(isIgnoredDir)) return true
      return stats?.isDirectory() ? isIgnoredDir(last) : IGNORED_DIRS.has(last)
    },
    // chokidar opens one OS watcher per directory, so bound the recursion: book roles live at
    // most two levels deep (the folder mapper's limit), and an accidentally-opened huge
    // folder (e.g. ~/Documents) shouldn't exhaust file handles.
    depth: 3,
    // Wait for a file to stop being written to before firing, so we never read a half-saved file.
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })

  const relPosix = (abs: string) => path.relative(root, abs).split(path.sep).join('/')
  watcher.on('add', (p) => onChange(relPosix(p), 'add'))
  watcher.on('change', (p) => onChange(relPosix(p), 'change'))
  watcher.on('unlink', (p) => onChange(relPosix(p), 'unlink'))
  // Watch errors (e.g. a permissions issue on one subdirectory) shouldn't crash the server.
  watcher.on('error', (err) => console.error('file watcher error:', err))

  return { close: () => watcher.close() }
}
