'use client'

import { FileText, FolderOpen, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { docPreview } from '@/lib/blocks'
import { searchDocs } from '@/lib/projects'
import type { Doc, Project } from '@/lib/types'

/**
 * The bar above a document that belongs to a project.
 *
 * Its whole job is to answer, without anyone having to go looking: what else
 * is in here, and how do I get to it? The sidebar already lists everything,
 * but the sidebar can be collapsed and is off-screen entirely on a phone —
 * and a document inside a project should not have to rely on furniture that
 * might not be there.
 *
 * It only appears when there *is* a project. An ungrouped document gets no
 * bar at all rather than an empty one, because a row of chrome that says
 * nothing is worse than the space it occupies.
 */
export default function ProjectBar({
  project,
  docs,
  currentId,
  onOpen,
  onNew,
  onRename,
}: {
  project: Project
  /** Every document in this project, the current one included. */
  docs: Doc[]
  currentId: string
  onOpen: (id: string) => void
  onNew: () => void
  onRename: (name: string) => void
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const strip = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => searchDocs(docs, query), [docs, query])

  useEffect(() => {
    if (searching) input.current?.focus()
  }, [searching])

  // Cmd/Ctrl+P jumps to a document in this project — the shortcut every editor
  // uses for exactly this.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setSearching(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Keep the open document's chip in view; with more than a few documents it
  // scrolls off, and the one you are reading is the one you need to see.
  useEffect(() => {
    strip.current
      ?.querySelector(`[data-chip="${currentId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentId])

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
      {searching ? (
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <Search size={13} className="shrink-0 text-[var(--color-faint)]" />
            <input
              ref={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearching(false)
                  setQuery('')
                } else if (e.key === 'Enter' && matches[0]) {
                  onOpen(matches[0].id)
                  setSearching(false)
                  setQuery('')
                }
              }}
              placeholder={`Search in ${project.name || 'this project'}`}
              aria-label="Search within this project"
              className="min-w-0 flex-1 bg-transparent py-1 text-xs outline-none placeholder:text-[var(--color-faint)]"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setSearching(false)
                setQuery('')
              }}
              className="shrink-0 rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={13} />
            </button>
          </div>

          {query.trim() && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg">
              {matches.length === 0 ? (
                <p className="px-2 py-2 text-[11px] text-[var(--color-faint)]">
                  Nothing in this project matches “{query}”
                </p>
              ) : (
                matches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onOpen(item.id)
                      setSearching(false)
                      setQuery('')
                    }}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-hover)]"
                  >
                    <FileText size={13} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs">
                        {item.title.trim() || 'Untitled'}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--color-faint)]">
                        {docPreview(item.blocks)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <FolderOpen size={13} className="shrink-0 text-[var(--color-faint)]" />
          <input
            value={project.name}
            onChange={(e) => onRename(e.target.value)}
            aria-label="Project name"
            placeholder="Project"
            // Sized to its content so the name never eats the space the
            // document chips need.
            size={Math.max(4, Math.min(18, (project.name || 'Project').length))}
            className="shrink-0 bg-transparent text-[11px] font-semibold tracking-wide uppercase outline-none placeholder:text-[var(--color-faint)] focus:rounded focus:bg-[var(--color-hover)] focus:px-1"
          />
          <span aria-hidden className="h-3 w-px shrink-0 bg-[var(--color-line)]" />

          <div
            ref={strip}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            // The chips scroll sideways; hiding the bar keeps the row slim.
            style={{ scrollbarWidth: 'none' }}
          >
            {docs.map((item) => (
              <button
                key={item.id}
                type="button"
                data-chip={item.id}
                onClick={() => onOpen(item.id)}
                aria-current={item.id === currentId ? 'page' : undefined}
                className={`shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors ${
                  item.id === currentId
                    ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)]'
                }`}
              >
                {item.title.trim() || 'Untitled'}
              </button>
            ))}
            <button
              type="button"
              onClick={onNew}
              aria-label="New document in this project"
              title="New document in this project"
              className="shrink-0 rounded-md p-1 text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
            >
              <Plus size={13} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSearching(true)}
            aria-label="Search within this project"
            title="Search within this project (Ctrl+P)"
            className="shrink-0 rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <Search size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
