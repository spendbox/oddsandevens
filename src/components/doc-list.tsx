'use client'

import { ChevronDown, MoreHorizontal, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { docLabel, docPreview } from '@/lib/blocks'
import type { Doc, Project } from '@/lib/types'
import DocIcon from './doc-icon'
import FolderChoices from './folder-choices'

/**
 * The sidebar list.
 *
 * ## What is not here any more, and why
 *
 * This used to be a tree: every project, expandable, with every document
 * inside it, a trash section underneath, a drag target on each row, and two
 * view toggles along the bottom. All of it worked and none of it was the
 * point. What somebody needs while writing is a way back to the three or four
 * documents they are actually moving between — not a map of everything they
 * have ever written, redrawn down the left-hand side of the page they are
 * trying to read.
 *
 * So there are three lists and nothing else: what is in this document's folder,
 * what has been starred, and what was open recently. Everything that has gone
 * still exists — the whole collection is in the Library, the trash is on the
 * home screen, and a project is still one press away in a row's own menu.
 * The rule was to take things off this surface, not out of the app.
 */
export interface DocListProps {
  docs: Doc[]
  projects: Project[]
  currentId: string | null
  /** The project the open document is in, if any. Names the first section. */
  currentProject: Project | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onFavorite: (id: string, favorite: boolean) => void
  /** Move a document into a project, or out of every project with null. */
  onMove: (docId: string, projectId: string | null) => void
  /** Puts a document into a brand new project of its own. */
  onNewProject: (docId: string) => void
}

/**
 * How many recent documents the sidebar shows before it has to be asked.
 *
 * Five is about what somebody is actually moving between in an afternoon. A
 * dozen filled the column and turned a short list back into the long one this
 * was cut down from — and the rest are one press, or one search, away.
 */
const RECENT = 5

export default function DocList({
  docs,
  projects,
  currentId,
  currentProject,
  onOpen,
  onDelete,
  onFavorite,
  onMove,
  onNewProject,
}: DocListProps) {
  /** Which row has its menu open. */
  const [menuFor, setMenuFor] = useState<string | null>(null)
  /** Whether Recent has been asked for the rest of itself. */
  const [allRecent, setAllRecent] = useState(false)

  useEffect(() => {
    if (!menuFor) return
    /**
     * Closes on a press outside the menu.
     *
     * The test is where the press landed, not whether the menu stopped the
     * event bubbling. Relying on stopPropagation closed the menu on
     * pointerdown and unmounted the button before its click could fire, so
     * every item in it did nothing at all.
     */
    const close = (event: Event) => {
      const target = event.target as Element | null
      if (target?.closest?.('[role="menu"]')) return
      setMenuFor(null)
    }
    // A scroll closes it too: the menu is positioned against the row, and the
    // row moves out from under it.
    document.addEventListener('pointerdown', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [menuFor])

  const live = docs.filter((doc) => !doc.deletedAt)
  const folder = currentProject
    ? live.filter((doc) => doc.projectId === currentProject.id)
    : []
  const favorites = live
    .filter((doc) => doc.favoritedAt && !folder.some((f) => f.id === doc.id))
    .sort((a, b) => (b.favoritedAt ?? 0) - (a.favoritedAt ?? 0))
  /*
    Each document appears once, in the highest section it qualifies for.

    Not only tidiness. A row carries a menu, and the same document in two
    sections opened two menus on top of each other — the second sitting over
    the first, so the items in it could not be pressed at all. One row, one
    menu; and a sidebar that shows nine documents rather than the same four
    three times over is also the shorter one, which was the point.
  */
  const above = new Set([...folder, ...favorites].map((doc) => doc.id))
  // Already sorted by recency upstream; only the length is decided here.
  const rest = live.filter((doc) => !above.has(doc.id))
  const recent = allRecent ? rest : rest.slice(0, RECENT)

  const row = (item: Doc) => {
    const starred = !!item.favoritedAt
    return (
      <div
        key={item.id}
        data-doc-id={item.id}
        className={`group/doc relative flex items-center gap-1 rounded-md transition-colors ${
          currentId === item.id
            ? 'bg-[var(--color-accent-soft)]'
            : 'hover:bg-[var(--color-hover)]'
        }`}
      >
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-1 pl-2 text-left"
        >
          <DocIcon doc={item} size={15} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium">{docLabel(item)}</span>
            <span className="block truncate text-[13px] text-[var(--color-faint)]">
              {docPreview(item.blocks)}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={starred ? `Remove ${docLabel(item)} from favourites` : `Add ${docLabel(item)} to favourites`}
          aria-pressed={starred}
          onClick={() => onFavorite(item.id, !starred)}
          className={`shrink-0 rounded p-1 transition-opacity hover:text-[var(--color-ink)] ${
            starred
              ? 'text-[var(--color-accent)]'
              : 'text-[var(--color-faint)] opacity-0 group-focus-within/doc:opacity-100 group-hover/doc:opacity-100'
          }`}
        >
          <Star size={13} fill={starred ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          aria-label={`Actions for ${docLabel(item)}`}
          aria-expanded={menuFor === item.id}
          onClick={() => setMenuFor(menuFor === item.id ? null : item.id)}
          className="mr-1 shrink-0 rounded p-1 text-[var(--color-faint)] opacity-60 transition-opacity group-focus-within/doc:opacity-100 group-hover/doc:opacity-100 hover:text-[var(--color-ink)] sm:opacity-0"
        >
          <MoreHorizontal size={14} />
        </button>

        {menuFor === item.id && (
          <div
            role="menu"
            className="absolute right-2 z-50 mt-1 w-56 translate-y-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg"
          >
            <FolderChoices
              heading="Move to"
              projects={projects}
              currentId={item.projectId}
              onMove={(projectId) => {
                onMove(item.id, projectId)
                setMenuFor(null)
              }}
              onNewFolder={() => {
                onNewProject(item.id)
                setMenuFor(null)
              }}
            />
            <div className="my-1 h-px bg-[var(--color-line)]" />
            <MenuRow
              icon={<Trash2 size={14} />}
              label="Delete"
              danger
              onClick={() => {
                onDelete(item.id)
                setMenuFor(null)
              }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {/*
        The folder first, because it is the only one of the three that is about
        the document currently open — the others are about the collection.
      */}
      {folder.length > 1 && (
        <Section label={currentProject?.name || 'This folder'}>{folder.map(row)}</Section>
      )}

      {favorites.length > 0 && <Section label="Favourites">{favorites.map(row)}</Section>}

      <Section label="Recent">
        {recent.length ? (
          recent.map(row)
        ) : (
          <p className="px-2 py-2 text-[13px] text-[var(--color-faint)]">Nothing here yet</p>
        )}
        {rest.length > RECENT && (
          <button
            type="button"
            onClick={() => setAllRecent((all) => !all)}
            aria-expanded={allRecent}
            className="mt-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <ChevronDown
              size={13}
              className={`shrink-0 transition-transform ${allRecent ? '' : '-rotate-90'}`}
            />
            {allRecent ? 'Show fewer' : `Show ${rest.length - RECENT} more`}
          </button>
        )}
      </Section>
    </nav>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="truncate px-2 pt-2 pb-1 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
        {label}
      </p>
      {children}
    </div>
  )
}

function MenuRow({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-[var(--color-hover)] ${
        danger ? 'text-[var(--color-danger)]' : ''
      }`}
    >
      <span className={`shrink-0 ${danger ? '' : 'text-[var(--color-muted)]'}`}>{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}
