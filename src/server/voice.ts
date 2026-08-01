import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { DEFAULT_RULES, type LintLevel, type LintRule } from '../shared/lint'
import { loadConfig, rolesOf } from './config'

const LEVELS: LintLevel[] = ['error', 'warning', 'suggestion']

function isRule(x: unknown): x is LintRule {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  if (typeof r.name !== 'string' || typeof r.message !== 'string') return false
  if (!LEVELS.includes(r.level as LintLevel)) return false
  return Array.isArray(r.tokens) || typeof r.pattern === 'string'
}

export interface VoiceConfig {
  voice: string
  rules: LintRule[]
  /** true when rules came from the project's voice/rules.yml (vs. built-in defaults) */
  custom: boolean
}

export async function loadVoice(root: string): Promise<VoiceConfig> {
  const voiceDir = rolesOf(await loadConfig(root)).voice

  let voice = ''
  try {
    voice = await fs.readFile(path.join(root, voiceDir, 'voice.md'), 'utf8')
  } catch {
    /* no voice file */
  }

  let rules = DEFAULT_RULES
  let custom = false
  try {
    const raw = await fs.readFile(path.join(root, voiceDir, 'rules.yml'), 'utf8')
    const parsed = YAML.parse(raw)
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isRule)
      if (valid.length > 0) {
        rules = valid
        custom = true
      }
    }
  } catch {
    /* fall back to defaults */
  }

  return { voice, rules, custom }
}
