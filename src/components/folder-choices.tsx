'use client'

import { FolderMinus, FolderOpen, FolderPlus } from 'lucide-react'
import type { Project } from '@/lib/types'

/**
 * "Put this document in…" — the rows, wherever the question is asked.
 *
 * It is asked in four places: a row's menu in the sidebar, the folder button
 * above a document, the document's own ⋯ menu, and a row in the Library. Four
 * copies of the same list is four places for one of them to quietly stop
 * offering "Take it out", so it is written once and the callers supply only
 * the document it is about.
 *
 * Moving a document is the single most common piece of tidying anybody does,
 * and it used to be reachable only by dragging one sidebar row onto another —
 * a gesture that does not exist on a touch screen at all.
 */
export interface FolderChoicesProps {
  projects: Project[]
  /** The folder the document is in now, so it is not offered as a destination. */
  currentId?: string
  /** Null takes it out of every folder. */
  onMove: (projectId: string | null) => void
  /** Makes a new folder named after this document and puts it inside. */
  onNewFolder: () => void
  /** Shown above the rows. Absent inside a menu that already has a heading. */
  heading?: string
}

export default function FolderChoices({
  projects,
  currentId,
  onMove,
  onNewFolder,
  heading,
}: FolderChoicesProps) {
  const elsewhere = projects.filter((p) => !p.deletedAt && p.id !== currentId)

  return (
    <>
      {heading && (
        <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
          {heading}
        </p>
      )}
      {elsewhere.map((project) => (
        <Row
          key={project.id}
          icon={<FolderOpen size={15} />}
          label={project.name || 'Untitled folder'}
          onClick={() => onMove(project.id)}
        />
      ))}
      <Row icon={<FolderPlus size={15} />} label="New folder…" onClick={onNewFolder} />
      {currentId && (
        <Row
          icon={<FolderMinus size={15} />}
          label="Take out of this folder"
          onClick={() => onMove(null)}
        />
      )}
    </>
  )
}

function Row({
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
      // Generous vertical padding: these are menu rows people hit with a thumb
      // as often as with a pointer, and 44px is the size a thumb actually is.
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-[14px] hover:bg-[var(--color-hover)] sm:py-2"
    >
      <span className="shrink-0 text-[var(--color-muted)]">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}
