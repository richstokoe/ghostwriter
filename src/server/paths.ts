import path from 'node:path'

/**
 * Default project when no ?root is given — the bundled sample book. Electron overrides
 * this (via GHOSTWRITER_DEFAULT_ROOT) with a writable copy in the user's data dir.
 */
export const DEFAULT_ROOT = process.env.GHOSTWRITER_DEFAULT_ROOT
  ? path.resolve(process.env.GHOSTWRITER_DEFAULT_ROOT)
  : path.join(process.cwd(), 'sample-project')

export function resolveRoot(raw: unknown): string {
  const r = typeof raw === 'string' && raw.length > 0 ? raw : DEFAULT_ROOT
  return path.resolve(r)
}

/** Resolve rel against root and refuse anything that escapes the project root. */
export function safeJoin(root: string, rel: string): string {
  const base = path.resolve(root)
  const abs = path.resolve(base, rel)
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error('path escapes project root')
  }
  return abs
}
