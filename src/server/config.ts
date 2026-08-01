import fs from 'node:fs/promises'
import path from 'node:path'
import type { Roles } from '../shared/types'

/**
 * Portable, single-canonical project config. Lives at `<root>/.ghostwriter/config.json`
 * and travels with the book. It records which folder holds each "role" (chapters,
 * outlines, characters, timeline, voice) plus optional inert extra roles, so a folder
 * that doesn't follow Ghostwriter's default layout can still be opened without moving files.
 *
 * This replaces the older root-level `ghostwriter.json`; that legacy file is no longer read.
 */

export type { Roles }

export interface GhostwriterConfig {
  format: string
  version: number
  title?: string
  wordTarget?: number
  /** partial: any unset role falls back to DEFAULT_ROLES */
  roles?: Partial<Roles>
  /** user-added roles Ghostwriter stores but does not yet consume */
  extraRoles?: Record<string, string>
  /** optional explicit chapter list, materialised on first create/reorder/delete */
  chapters?: { id: string; file: string; title?: string; outline?: string }[]
}

/** Conventional layout used when a role isn't mapped in config. */
export const DEFAULT_ROLES: Roles = {
  chapters: 'manuscript',
  outline: 'outline',
  characters: 'characters',
  timeline: 'timeline',
  voice: 'voice',
}

export const CONFIG_DIR = '.ghostwriter'
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

/** Read `.ghostwriter/config.json`, or null if the folder has none. No legacy fallback. */
export async function loadConfig(root: string): Promise<GhostwriterConfig | null> {
  try {
    const raw = await fs.readFile(path.join(root, CONFIG_FILE), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as GhostwriterConfig) : null
  } catch {
    return null
  }
}

/** Resolve a full role map, layering a (possibly partial) config over the defaults. */
export function rolesOf(cfg: GhostwriterConfig | null): Roles {
  const r = cfg?.roles ?? {}
  return {
    chapters: r.chapters?.trim() || DEFAULT_ROLES.chapters,
    outline: r.outline?.trim() || DEFAULT_ROLES.outline,
    characters: r.characters?.trim() || DEFAULT_ROLES.characters,
    timeline: r.timeline?.trim() || DEFAULT_ROLES.timeline,
    voice: r.voice?.trim() || DEFAULT_ROLES.voice,
  }
}

export async function saveConfig(root: string, cfg: GhostwriterConfig): Promise<void> {
  await fs.mkdir(path.join(root, CONFIG_DIR), { recursive: true })
  await fs.writeFile(path.join(root, CONFIG_FILE), JSON.stringify(cfg, null, 2) + '\n', 'utf8')
}

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

/** True when a config exists. Distinguishes an explicitly-configured project. */
export async function isConfigured(root: string): Promise<boolean> {
  return (await loadConfig(root)) !== null
}

/**
 * True when the folder can be understood without asking the user to map it: it either
 * has a config, or already follows the default `manuscript/` convention. When false, the
 * client shows the folder-mapping UI.
 */
export async function isAutoRecognised(root: string): Promise<boolean> {
  if (await isConfigured(root)) return true
  return dirExists(path.join(root, DEFAULT_ROLES.chapters))
}
