'use client'

import { ArrowRight, Clock, FolderOpen, Library, Plus, Search, Star, X } from 'lucide-react'
import { docLabel, docPreview } from '@/lib/blocks'
import { blockText, type Doc, type Project } from '@/lib/types'
import TrashSection from './trash-section'

/**
 * The home screen: the whole window, and four things in it.
 *
 * The document being written, large. The others in its folder, small. What was
 * open recently. What has been starred. That is the list, and the discipline
 * is in what is not on it — there is no tree, no tag cloud, no activity feed
 * and no counts of anything. A place you pass through on the way back to
 * writing should be readable in one look, and a screen with nine sections on
 * it is read in none.
 *
 * It is not what the app opens into. Opening straight into a document, with
 * the caret already in it, is the oldest promise this app makes, and a home
 * screen in front of that would be one press between somebody and their first
 * sentence. This is the way *back* — reached deliberately, filling the window
 * when it is, gone again the moment something is opened.
 */
export interface HomeScreenProps {
  open: boolean
  onClose: () => void
  docs: Doc[]
  projects: Project[]
  current: Doc | null
  /** The folder the open document is in, if any. */
  currentProject: Project | null
  trashed: Doc[]
  onOpen: (id: string) => void
  onNew: () => void
  onSearch: () => void
  onLibrary: () => void
  onFavorite: (id: string, favorite: boolean) => void
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onEmptyTrash: () => void
}

/** Lines of the document shown on the large card. Enough to recognise it by. */
const PREVIEW_LINES = 6
/** How many recent documents to show. Past this, the answer is search. */
const RECENT = 12

/** The opening of a document, as lines, for the large card. */
function opening(doc: Doc): string[] {
  const lines: string[] = []
  for (const block of doc.blocks) {
    const text = blockText(block).trim()
    if (text) lines.push(text)
    if (lines.length >= PREVIEW_LINES) break
  }
  return lines
}

/** "3 minutes ago", "yesterday" — relative, because that is how memory works. */
function when(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function HomeScreen({
  open,
  onClose,
  docs,
  projects,
  current,
  currentProject,
  trashed,
  onOpen,
  onNew,
  onSearch,
  onLibrary,
  onFavorite,
  onRestore,
  onPurge,
  onEmptyTrash,
}: HomeScreenProps) {
  if (!open) return null

  const live = docs.filter((doc) => !doc.deletedAt)
  const folder = currentProject
    ? live.filter((doc) => doc.projectId === currentProject.id && doc.id !== current?.id)
    : []
  const favorites = live
    .filter((doc) => doc.favoritedAt && !folder.some((f) => f.id === doc.id))
    .sort((a, b) => (b.favoritedAt ?? 0) - (a.favoritedAt ?? 0))
  // Each document appears once, in the highest shelf it qualifies for: the
  // same four cards repeated under three headings is a longer screen saying
  // less, which is the thing this screen exists to stop.
  const above = new Set([current?.id, ...folder.map((d) => d.id), ...favorites.map((d) => d.id)])
  const recent = live.filter((doc) => !above.has(doc.id)).slice(0, RECENT)

  return (
    <div
      role="dialog"
      aria-label="Home"
      aria-modal="true"
      className="pad-desk fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-accent)] text-[13px] font-bold text-white">
            P
          </span>
          <h1 className="text-[17px] font-semibold">Pad</h1>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <HeaderButton icon={<Search size={15} />} label="Search" onClick={onSearch} />
            <HeaderButton icon={<Library size={15} />} label="Library" onClick={onLibrary} />
            <button
              type="button"
              onClick={onNew}
              className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[14px] font-medium text-white hover:opacity-90"
            >
              <Plus size={15} /> New
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to the document"
              title="Back to the document"
              className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/*
          The document being worked on, at the size its importance deserves.
          Everything else on this screen is a thumbnail; this is the thing you
          came back for, so it gets to be a page rather than a row.
        */}
        {current && (
          <section className="mb-8">
            <p className="mb-1.5 text-[13px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
              Carry on with
            </p>
            <button
              type="button"
              onClick={() => onOpen(current.id)}
              className="pad-page group block w-full p-5 text-left transition-shadow hover:shadow-lg sm:p-7"
            >
              <span className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[22px] font-semibold tracking-tight sm:text-[26px]">
                    {docLabel(current)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--color-faint)]">
                    <Clock size={12} /> Edited {when(current.updatedAt)}
                    {currentProject && (
                      <>
                        <span aria-hidden>·</span>
                        <FolderOpen size={12} /> {currentProject.name}
                      </>
                    )}
                  </span>
                </span>
                <span className="mt-1 shrink-0 text-[var(--color-faint)] transition-colors group-hover:text-[var(--color-accent)]">
                  <ArrowRight size={20} />
                </span>
              </span>
              <span className="mt-4 block space-y-1 border-t border-[var(--color-line)] pt-4">
                {opening(current).length ? (
                  opening(current).map((line, i) => (
                    <span
                      key={i}
                      className="block truncate text-[15px] leading-relaxed text-[var(--color-muted)]"
                    >
                      {line}
                    </span>
                  ))
                ) : (
                  <span className="block text-[15px] text-[var(--color-faint)]">
                    Nothing written yet — the caret is waiting.
                  </span>
                )}
              </span>
            </button>
          </section>
        )}

        {folder.length > 0 && currentProject && (
          <Shelf
            icon={<FolderOpen size={14} />}
            label={`Also in ${currentProject.name}`}
            docs={folder}
            onOpen={onOpen}
            onFavorite={onFavorite}
          />
        )}

        {favorites.length > 0 && (
          <Shelf
            icon={<Star size={14} />}
            label="Favourites"
            docs={favorites}
            onOpen={onOpen}
            onFavorite={onFavorite}
          />
        )}

        <Shelf
          icon={<Clock size={14} />}
          label="Recent"
          docs={recent}
          onOpen={onOpen}
          onFavorite={onFavorite}
          empty="Everything you write shows up here."
        />

        {/*
          The trash lives here rather than pinned to the bottom of the sidebar,
          where "delete for good" sat one row below the document somebody was
          working in. Same component, same behaviour, somewhere you go on
          purpose.
        */}
        {trashed.length > 0 && (
          <section className="mt-8 border-t border-[var(--color-line)] pt-3">
            <TrashSection
              docs={trashed}
              onRestore={onRestore}
              onPurge={onPurge}
              onEmpty={onEmptyTrash}
            />
          </section>
        )}

        {projects.length > 0 && (
          <p className="mt-8 text-[13px] text-[var(--color-faint)]">
            Every document you have, including the ones not shown here, is in the Library.
          </p>
        )}
      </div>
    </div>
  )
}

function HeaderButton({
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
      className="flex items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
    >
      {icon}
      {label}
    </button>
  )
}

/** A row of small cards: one shelf per thing this screen is allowed to show. */
function Shelf({
  icon,
  label,
  docs,
  onOpen,
  onFavorite,
  empty,
}: {
  icon: React.ReactNode
  label: string
  docs: Doc[]
  onOpen: (id: string) => void
  onFavorite: (id: string, favorite: boolean) => void
  empty?: string
}) {
  return (
    <section className="mb-7">
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
        {icon}
        {label}
      </p>
      {docs.length === 0 ? (
        <p className="text-[14px] text-[var(--color-faint)]">{empty}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => {
            const starred = !!doc.favoritedAt
            return (
              <li key={doc.id} className="group/card relative">
                <button
                  type="button"
                  onClick={() => onOpen(doc.id)}
                  className="pad-page block h-full w-full p-3 text-left transition-shadow hover:shadow-md"
                >
                  <span className="block truncate pr-6 text-[15px] font-medium">
                    {docLabel(doc)}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-[var(--color-muted)]">
                    {docPreview(doc.blocks)}
                  </span>
                  <span className="mt-1.5 block text-[12px] text-[var(--color-faint)]">
                    {when(doc.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={
                    starred
                      ? `Remove ${docLabel(doc)} from favourites`
                      : `Add ${docLabel(doc)} to favourites`
                  }
                  aria-pressed={starred}
                  onClick={() => onFavorite(doc.id, !starred)}
                  className={`absolute top-2.5 right-2.5 rounded p-1 transition-opacity ${
                    starred
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-faint)] opacity-0 group-hover/card:opacity-100 focus:opacity-100'
                  }`}
                >
                  <Star size={13} fill={starred ? 'currentColor' : 'none'} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
