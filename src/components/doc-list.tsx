'use client'

import { ChevronDown, GripVertical, MoreHorizontal, Star, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
  /** Drop one document onto another with no folder: make one holding both. */
  onMerge: (draggedId: string, targetId: string) => void
}

/** How far a pointer must travel before this counts as a drag and not a tap. */
const DRAG_THRESHOLD = 6

interface DragState {
  id: string
  /** The document row being hovered, if any. */
  overDoc: string | null
  /** The folder heading being hovered, if any. */
  overFolder: string | null
}

/** Where the folded sections are remembered. */
const SHUT_KEY = 'pad-sidebar-sections'

/**
 * Which sections are folded, read from outside React.
 *
 * Through `useSyncExternalStore` rather than a lazy `useState` that reads
 * localStorage, because this component is rendered on the server too: the
 * server has no localStorage, so a lazy initial state disagreed with the first
 * client render and React threw a hydration error on every load for anyone who
 * had ever folded a section. The same tool, and the same reason, as the theme
 * in lib/ui-prefs.ts.
 *
 * The snapshot is the raw string, because `useSyncExternalStore` compares
 * snapshots by identity and a freshly parsed Set is a new object every time —
 * which is an infinite render loop rather than a stale value.
 */
const shutListeners = new Set<() => void>()

function subscribeShut(listener: () => void) {
  shutListeners.add(listener)
  return () => {
    shutListeners.delete(listener)
  }
}

function readShut(): string {
  try {
    return localStorage.getItem(SHUT_KEY) ?? ''
  } catch {
    // Blocked site data, a private window. A sidebar that always opens is a
    // much smaller problem than one that throws on load.
    return ''
  }
}

function writeShut(value: string) {
  try {
    localStorage.setItem(SHUT_KEY, value)
  } catch {
    // It costs the memory of a fold, not the fold itself.
  }
  for (const listener of shutListeners) listener()
}
/** The drop target that means "out of every folder". */
const LOOSE = '__loose__'

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
  onMerge,
}: DocListProps) {
  /** Which row has its menu open. */
  const [menuFor, setMenuFor] = useState<string | null>(null)
  /** Whether Recent has been asked for the rest of itself. */
  const [allRecent, setAllRecent] = useState(false)
  /**
   * Which sections are folded away.
   *
   * Remembered on this device rather than in a document, because it is about
   * this screen — the same reason the theme and the width live there.
   * Everything starts open: a sidebar that opens empty is a sidebar nobody can
   * use without first working out that it folds.
   */
  const rawShut = useSyncExternalStore(subscribeShut, readShut, () => '')
  const shut = useMemo<Set<string>>(() => {
    if (!rawShut) return new Set()
    try {
      return new Set(JSON.parse(rawShut) as string[])
    } catch {
      return new Set()
    }
  }, [rawShut])

  const toggleSection = (key: string) => {
    const next = new Set(shut)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    writeShut(JSON.stringify([...next]))
  }

  /**
   * Dragging one row onto another, which is how a folder gets made.
   *
   * Pointer events rather than HTML5 drag-and-drop, because `dragstart` never
   * fires on a touch screen. The pointer is captured only once it has actually
   * travelled far enough to be a drag — capturing on pointerdown retargets the
   * `click` that follows to the capturing element, which silently kills every
   * button inside the row.
   */
  const [drag, setDrag] = useState<DragState | null>(null)
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)
  /** Set for one tick after a real drag, so the click that follows is ignored. */
  const justDragged = useRef(false)

  const beginDrag = (event: React.PointerEvent, id: string) => {
    start.current = { id, x: event.clientX, y: event.clientY, moved: false }
  }

  const moveDrag = (event: React.PointerEvent) => {
    const from = start.current
    if (!from) return
    if (!from.moved) {
      const far =
        Math.abs(event.clientX - from.x) > DRAG_THRESHOLD ||
        Math.abs(event.clientY - from.y) > DRAG_THRESHOLD
      if (!far) return
      from.moved = true
      try {
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      } catch {
        // A pointer already released cannot be captured; the drag then runs on
        // bubbling events instead, which is no worse.
      }
      setDrag({ id: from.id, overDoc: null, overFolder: null })
    }
    const under = document.elementFromPoint(event.clientX, event.clientY)
    const overDoc = under?.closest<HTMLElement>('[data-doc-id]')?.dataset.docId ?? null
    const overFolder = under?.closest<HTMLElement>('[data-folder-id]')?.dataset.folderId ?? null
    setDrag((current) =>
      current
        ? {
            ...current,
            overDoc: overDoc && overDoc !== from.id ? overDoc : null,
            overFolder,
          }
        : current,
    )
  }

  const endDrag = () => {
    const from = start.current
    const state = drag
    start.current = null
    setDrag(null)
    if (from?.moved) {
      justDragged.current = true
      setTimeout(() => {
        justDragged.current = false
      }, 0)
    }
    if (!from?.moved || !state) return

    if (state.overFolder) {
      onMove(state.id, state.overFolder === LOOSE ? null : state.overFolder)
      return
    }
    if (state.overDoc) {
      const target = docs.find((d) => d.id === state.overDoc)
      if (!target) return
      // Dropping onto a document already in a folder joins that folder;
      // dropping onto a loose one makes a folder holding both.
      if (target.projectId) onMove(state.id, target.projectId)
      else onMerge(state.id, target.id)
    }
  }

  /** True when this click is the tail of a drag and should be ignored. */
  const fromDrag = () => justDragged.current || !!start.current?.moved

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
    const dragging = drag?.id === item.id
    const isTarget = drag?.overDoc === item.id
    return (
      <div
        key={item.id}
        data-doc-id={item.id}
        className={`group/doc relative flex items-center gap-1 rounded-md transition-colors ${
          currentId === item.id
            ? 'bg-[var(--color-accent-soft)]'
            : 'hover:bg-[var(--color-hover)]'
        } ${dragging ? 'opacity-40' : ''} ${
          // A ring rather than a line: the drop makes a container, and a ring
          // is what "these two become one thing" looks like.
          isTarget ? 'ring-2 ring-[var(--color-accent)] ring-inset' : ''
        }`}
        onPointerDown={(e) => {
          // Touch is left to scroll the list; on a touch screen the grip is
          // the way to drag, and the row menu does everything a drag does.
          if (e.pointerType === 'touch') return
          beginDrag(e, item.id)
        }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          start.current = null
          setDrag(null)
        }}
      >
        <span
          aria-hidden
          title="Drag onto another document to put them in a folder"
          className="ml-0.5 hidden shrink-0 cursor-grab touch-none text-[var(--color-faint)] opacity-0 group-hover/doc:opacity-100 sm:block"
          onPointerDown={(e) => {
            e.stopPropagation()
            beginDrag(e, item.id)
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          <GripVertical size={12} />
        </span>
        <button
          type="button"
          onClick={() => {
            if (!fromDrag()) onOpen(item.id)
          }}
          className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-1 pl-1 text-left"
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (!fromDrag()) onFavorite(item.id, !starred)
          }}
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (!fromDrag()) setMenuFor(menuFor === item.id ? null : item.id)
          }}
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
      {folder.length > 1 && currentProject && (
        <Section
          id="folder"
          label={currentProject.name || 'This folder'}
          count={folder.length}
          dropId={currentProject.id}
          drag={drag}
          shut={shut.has('folder')}
          onToggle={toggleSection}
        >
          {folder.map(row)}
        </Section>
      )}

      {favorites.length > 0 && (
        <Section
          id="favourites"
          label="Favourites"
          count={favorites.length}
          drag={drag}
          shut={shut.has('favourites')}
          onToggle={toggleSection}
        >
          {favorites.map(row)}
        </Section>
      )}

      <Section
        id="recent"
        label="Recent"
        count={rest.length}
        // Dropping onto Recent takes a document out of its folder, which is
        // the gesture that undoes a merge.
        dropId={LOOSE}
        drag={drag}
        shut={shut.has('recent')}
        onToggle={toggleSection}
      >
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

/**
 * One folding section of the sidebar.
 *
 * The heading is also a drop target, which is what lets a drag put a document
 * into this document's folder, or — on Recent — take it out of the one it is
 * in. A section that is folded away still accepts a drop: reaching a folder
 * should not mean opening it first.
 */
function Section({
  id,
  label,
  count,
  dropId,
  drag,
  shut,
  onToggle,
  children,
}: {
  id: string
  label: string
  count: number
  /** What a drop onto this heading means, or nothing when it means nothing. */
  dropId?: string
  drag: DragState | null
  shut: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  const isTarget = !!dropId && drag?.overFolder === dropId
  return (
    <div className="mb-2">
      <button
        type="button"
        aria-expanded={!shut}
        onClick={() => onToggle(id)}
        {...(dropId ? { 'data-folder-id': dropId } : {})}
        className={`flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--color-hover)] ${
          isTarget ? 'ring-2 ring-[var(--color-accent)] ring-inset' : ''
        }`}
      >
        <ChevronDown
          size={13}
          className={`shrink-0 text-[var(--color-faint)] transition-transform ${
            shut ? '-rotate-90' : ''
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
          {label}
        </span>
        <span className="shrink-0 text-[12px] text-[var(--color-faint)]">{count}</span>
      </button>
      {!shut && children}
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
