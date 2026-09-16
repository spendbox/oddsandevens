'use client'

import { CornerDownLeft, FileText, Folder, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildIndex, search, type SearchHit } from '@/lib/search'
import type { Doc, Project } from '@/lib/types'

/**
 * Search over everything, as one panel.
 *
 * The sidebar box filters the list you are looking at; this looks inside every
 * document and ranks what it finds. That is the difference between "which file
 * was it" and "I know I wrote this down somewhere" — and the second is the one
 * that actually happens three months later.
 *
 * Every result carries the passage that matched, with the words picked out, so
 * the answer is often on screen without opening anything.
 */
export interface SearchPanelProps {
  open: boolean
  docs: Doc[]
  projects: Project[]
  onClose: () => void
  onOpen: (id: string) => void
}

/** Shown before anything is typed: what you had open lately. */
const RECENT = 6

export default function SearchPanel({ open, docs, projects, onClose, onOpen }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  /*
    Built once per opening rather than per keystroke. It is linear in the size
    of everything ever written, which is nothing for a few hundred notes and
    very much something for a few thousand — and while this panel is open the
    documents are not being edited, so there is nothing to rebuild for.
  */
  const index = useMemo(() => buildIndex(docs), [docs])

  const hits: SearchHit[] = useMemo(
    () => (query.trim() ? search(index, query, 30) : []),
    [index, query],
  )
  const recent = useMemo(
    () => docs.filter((d) => !d.deletedAt).slice(0, RECENT),
    [docs],
  )
  const rows = query.trim() ? hits.map((hit) => hit.doc) : recent

  // The highlighted row goes back to the top whenever the results change
  // underneath it. Adjusted during render rather than in an effect: an effect
  // paints one frame with the old row highlighted against the new list.
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setActive(0)
  }
  if (active >= rows.length && active !== 0) setActive(0)

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Cleared on close, so reopening starts fresh instead of on an old search.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setQuery('')
  }

  useEffect(() => {
    list.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })

  if (!open) return null

  const choose = (id: string) => {
    onOpen(id)
    onClose()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
    } else if (event.key === 'Enter' && rows[active]) {
      event.preventDefault()
      choose(rows[active].id)
    }
  }

  const projectName = (doc: Doc) =>
    doc.projectId ? (projects.find((p) => p.id === doc.projectId)?.name ?? null) : null

  return (
    <>
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/30"
      />
      <div
        role="dialog"
        aria-label="Search"
        onKeyDown={onKeyDown}
        // Full height on a phone, a floating panel on a desktop. A phone
        // keyboard takes half the screen, and a short panel above it leaves
        // room for about two results.
        className="fixed inset-0 z-50 flex flex-col bg-[var(--color-paper)] sm:inset-x-0 sm:top-[10vh] sm:bottom-auto sm:mx-auto sm:max-h-[70vh] sm:w-[36rem] sm:rounded-xl sm:border sm:border-[var(--color-line)] sm:shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
          <Search size={15} className="shrink-0 text-[var(--color-faint)]" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything you have written"
            aria-label="Search everything"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={15} />
          </button>
        </div>

        <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!query.trim() && (
            <p className="px-2 py-1.5 text-[11px] text-[var(--color-faint)]">Recent</p>
          )}

          {query.trim() && !hits.length && (
            <p className="px-2 py-6 text-center text-xs text-[var(--color-muted)]">
              Nothing matches “{query.trim()}”.
            </p>
          )}

          {rows.map((doc, i) => {
            const hit = query.trim() ? hits[i] : null
            const project = projectName(doc)
            return (
              <button
                key={doc.id}
                type="button"
                data-active={i === active}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(doc.id)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                  i === active ? 'bg-[var(--color-hover)]' : ''
                }`}
              >
                <FileText size={14} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {doc.title.trim() || 'Untitled'}
                    </span>
                    {project && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--color-faint)]">
                        <Folder size={9} /> {project}
                      </span>
                    )}
                  </span>
                  {hit && (
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-muted)]">
                      <Snippet text={hit.snippet} highlights={hit.highlights} />
                    </span>
                  )}
                </span>
                {i === active && (
                  <CornerDownLeft size={12} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

/**
 * A passage with the matched words picked out.
 *
 * Built from offsets rather than by replacing text, because the snippet is
 * somebody's own writing: anything that goes near it with a regular expression
 * and string concatenation is one step away from putting markup into it.
 */
function Snippet({ text, highlights }: { text: string; highlights: Array<[number, number]> }) {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [start, end] of highlights) {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(
      <mark key={start} className="rounded-[3px] bg-[var(--color-accent)]/20 text-inherit">
        {text.slice(start, end)}
      </mark>,
    )
    at = end
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}
