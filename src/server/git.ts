import { simpleGit, type SimpleGit } from 'simple-git'
import type { GitCommit, GitStatus } from '../shared/types'

function repo(root: string): SimpleGit {
  return simpleGit({ baseDir: root, maxConcurrentProcesses: 1 })
}

export async function status(root: string): Promise<GitStatus> {
  const git = repo(root)
  let isRepo = false
  try {
    isRepo = await git.checkIsRepo()
  } catch {
    isRepo = false
  }
  if (!isRepo) return { isRepo: false }

  const s = await git.status()
  let hasCommits = true
  try {
    await git.revparse(['HEAD'])
  } catch {
    hasCommits = false
  }
  return {
    isRepo: true,
    branch: s.current,
    ahead: s.ahead,
    behind: s.behind,
    clean: s.isClean(),
    hasCommits,
    files: s.files.map((f) => ({ path: f.path, index: f.index, working: f.working_dir })),
  }
}

export async function init(root: string): Promise<void> {
  await repo(root).init()
}

export interface CommitResult {
  commit: string
  summary: { changes: number; insertions: number; deletions: number }
}

export async function commit(root: string, message: string, paths?: string[]): Promise<CommitResult> {
  const git = repo(root)
  if (paths && paths.length > 0) await git.add(paths)
  else await git.add('.')
  const res = await git.commit(message)
  return { commit: res.commit, summary: res.summary }
}

export async function log(root: string, file?: string): Promise<GitCommit[]> {
  const git = repo(root)
  try {
    const res = await git.log(file ? { file, maxCount: 50 } : { maxCount: 50 })
    return res.all.map((c) => ({
      hash: c.hash,
      shortHash: c.hash.slice(0, 7),
      date: c.date,
      message: c.message,
      author: c.author_name,
    }))
  } catch {
    return []
  }
}

/**
 * A unified diff. With `hash`: that commit's changes (optionally scoped to `file`).
 * Without: the working tree vs HEAD (optionally scoped to `file`).
 */
export async function diff(root: string, file?: string, hash?: string): Promise<string> {
  const git = repo(root)
  try {
    if (hash) {
      const args = [hash]
      if (file) args.push('--', file)
      return await git.show(args)
    }
    const args = ['HEAD']
    if (file) args.push('--', file)
    return await git.diff(args)
  } catch (err) {
    return `# no diff available\n# ${(err as Error).message}`
  }
}
