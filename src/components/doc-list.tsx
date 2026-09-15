'use client'

import { ChevronDown, FileText, FolderOpen, GripVertical, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
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
  /** When set, the list is showing search results and grouping is suspended. */
  query: string
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  /** Drop one document onto another with no project: make one holding both. */
  onMerge: (draggedId: string, targetId: string) => void
  /** Move a document into a project, or out of every project with null. */
  onMove: (docId: string, projectId: string | null) => void
  onRenameProject: (id: string, name: string) => void
  onToggleProject: (id: string) => void
  onDeleteProject: (id: string) => void
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
  query,
  onOpen,
  onDelete,
  onMerge,
  onMove,
  onRenameProject,
  onToggleProject,
  onDeleteProject,
}: DocListProps) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)

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

  const beginDrag = (event: React.PointerEvent, id: string) => {
    start.current = { id, x: event.clientX, y: event.clientY, moved: false }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
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
      setDrag({ id: from.id, overDoc: null, overProject: null, overLoose: false })
    }
    const next = resolveTarget(event.clientX, event.clientY, from.id)
    setDrag((d) => (d ? { ...d, ...next } : d))
  }

  const endDrag = () => {
    const from = start.current
    const state = drag
    start.current = null
    setDrag(null)
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

  /** A drag ends with a click event the row would otherwise act on. */
  const swallowClick = (event: React.MouseEvent) => {
    if (start.current?.moved) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const row = (item: Doc, inProject: boolean) => {
    const dragging = drag?.id === item.id
    const isTarget = drag?.overDoc === item.id
    return (
      <div
        key={item.id}
        data-doc-id={item.id}
        className={`group/doc flex items-center gap-1 rounded-md transition-colors ${
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
          onClick={(e) => {
            swallowClick(e)
            if (!start.current?.moved) onOpen(item.id)
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
        <button
          type="button"
          aria-label={`Delete ${item.title.trim() || 'Untitled'}`}
          onClick={() => onDelete(item.id)}
          className="mr-1 p-1 text-[var(--color-faint)] opacity-0 transition-opacity group-focus-within/doc:opacity-100 group-hover/doc:opacity-100 hover:text-[var(--color-danger)]"
        >
          <Trash2 size={12} />
        </button>
      </div>
    )
  }

  // While searching, projects are set aside and every match is shown flat.
  // Someone searching is looking for a document, not for where it is filed.
  if (query.trim()) {
    return (
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {docs.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-[var(--color-faint)]">Nothing found</p>
        ) : (
          docs.map((item) => row(item, false))
        )}
      </nav>
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
