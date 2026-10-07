import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  aiGenerateStream,
  createChapter,
  deleteChapter,
  deleteCharacter,
  fetchFile,
  fetchProject,
  fetchVoice,
  gitCommit,
  gitStatus,
  listCharacters,
  reorderChapters,
  saveCharacter,
  saveFile,
  setWordTarget,
  type Character,
} from './lib/api'
import { Sidebar, type SidebarView } from './components/Sidebar'
import { FolderMapper } from './components/FolderMapper'
import { FindBar } from './components/FindBar'
import type { SearchOpen } from './components/SearchResults'
import { BlockEditor } from './components/BlockEditor'
import { CharacterEditor } from './components/CharacterEditor'
import { TimelineView } from './components/TimelineView'
import { VoiceEditor } from './components/VoiceEditor'
import { RightPanel, type PanelTab } from './components/RightPanel'
import { ConsolePanel, ConsoleToggle } from './components/ConsolePanel'
import { runLint, type LintRule } from '../shared/lint'
import type { GitStatus, Project } from '../shared/types'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character'
}

export function App() {
  const root = useMemo(() => new URLSearchParams(location.search).get('root') ?? undefined, [])

  const [view, setView] = useState<SidebarView>('chapters')
  const [project, setProject] = useState<Project | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [doc, setDoc] = useState('')
  const [save, setSave] = useState<SaveState>('idle')

  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)

  const [git, setGit] = useState<GitStatus | null>(null)
  const [showPanel, setShowPanel] = useState(true)
  const [panelTab, setPanelTab] = useState<PanelTab>('ai')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [autoCommit, setAutoCommit] = useState(() => localStorage.getItem('gw.autoCommit') === '1')
  const autoTimer = useRef<number | null>(null)

  const [rules, setRules] = useState<LintRule[]>([])
  const [lintCustom, setLintCustom] = useState(false)

  const [showMapper, setShowMapper] = useState(false)

  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')

  useEffect(() => {
    localStorage.setItem('gw.autoCommit', autoCommit ? '1' : '0')
  }, [autoCommit])

  // Cmd/Ctrl+F opens the in-chapter find bar (only meaningful in the chapter view).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && view === 'chapters') {
        e.preventDefault()
        setFindOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  const refreshGit = useCallback(async () => {
    try {
      setGit(await gitStatus(root))
    } catch {
      setGit(null)
    }
  }, [root])

  const reloadCharacters = useCallback(async () => {
    try {
      setCharacters(await listCharacters(root))
    } catch {
      /* ignore */
    }
  }, [root])

  const reloadVoice = useCallback(() => {
    fetchVoice(root)
      .then((v) => {
        setRules(v.rules)
        setLintCustom(v.custom)
      })
      .catch((err) => console.error(err))
  }, [root])

  // Initial load.
  useEffect(() => {
    fetchProject(root)
      .then((p) => {
        setProject(p)
        if (p.chapters[0]) setSelected(p.chapters[0].file)
        if (p.needsMapping) setShowMapper(true)
      })
      .catch((err) => console.error(err))
    refreshGit()
    reloadCharacters()
    reloadVoice()
  }, [root, refreshGit, reloadCharacters, reloadVoice])

  // Adopt a freshly-saved folder mapping: reset selection and reload dependent data.
  const onConfigSaved = useCallback(
    (p: Project) => {
      setProject(p)
      setSelected(p.chapters[0]?.file ?? null)
      setShowMapper(false)
      reloadCharacters()
      reloadVoice()
      refreshGit()
    },
    [reloadCharacters, reloadVoice, refreshGit],
  )

  // Load the selected chapter's content.
  useEffect(() => {
    if (!selected) return
    fetchFile(selected, root)
      .then((f) => setDoc(f.content))
      .catch((err) => console.error(err))
  }, [selected, root])

  const current = project?.chapters.find((c) => c.file === selected) ?? null
  const findings = useMemo(() => runLint(doc, rules), [doc, rules])

  const onChangeDoc = useCallback(
    async (next: string) => {
      setDoc(next)
      if (!selected) return
      setSave('saving')
      try {
        await saveFile(selected, next, root)
        setSave('saved')
        fetchProject(root).then(setProject).catch(() => {})
        refreshGit().catch(() => {})

        if (autoCommit && git?.isRepo) {
          const title = current?.title ?? selected
          const file = selected
          if (autoTimer.current) clearTimeout(autoTimer.current)
          autoTimer.current = window.setTimeout(async () => {
            try {
              await gitCommit(`Update ${title}`, [file], root)
              await refreshGit()
            } catch (e) {
              console.error(e)
            }
          }, 1500)
        }
      } catch (err) {
        console.error(err)
        setSave('error')
      }
    },
    [selected, root, refreshGit, autoCommit, git, current],
  )

  const onInsertDraft = useCallback(
    (text: string) => {
      const base = doc.replace(/\s*$/, '')
      onChangeDoc(base ? `${base}\n\n${text}\n` : `${text}\n`)
    },
    [doc, onChangeDoc],
  )

  // Draft the next paragraph inline, from within an empty block editor.
  const aiWriteParagraph = useCallback(
    (onDelta: (t: string) => void) => {
      if (!selected) return Promise.reject(new Error('no chapter selected'))
      return aiGenerateStream(selected, 'paragraph', doc, root, { onDelta })
    },
    [selected, doc, root],
  )

  // Apply a review note: replace its exact quote with the suggested rewrite. Returns false if the
  // quote can't be found verbatim (model paraphrased it, or it was already changed).
  const onReplaceText = useCallback(
    (find: string, replace: string): boolean => {
      if (!find) return false
      const idx = doc.indexOf(find)
      if (idx < 0) return false
      onChangeDoc(doc.slice(0, idx) + replace + doc.slice(idx + find.length))
      return true
    },
    [doc, onChangeDoc],
  )

  const onLocate = useCallback((offset: number) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.block-editor .block[data-start]'))
    let target: HTMLElement | null = null
    for (const el of els) {
      if (Number(el.dataset.start) <= offset) target = el
      else break
    }
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.classList.add('flash')
      window.setTimeout(() => target?.classList.remove('flash'), 1200)
    }
  }, [])

  // ---- chapter management ----
  const onCreateChapter = useCallback(
    async (title: string) => {
      const p = await createChapter(title, undefined, root)
      setProject(p)
      const last = p.chapters[p.chapters.length - 1]
      if (last) setSelected(last.file)
    },
    [root],
  )

  const onDeleteChapter = useCallback(
    async (id: string) => {
      const p = await deleteChapter(id, root)
      setProject(p)
      if (!p.chapters.some((c) => c.file === selected)) setSelected(p.chapters[0]?.file ?? null)
    },
    [root, selected],
  )

  const onMoveChapter = useCallback(
    async (id: string, dir: -1 | 1) => {
      if (!project) return
      const ids = project.chapters.map((c) => c.id)
      const idx = ids.indexOf(id)
      const j = idx + dir
      if (idx < 0 || j < 0 || j >= ids.length) return
      ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
      setProject(await reorderChapters(ids, root))
    },
    [project, root],
  )

  const onSetTarget = useCallback(
    async (n: number) => {
      setProject(await setWordTarget(n, root))
    },
    [root],
  )

  // ---- character management ----
  const onCreateCharacter = useCallback(
    async (name: string) => {
      const id = slugify(name)
      await saveCharacter({ id, name, description: '' }, root)
      await reloadCharacters()
      setSelectedCharId(id)
    },
    [root, reloadCharacters],
  )

  const onSaveCharacter = useCallback(
    async (c: Character) => {
      await saveCharacter(c, root)
      await reloadCharacters()
    },
    [root, reloadCharacters],
  )

  const onDeleteCharacterCb = useCallback(
    async (id: string) => {
      await deleteCharacter(id, root)
      await reloadCharacters()
      setSelectedCharId((cur) => (cur === id ? null : cur))
    },
    [root, reloadCharacters],
  )

  const onOpenChapter = useCallback((file: string) => {
    setView('chapters')
    setSelected(file)
  }, [])

  // Open a "Find anywhere" result in the right place: chapters (and outlines, mapped to
  // their chapter) jump into the editor with find primed; other roles switch their view.
  const onOpenSearch = useCallback(
    (hit: SearchOpen) => {
      const base = (p: string) => p.split('/').pop() ?? p
      const openChapterWithFind = (file: string) => {
        setView('chapters')
        setSelected(file)
        setFindQuery(hit.query)
        setFindOpen(true)
      }
      if (hit.role === 'chapters') {
        openChapterWithFind(hit.file)
      } else if (hit.role === 'outline') {
        const ch = project?.chapters.find((c) => base(c.file) === base(hit.file))
        if (ch) openChapterWithFind(ch.file)
      } else if (hit.role === 'characters') {
        setView('characters')
        setSelectedCharId(base(hit.file).replace(/\.md$/i, ''))
      } else if (hit.role === 'timeline') {
        setView('timeline')
      } else if (hit.role === 'voice') {
        setView('voice')
      }
    },
    [project],
  )

  const selectedChar = characters.find((c) => c.id === selectedCharId) ?? null
  const changed = git?.files?.length ?? 0
  const warnCount = findings.length
  const withPanel = showPanel && view === 'chapters'

  return (
    <div className={withPanel ? 'app with-panel' : 'app'}>
      <Sidebar
        view={view}
        onView={setView}
        project={project}
        selected={selected}
        onSelect={setSelected}
        onCreateChapter={onCreateChapter}
        onDeleteChapter={onDeleteChapter}
        onMoveChapter={onMoveChapter}
        onSetTarget={onSetTarget}
        characters={characters}
        selectedCharId={selectedCharId}
        onSelectChar={setSelectedCharId}
        onCreateCharacter={onCreateCharacter}
        onCharactersBuilt={reloadCharacters}
        root={root}
        onConfigure={() => setShowMapper(true)}
        onOpenSearch={onOpenSearch}
      />

      {view === 'chapters' && (
        <main className="workspace">
          <header className="chapter-head">
            <div className="chapter-title">{current?.title ?? '—'}</div>
            <div className="head-right">
              <div className={`save-state ${save}`}>
                {save === 'saving' && 'Saving…'}
                {save === 'saved' && 'Saved'}
                {save === 'error' && 'Save failed'}
              </div>
              {warnCount > 0 && (
                <span className="lint-chip" onClick={() => { setShowPanel(true); setPanelTab('lint') }}>
                  ⚠ {warnCount}
                </span>
              )}
              {git?.isRepo && (
                <span className="git-chip">
                  ⑂ {git.branch} · {git.clean ? 'clean' : `${changed} ✎`}
                </span>
              )}
              <button className="icon-btn" title="Find in chapter (⌘/Ctrl+F)" onClick={() => setFindOpen((o) => !o)}>
                Find
              </button>
              <button className="icon-btn" onClick={() => setShowPanel((s) => !s)}>
                {showPanel ? 'Hide Panel' : 'Panel'}
              </button>
            </div>
          </header>
          {findOpen && (
            <FindBar query={findQuery} onQuery={setFindQuery} onClose={() => setFindOpen(false)} doc={doc} />
          )}
          <div className="scroll">
            {selected ? (
              <BlockEditor doc={doc} onChange={onChangeDoc} onAiWrite={aiWriteParagraph} />
            ) : (
              <p className="empty">Select or add a chapter to begin.</p>
            )}
          </div>
        </main>
      )}
      {view === 'characters' && (
        <main className="workspace">
          {selectedChar ? (
            <CharacterEditor
              character={selectedChar}
              root={root}
              onSave={onSaveCharacter}
              onDelete={onDeleteCharacterCb}
            />
          ) : (
            <div className="scroll">
              <p className="empty">Select a character, or add one, to capture their details.</p>
            </div>
          )}
        </main>
      )}
      {view === 'timeline' && (
        <main className="workspace">
          <div className="scroll">
            <TimelineView root={root} chapters={project?.chapters ?? []} onOpenChapter={onOpenChapter} />
          </div>
        </main>
      )}
      {view === 'voice' && (
        <main className="workspace">
          <VoiceEditor root={root} onSaved={reloadVoice} />
        </main>
      )}

      {withPanel && (
        <RightPanel
          tab={panelTab}
          onTab={setPanelTab}
          root={root}
          selectedFile={selected}
          chapterTitle={current?.title ?? ''}
          doc={doc}
          onInsert={onInsertDraft}
          onReplace={onReplaceText}
          git={git}
          autoCommit={autoCommit}
          onToggleAuto={setAutoCommit}
          onGitChanged={refreshGit}
          findings={findings}
          lintCustom={lintCustom}
          onLocate={onLocate}
        />
      )}

      <ConsoleToggle open={consoleOpen} onToggle={() => setConsoleOpen((o) => !o)} />
      {consoleOpen && <ConsolePanel onClose={() => setConsoleOpen(false)} />}

      {showMapper && <FolderMapper root={root} onSaved={onConfigSaved} onClose={() => setShowMapper(false)} />}
    </div>
  )
}
