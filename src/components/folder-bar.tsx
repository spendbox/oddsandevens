'use client'

import { Check, ChevronDown, FolderOpen, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { docLabel } from '@/lib/blocks'
import { searchDocs } from '@/lib/projects'
import type { Doc, Project } from '@/lib/types'
import DocIcon from './doc-icon'
import FolderChoices from './folder-choices'

/**
 * Which folder this document is in, as one button in the header.
 *
 * ## Why this is not a row of the folder's other documents
 *
 * It used to be: the folder's name, then every document in it as a chip along
 * a scrolling strip above the page. Two things were wrong with that. It put
 * the *other* documents at the top of the one you were reading, so the first
 * thing on the page was a list of things that were not the page; and a strip
 * of chips is a shape that grows — fine with three documents, a horizontal
 * scrollbar with nine, and never the same width twice.
 *
 * A folder is a place, so it reads as one thing: a button saying where you
 * are, which opens to show what else is in here. Closed it costs a few words
 * in the header; open it holds the whole folder, searchable, with no scrolling
 * strip and no reflow.
 *
 * ## Why moving the document lives in the same menu
 *
 * "What folder am I in" and "put me in a different one" are the same thought
 * half a second apart. Splitting them across two menus is how moving a
 * document ends up being something people do once and never find again.
 */
export interface FolderBarProps {
  project: Project
  /** Every document in this folder, the current one included. */
  docs: Doc[]
  currentId: string
  /** Every folder, so this one can offer the others as destinations. */
  projects: Project[]
  onOpen: (id: string) => void
  onNew: () => void
  onRename: (name: string) => void
  /** Moves the open document. Null takes it out of every folder. */
  onMove: (projectId: string | null) => void
  onNewFolder: () => void
}

export default function FolderBar({
  project,
  docs,
  currentId,
  projects,
  onOpen,
  onNew,
  onRename,
  onMove,
  onNewFolder,
}: FolderBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => searchDocs(docs, query), [docs, query])

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
    // Focused only where there is a keyboard already on screen. On a phone,
    // opening a menu that immediately raises the keyboard hides the menu
    // behind it.
    if (!window.matchMedia('(pointer: fine)').matches) return
    const id = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    /*
      Closed by testing where the press landed, never by stopPropagation:
      relying on propagation unmounts a button before its own click can fire.
      The same note is in doc-list.tsx, where that bug actually happened.
    */
    const close = (event: Event) => {
      const el = event.target as Element | null
      if (el && root.current?.contains(el)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Ctrl+P jumps to a document in this folder — the shortcut every editor uses
  // for exactly this, and the reason the search box is inside the menu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Folder: ${project.name || 'Untitled folder'}`}
        title="Folder (Ctrl+P)"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 max-w-[10rem] items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)] sm:max-w-[16rem]"
      >
        <FolderOpen size={15} className="shrink-0" />
        <span className="min-w-0 truncate">{project.name || 'Untitled folder'}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Folder"
          // Anchored left on a desktop and stretched across a phone, where a
          // 20rem panel hanging off a button is half off the side of the screen.
          className="fixed inset-x-2 top-14 z-50 max-h-[70dvh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-1 sm:w-80"
        >
          <div className="flex items-center gap-1.5 px-1.5 pt-1 pb-1.5">
            {/*
              Always an input, never a label that turns into one. A mode switch
              means a press that renames when you meant to open, and one that
              opens when you meant to rename.
            */}
            <FolderOpen size={15} className="shrink-0 text-[var(--color-faint)]" />
            <input
              value={project.name}
              onChange={(e) => onRename(e.target.value)}
              aria-label="Folder name"
              placeholder="Folder"
              className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[15px] font-medium outline-none placeholder:text-[var(--color-faint)] focus:bg-[var(--color-hover)]"
            />
            <span className="shrink-0 px-1 text-[13px] text-[var(--color-faint)]">
              {docs.length}
            </span>
          </div>

          <div className="mx-1.5 mb-1 flex items-center gap-2 rounded-md bg-[var(--color-hover)] px-2 py-1.5">
            <Search size={14} className="shrink-0 text-[var(--color-faint)]" />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) {
                  onOpen(matches[0].id)
                  setOpen(false)
                }
              }}
              placeholder="Search in this folder"
              aria-label="Search within this project"
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--color-faint)]"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="shrink-0 rounded p-0.5 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {matches.length === 0 ? (
            <p className="px-2.5 py-3 text-[14px] text-[var(--color-faint)]">
              Nothing in this project matches “{query}”
            </p>
          ) : (
            matches.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                data-chip={item.id}
                aria-current={item.id === currentId ? 'page' : undefined}
                onClick={() => {
                  onOpen(item.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left hover:bg-[var(--color-hover)] sm:py-2 ${
                  item.id === currentId ? 'bg-[var(--color-accent-soft)]' : ''
                }`}
              >
                <DocIcon doc={item} size={16} className="shrink-0 text-[var(--color-faint)]" />
                <span className="min-w-0 flex-1 truncate text-[14px]">{docLabel(item)}</span>
                {item.id === currentId && (
                  <Check size={14} className="shrink-0 text-[var(--color-accent)]" />
                )}
              </button>
            ))
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onNew()
              setOpen(false)
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] sm:py-2"
          >
            <Plus size={15} className="shrink-0" />
            New document in this folder
          </button>

          <div className="my-1 h-px bg-[var(--color-line)]" />

          <FolderChoices
            heading="Move this document"
            projects={projects}
            currentId={project.id}
            onMove={(id) => {
              onMove(id)
              setOpen(false)
            }}
            onNewFolder={() => {
              onNewFolder()
              setOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
