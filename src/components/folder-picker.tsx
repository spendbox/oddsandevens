'use client'

import { FolderMinus, FolderOpen, FolderPlus, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Project } from '@/lib/types'

/**
 * "Put this document in…" — one button, and a picker when it is pressed.
 *
 * ## Why it is not a list any more
 *
 * Every menu that offered this used to print every folder inline. With three
 * folders that is a tidy little list; with thirty it is a menu you scroll past
 * to reach Delete, in four different places, and the thing you actually
 * wanted — "move this somewhere" — is buried in its own answer. One row that
 * says what it does, opening a picker that can search, stays the same size
 * whether somebody has three folders or three hundred.
 *
 * ## Why the picker is shared
 *
 * It is opened from the side menu, from the folder button in the header and
 * from a row in the Library. One component, so none of them can quietly stop
 * offering "Take it out of its folder" — the failure that four copies of a
 * list invites.
 *
 * ## Why it is a portal
 *
 * `position: fixed` is relative to the nearest *transformed* ancestor, not to
 * the window, and the side menu carries a transform: it slides in and out as a
 * drawer on a phone, and keeps `translate-x-0` on a desktop. So a picker
 * opened from the side menu was laid out inside a 288-pixel column and hung
 * off the left of the screen with its backdrop covering nothing. Rendering
 * into the body is the fix, and it is the fix wherever this is opened from,
 * which is why it lives here rather than at each caller.
 */
export interface FolderPickerProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  /** The folder the document is in now, so it is not offered as a destination. */
  currentId?: string
  /** Null takes it out of every folder. */
  onMove: (projectId: string | null) => void
  /** Makes a new folder named after this document and puts it inside. */
  onNewFolder: () => void
  /** Named in the title, so a picker opened from a list says which document. */
  label?: string
}

export default function FolderPicker({
  open,
  onClose,
  projects,
  currentId,
  onMove,
  onNewFolder,
  label,
}: FolderPickerProps) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)

  /*
    A new opening never inherits the last one's search. Adjusted during render
    rather than in an effect — the pattern this codebase uses for "a value
    changed, so this state is stale" — because in an effect the previous query
    and its filtered list paint for a frame first.
  */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuery('')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    // Focused only where there is a keyboard already on screen: on a phone,
    // opening a dialog that immediately raises the keyboard hides the dialog.
    const id = window.matchMedia('(pointer: fine)').matches
      ? requestAnimationFrame(() => input.current?.focus())
      : 0
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (id) cancelAnimationFrame(id)
    }
  }, [open, onClose])

  if (!open) return null

  const needle = query.trim().toLowerCase()
  const choices = projects
    .filter((project) => !project.deletedAt && project.id !== currentId)
    .filter((project) => !needle || (project.name || '').toLowerCase().includes(needle))

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default bg-black/30"
      />
      {/*
        Placed by a full-screen flex box rather than by insets on the dialog
        itself. `inset-x-2 … sm:inset-x-auto sm:left-1/2` reads correctly and
        does not work: `inset-x` and `left` set the same property, Tailwind
        emits them in its own order, and the `auto` landed after the `50%`. A
        centring container cannot be overridden by the order of two utilities.
      */}
      <div className="pointer-events-none fixed inset-0 z-[61] flex items-end justify-center p-2 sm:items-start sm:p-0 sm:pt-24">
      <div
        role="dialog"
        aria-label="Move to folder"
        className="pointer-events-auto max-h-[70dvh] w-full overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl sm:w-[26rem]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
          <FolderOpen size={16} className="shrink-0 text-[var(--color-accent)]" />
          <span className="min-w-0 truncate text-[15px] font-medium">
            {label ? `Move “${label}” to…` : 'Move to folder'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* A search box, because this is the control that has to survive
            somebody with thirty folders. */}
        <div className="border-b border-[var(--color-line)] px-3 py-2">
          <div className="flex items-center gap-2 rounded-md bg-[var(--color-hover)] px-2.5 py-1.5">
            <Search size={15} className="shrink-0 text-[var(--color-faint)]" />
            <input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search folders"
              aria-label="Search folders"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-faint)]"
            />
          </div>
        </div>

        <div className="max-h-[46dvh] overflow-y-auto p-1">
          {choices.map((project) => (
            <Row
              key={project.id}
              icon={<FolderOpen size={16} />}
              label={project.name || 'Untitled folder'}
              onClick={() => {
                onMove(project.id)
                onClose()
              }}
            />
          ))}
          {!choices.length && needle && (
            <p className="px-2.5 py-4 text-center text-[14px] text-[var(--color-faint)]">
              No folder matches “{query}”.
            </p>
          )}
          <Row
            icon={<FolderPlus size={16} />}
            label="New folder from this note"
            onClick={() => {
              onNewFolder()
              onClose()
            }}
          />
          {currentId && (
            <Row
              icon={<FolderMinus size={16} />}
              label="Take it out of its folder"
              onClick={() => {
                onMove(null)
                onClose()
              }}
            />
          )}
        </div>
      </div>
      </div>
    </>,
    document.body,
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
      onClick={onClick}
      // Generous vertical padding: this is a list people hit with a thumb as
      // often as with a pointer, and 44px is the size a thumb actually is.
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-[15px] hover:bg-[var(--color-hover)]"
    >
      <span className="shrink-0 text-[var(--color-muted)]">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}
