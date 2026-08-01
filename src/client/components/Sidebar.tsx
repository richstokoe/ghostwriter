import { Organiser } from './Organiser'
import { CharacterList } from './CharacterList'
import { ThemeToggle } from './ThemeToggle'
import type { Project } from '../../shared/types'
import type { Character } from '../lib/api'

export type SidebarView = 'chapters' | 'characters' | 'timeline' | 'voice'

export function Sidebar({
  view,
  onView,
  project,
  selected,
  onSelect,
  onCreateChapter,
  onDeleteChapter,
  onMoveChapter,
  onSetTarget,
  characters,
  selectedCharId,
  onSelectChar,
  onCreateCharacter,
  onConfigure,
}: {
  view: SidebarView
  onView: (v: SidebarView) => void
  project: Project | null
  selected: string | null
  onSelect: (file: string) => void
  onCreateChapter: (title: string) => void
  onDeleteChapter: (id: string) => void
  onMoveChapter: (id: string, dir: -1 | 1) => void
  onSetTarget: (n: number) => void
  characters: Character[]
  selectedCharId: string | null
  onSelectChar: (id: string) => void
  onCreateCharacter: (name: string) => void
  onConfigure: () => void
}) {
  return (
    <aside className="sidebar">
      <div className="organiser-head">
        <div className="proj-title">{project?.title ?? 'Loading…'}</div>
        <div className="proj-sub">
          <span>{project?.configured ? 'ghostwriter project' : 'markdown folder'}</span>
          <button className="linklike proj-configure" onClick={onConfigure} title="Map folders to roles">
            Configure folders…
          </button>
        </div>
      </div>

      <div className="view-switch">
        <button className={view === 'chapters' ? 'active' : ''} onClick={() => onView('chapters')}>
          Chapters
        </button>
        <button className={view === 'characters' ? 'active' : ''} onClick={() => onView('characters')}>
          Characters
        </button>
        <button className={view === 'timeline' ? 'active' : ''} onClick={() => onView('timeline')}>
          Timeline
        </button>
        <button className={view === 'voice' ? 'active' : ''} onClick={() => onView('voice')}>
          Voice
        </button>
      </div>

      {view === 'chapters' && (
        <Organiser
          project={project}
          selected={selected}
          onSelect={onSelect}
          onCreateChapter={onCreateChapter}
          onDeleteChapter={onDeleteChapter}
          onMoveChapter={onMoveChapter}
          onSetTarget={onSetTarget}
        />
      )}
      {view === 'characters' && (
        <CharacterList
          characters={characters}
          selectedId={selectedCharId}
          onSelect={onSelectChar}
          onCreate={onCreateCharacter}
        />
      )}
      {view === 'timeline' && (
        <div className="sidebar-hint muted">
          The timeline spans the whole story. Events can link to any chapter.
        </div>
      )}
      {view === 'voice' && (
        <div className="sidebar-hint muted">
          The voice guide shapes how the AI drafts and reviews prose. Edit it in the main
          panel; saving re-reads the house-style lint rules too.
        </div>
      )}

      <div className="sidebar-foot">
        <span className="foot-label">Appearance</span>
        <ThemeToggle />
      </div>
    </aside>
  )
}
