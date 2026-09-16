'use client'

import {
  ChevronDown,
  FileText,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LogOut,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { docPreview } from '@/lib/blocks'
import { groupDocs } from '@/lib/projects'
import type { Doc, Project } from '@/lib/types'

/**
 * The sidebar list: documents, and the projects that group them.
 *
 * Projects are made by dragging one document onto another — the same gesture
 * as putting two pieces of paper in one folder. There is no "New project"
 * button, because a project with nothing in it is not a thing anyone wants;
 * every project here begins life with two documents already inside it.
 *
 * Dragging uses pointer events rather than HTML5 drag-and-drop, for the same
 * reason as the block handles: dragstart never fires on a touch screen.
 */
export interface DocListProps {
  docs: Doc[]
  projects: Project[]
  currentId: string | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  /** Drop one document onto another with no project: make one holding both. */
  onMerge: (draggedId: string, targetId: string) => void
  /** Move a document into a project, or out of every project with null. */
  onMove: (docId: string, projectId: string | null) => void
  onRenameProject: (id: string, name: string) => void
  onToggleProject: (id: string) => void
  onDeleteProject: (id: string) => void
  /** Puts a document into a brand new project of its own. */
  onNewProject: (docId: string) => void
}

/** How far a pointer must travel before this counts as a drag and not a tap. */
const DRAG_THRESHOLD = 6

interface DragState {
  id: string
  /** The document row being hovered, if any. */
  overDoc: string | null
  /** The project being hovered, if any. */
  overProject: string | null
  /** True when hovering the ungrouped area, which means "take it out". */
  overLoose: boolean
}

export default function DocList({
  docs,
  projects,
  currentId,
  onOpen,
  onDelete,
  onMerge,
  onMove,
  onRenameProject,
  onToggleProject,
  onDeleteProject,
  onNewProject,
}: DocListProps) {
  const [drag, setDrag] = useState<DragState | null>(null)
  /** Which row has its menu open. Dragging is not the only way to group. */
  const [menuFor, setMenuFor] = useState<string | null>(null)

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
  const start = useRef<{
    id: string
    x: number
    y: number
    moved: boolean
    pointerId: number
  } | null>(null)

  const grouped = groupDocs(docs, projects)

  /** Works out what is under the pointer, and therefore what a drop would do. */
  const resolveTarget = (x: number, y: number, draggedId: string): Partial<DragState> => {
    const el = document.elementFromPoint(x, y)
    const docRow = el?.closest<HTMLElement>('[data-doc-id]')
    const projectRow = el?.closest<HTMLElement>('[data-project-id]')
    const loose = el?.closest<HTMLElement>('[data-loose-zone]')

    const overDoc = docRow?.dataset.docId ?? null
    return {
      // A document cannot be dropped onto itself.
      overDoc: overDoc && overDoc !== draggedId ? overDoc : null,
      overProject: projectRow?.dataset.projectId ?? null,
      overLoose: !!loose && !projectRow && !docRow,
    }
  }

  /**
   * Note what was pressed, but do NOT capture the pointer yet.
   *
   * Capturing on pointerdown retargets the whole gesture — including the
   * `click` that follows — to the capturing element. That is what stopped
   * every button inside a row from working: the click was delivered to the
   * row, so neither "open this document" nor the delete button ever fired.
   * Capture is therefore deferred until the pointer has actually travelled
   * far enough to be a drag, by which point there will be no click to lose.
   */
  const beginDrag = (event: React.PointerEvent, id: string) => {
    start.current = { id, x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId }
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
      // Now it is a drag, so take the pointer: the row must keep receiving
      // moves even when the cursor leaves it.
      try {
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      } catch {
        // A pointer that has already been released cannot be captured. The
        // drag simply ends up driven by bubbling events instead.
      }
      setDrag({ id: from.id, overDoc: null, overProject: null, overLoose: false })
    }
    const next = resolveTarget(event.clientX, event.clientY, from.id)
    setDrag((d) => (d ? { ...d, ...next } : d))
  }

  /**
   * Set for one tick after a real drag, so the click that follows is ignored.
   * Without it, dragging a document would also open it on release.
   */
  const justDragged = useRef(false)

  const endDrag = () => {
    const from = start.current
    const state = drag
    start.current = null
    setDrag(null)
    if (from?.moved) {
      justDragged.current = true
      // Cleared after the click event that follows this pointerup.
      setTimeout(() => {
        justDragged.current = false
      }, 0)
    }
    if (!from?.moved || !state) return

    const dragged = docs.find((d) => d.id === state.id)
    if (!dragged) return

    if (state.overProject) {
      onMove(state.id, state.overProject)
      return
    }
    if (state.overDoc) {
      const target = docs.find((d) => d.id === state.overDoc)
      if (!target) return
      // Dropping onto a document already in a project joins that project;
      // dropping onto a loose one creates a project holding both.
      if (target.projectId) onMove(state.id, target.projectId)
      else onMerge(state.id, target.id)
      return
    }
    if (state.overLoose && dragged.projectId) onMove(state.id, null)
  }

  /** True when this click is the tail of a drag and should be ignored. */
  const fromDrag = () => justDragged.current || !!start.current?.moved

  const row = (item: Doc, inProject: boolean) => {
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
        } ${inProject ? 'ml-3' : ''}`}
        onPointerDown={(e) => {
          // Touch is left alone here so the list can still be scrolled with a
          // thumb; on touch the grip below is the way to drag.
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
          title="Drag onto another document to group them"
          className="ml-1 hidden shrink-0 cursor-grab touch-none text-[var(--color-faint)] opacity-0 group-hover/doc:opacity-100 sm:block"
          onPointerDown={(e) => {
            e.stopPropagation()
            beginDrag(e, item.id)
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        >
          <GripVertical size={11} />
        </span>
        <button
          type="button"
          onClick={() => {
            if (!fromDrag()) onOpen(item.id)
          }}
          className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-2 pl-1 text-left"
        >
          <FileText size={13} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">
              {item.title.trim() || 'Untitled'}
            </span>
            <span className="block truncate text-[11px] text-[var(--color-faint)]">
              {docPreview(item.blocks)}
            </span>
          </span>
        </button>
        {/*
          Grouping has to be reachable without a drag. A drag is a fine gesture
          with a mouse and a poor one with a thumb — on a touch screen the same
          movement is how the list is scrolled — so every project action also
          lives in this menu. It is always visible on a phone.
        */}
        <button
          type="button"
          aria-label={`Actions for ${item.title.trim() || 'Untitled'}`}
          aria-expanded={menuFor === item.id}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (!fromDrag()) setMenuFor(menuFor === item.id ? null : item.id)
          }}
          className="shrink-0 rounded p-1 text-[var(--color-faint)] opacity-60 transition-opacity group-focus-within/doc:opacity-100 group-hover/doc:opacity-100 hover:text-[var(--color-ink)] sm:opacity-0"
        >
          <MoreHorizontal size={13} />
        </button>
        <button
          type="button"
          aria-label={`Delete ${item.title.trim() || 'Untitled'}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (!fromDrag()) onDelete(item.id)
          }}
          className="mr-1 shrink-0 rounded p-1 text-[var(--color-faint)] opacity-60 transition-opacity group-focus-within/doc:opacity-100 group-hover/doc:opacity-100 hover:text-[var(--color-danger)] sm:opacity-0"
        >
          <Trash2 size={12} />
        </button>

        {menuFor === item.id && (
          <div
            role="menu"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-2 z-50 mt-1 w-52 translate-y-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg"
          >
            <p className="px-2.5 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
              Project
            </p>
            {projects
              .filter((p) => !p.deletedAt && p.id !== item.projectId)
              .map((project) => (
                <MenuRow
                  key={project.id}
                  icon={<FolderOpen size={13} />}
                  label={project.name || 'Untitled project'}
                  onClick={() => {
                    onMove(item.id, project.id)
                    setMenuFor(null)
                  }}
                />
              ))}
            <MenuRow
              icon={<FolderPlus size={13} />}
              label="New project…"
              onClick={() => {
                onNewProject(item.id)
                setMenuFor(null)
              }}
            />
            {item.projectId && (
              <MenuRow
                icon={<LogOut size={13} />}
                label="Remove from project"
                onClick={() => {
                  onMove(item.id, null)
                  setMenuFor(null)
                }}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {grouped.projects.length === 0 && grouped.loose.length === 0 && (
        <p className="px-2 py-3 text-[11px] text-[var(--color-faint)]">No documents yet</p>
      )}

      {grouped.projects.map(({ project, docs: members }) => {
        const isTarget = drag?.overProject === project.id
        return (
          <div key={project.id} className="mb-1">
            <div
              data-project-id={project.id}
              className={`group/project flex items-center gap-0.5 rounded-md px-1 py-1 transition-colors ${
                isTarget ? 'ring-2 ring-[var(--color-accent)] ring-inset' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleProject(project.id)}
                aria-expanded={!project.collapsed}
                aria-label={project.collapsed ? 'Expand project' : 'Collapse project'}
                className="shrink-0 rounded p-0.5 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
              >
                <ChevronDown
                  size={12}
                  className={`transition-transform ${project.collapsed ? '-rotate-90' : ''}`}
                />
              </button>
              <FolderOpen size={12} className="shrink-0 text-[var(--color-faint)]" />
              {/*
                Always an input rather than a label that becomes one. A mode
                switch means a click that renames when you meant to open, and
                one that opens when you meant to rename.
              */}
              <input
                value={project.name}
                onChange={(e) => onRenameProject(project.id, e.target.value)}
                aria-label="Project name"
                placeholder="Project"
                className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-[11px] font-semibold tracking-wide uppercase outline-none placeholder:text-[var(--color-faint)] focus:bg-[var(--color-hover)] focus:rounded"
              />
              <span className="shrink-0 px-1 text-[10px] text-[var(--color-faint)]">
                {members.length}
              </span>
              <button
                type="button"
                aria-label={`Ungroup ${project.name || 'project'}`}
                title="Ungroup — the documents stay"
                onClick={() => onDeleteProject(project.id)}
                className="shrink-0 p-1 text-[var(--color-faint)] opacity-0 transition-opacity group-focus-within/project:opacity-100 group-hover/project:opacity-100 hover:text-[var(--color-danger)]"
              >
                <Trash2 size={11} />
              </button>
            </div>
            {!project.collapsed &&
              (members.length ? (
                members.map((item) => row(item, true))
              ) : (
                <p className="ml-3 px-2 py-1.5 text-[11px] text-[var(--color-faint)]">
                  Empty — drag a document in
                </p>
              ))}
          </div>
        )
      })}

      {/*
        The ungrouped area doubles as the drop target for taking a document
        back out of a project, which is why it keeps a minimum height even
        when it is empty.
      */}
      <div data-loose-zone className="min-h-16 pt-1">
        {grouped.projects.length > 0 && grouped.loose.length > 0 && (
          <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
            Documents
          </p>
        )}
        {grouped.loose.map((item) => row(item, false))}
        {drag && drag.overLoose && (
          <p className="mx-1 mt-1 rounded border border-dashed border-[var(--color-accent)] px-2 py-2 text-[10px] text-[var(--color-accent)]">
            Take out of its project
          </p>
        )}
      </div>
    </nav>
  )
}

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-[var(--color-hover)] sm:py-1.5"
    >
      <span className="shrink-0 text-[var(--color-muted)]">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}
