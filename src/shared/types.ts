// Isomorphic types shared by the Fastify server and the React client.

/** Directories holding each role Ghostwriter consumes, relative to the project root. */
export interface Roles {
  chapters: string
  outline: string
  characters: string
  timeline: string
  voice: string
}

export interface ChapterMeta {
  id: string
  /** path relative to the project root, e.g. "manuscript/01-the-signal.md" */
  file: string
  title: string
  words: number
}

export interface Project {
  title: string
  /** absolute path on disk */
  root: string
  wordTarget: number
  /** true when a `.ghostwriter/config.json` exists for this folder */
  configured: boolean
  /** true when the folder is not auto-recognised and the mapping UI should be shown */
  needsMapping: boolean
  /** resolved role → directory map (config values layered over defaults) */
  roles: Roles
  /** inert user-added roles (stored, not yet consumed by features) */
  extraRoles?: Record<string, string>
  chapters: ChapterMeta[]
}

export interface FileContent {
  path: string
  content: string
}

export interface GitFileStatus {
  path: string
  /** staged (index) status letter, e.g. "M", "A", " " */
  index: string
  /** working-tree status letter */
  working: string
}

export interface GitStatus {
  isRepo: boolean
  branch?: string | null
  ahead?: number
  behind?: number
  clean?: boolean
  hasCommits?: boolean
  files?: GitFileStatus[]
}

export interface GitCommit {
  hash: string
  shortHash: string
  date: string
  message: string
  author: string
}
