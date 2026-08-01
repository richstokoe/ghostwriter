import fs from 'node:fs/promises'
import path from 'node:path'
import { countWords } from '../shared/words'
import type { ChapterMeta, Project } from '../shared/types'
import { ensureManifest } from './manifest'
import { isConfigured, isAutoRecognised } from './config'

/** Load a project from an absolute root path. */
export async function loadProject(root: string): Promise<Project> {
  const m = await ensureManifest(root)
  const configured = await isConfigured(root)
  const autoRecognised = await isAutoRecognised(root)

  const chapters: ChapterMeta[] = []
  for (const e of m.chapters) {
    let content = ''
    try {
      content = await fs.readFile(path.join(root, e.file), 'utf8')
    } catch {
      /* placeholder / not yet created */
    }
    chapters.push({
      id: e.id,
      file: e.file,
      title: e.title ?? path.basename(e.file).replace(/\.md$/i, ''),
      words: countWords(content),
    })
  }

  return {
    title: m.title,
    root,
    wordTarget: m.wordTarget,
    configured,
    needsMapping: !autoRecognised,
    roles: m.roles,
    extraRoles: m.extraRoles,
    chapters,
  }
}
