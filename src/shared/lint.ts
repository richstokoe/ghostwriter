// A tool-native prose linter — the "signs of AI writing" checks, run live in the
// editor. Two rule kinds: `tokens` (word/phrase existence) and `pattern` (regex).

export type LintLevel = 'error' | 'warning' | 'suggestion'

export interface LintRule {
  name: string
  level: LintLevel
  /** shown to the author; `{match}` is replaced with the matched text */
  message: string
  /** word/phrase list, matched case-insensitively on word boundaries */
  tokens?: string[]
  /** raw regex source, matched case-insensitively and globally */
  pattern?: string
}

export interface Finding {
  rule: string
  level: LintLevel
  message: string
  match: string
  start: number
  end: number
  line: number
  col: number
}

export const LEVEL_ORDER: Record<LintLevel, number> = { error: 0, warning: 1, suggestion: 2 }

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Blank out fenced code blocks (keep length/offsets) so prose rules skip code. */
function maskCode(doc: string): string {
  return doc.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
}

function ruleRegex(rule: LintRule): RegExp | null {
  if (rule.pattern) {
    try {
      return new RegExp(rule.pattern, 'gi')
    } catch {
      return null
    }
  }
  if (rule.tokens && rule.tokens.length > 0) {
    const alt = rule.tokens.map(escapeRegExp).join('|')
    return new RegExp(`\\b(?:${alt})\\b`, 'gi')
  }
  return null
}

export function runLint(doc: string, rules: LintRule[]): Finding[] {
  const masked = maskCode(doc)
  // line-start offsets for fast line/col lookup
  const lineStarts: number[] = [0]
  for (let i = 0; i < masked.length; i++) if (masked[i] === '\n') lineStarts.push(i + 1)
  const locate = (offset: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return { line: lo + 1, col: offset - lineStarts[lo] + 1 }
  }

  const findings: Finding[] = []
  for (const rule of rules) {
    const re = ruleRegex(rule)
    if (!re) continue
    let m: RegExpExecArray | null
    while ((m = re.exec(masked)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++
        continue
      }
      const start = m.index
      const { line, col } = locate(start)
      findings.push({
        rule: rule.name,
        level: rule.level,
        message: rule.message.replace('{match}', m[0]),
        match: m[0],
        start,
        end: start + m[0].length,
        line,
        col,
      })
    }
  }
  findings.sort((a, b) => a.start - b.start)
  return findings
}

// Default house style — the built-in "signs of AI writing" rule set.
export const DEFAULT_RULES: LintRule[] = [
  {
    name: 'Grandeur',
    level: 'warning',
    message: "Unearned grandeur: '{match}' asserts importance instead of showing it.",
    tokens: ['crucial', 'pivotal', 'profound', 'profoundly', 'groundbreaking', 'vital', 'a testament to', 'underscores the importance', 'plays a crucial role'],
  },
  {
    name: 'Descriptors',
    level: 'suggestion',
    message: "Generic descriptor '{match}' flattens distinction — reach for a specific detail.",
    tokens: ['vibrant', 'intricate', 'meticulous', 'meticulously', 'enduring', 'nestled', 'bustling'],
  },
  {
    name: 'MetaphorNoun',
    level: 'suggestion',
    message: "Abstract metaphor-as-noun '{match}' obscures — use the literal noun or a fresh image.",
    tokens: ['tapestry', 'landscape', 'interplay', 'realm'],
  },
  {
    name: 'GestureVerbs',
    level: 'suggestion',
    message: "Performative verb '{match}' signals effort more than it describes — use a plain verb.",
    tokens: ['delve', 'delves', 'delving', 'showcase', 'showcases', 'garner', 'garnered', 'bolster', 'foster', 'fostering'],
  },
  {
    name: 'Framing',
    level: 'warning',
    message: "Meaning-free framing '{match}' — strip the wrapper and assert the claim.",
    tokens: ['serves as', 'plays a vital role', 'a rich tapestry of', 'encompasses a diverse range'],
  },
  {
    name: 'ShapeOf',
    level: 'suggestion',
    message: "'the shape of' is an abstraction standing in for a sensory word — cut or replace.",
    pattern: 'the shape of\\b',
  },
  {
    name: 'EmDash',
    level: 'suggestion',
    message: 'Em-dash — reach for a comma, parentheses, or full stop first.',
    pattern: '\\u2014',
  },
  {
    name: 'FauxBalance',
    level: 'warning',
    message: "Faux-balance construction '{match}' reads as a defensive correction — state it directly.",
    pattern: 'not (?:just|only)\\b[^.\\n]{0,60}?\\bbut(?: also)?\\b',
  },
  {
    name: 'VagueAttribution',
    level: 'warning',
    message: "Vague attribution '{match}' — cite a specific source or omit.",
    pattern: '\\b(?:experts|observers|critics|analysts|some|many)\\s+(?:say|note|argue|believe|claim)\\b',
  },
  {
    name: 'SentenceStartContrast',
    level: 'suggestion',
    message: "Manufactured contrast at a sentence start ('{match}') — often a full stop and a fresh thought is better.",
    pattern: '(?:^|\\n)\\s*(?:However|Despite this|Nevertheless|Moreover|Furthermore),',
  },
  {
    name: 'ThrillerCliche',
    level: 'suggestion',
    message: "Stock-thriller cliché '{match}' — render the sensation concretely instead.",
    tokens: ['her breath hitched', 'his breath hitched', 'mind raced', 'pit of her stomach', 'pit of his stomach', 'a laugh that lacked'],
  },
]
