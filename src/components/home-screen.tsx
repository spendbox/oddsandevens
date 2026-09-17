'use client'

import { FolderOpen, Library, Pencil, Search, Star, X } from 'lucide-react'
import type { Grouping } from '@/lib/library'
import type { PastedBlock } from '@/lib/paste'
import type { Doc, Project } from '@/lib/types'
import DictationButton from './dictation-button'
import LibraryView, { type Incoming } from './library-view'
import NoteRow from './note-row'
import TrashSection from './trash-section'

/**
 * The notes screen: everything written, newest first, in two tabs.
 *
 * ## Notes
 *
 * One column of notes. Each row is a kind, a name, two lines of the note and
 * the time — see note-row.tsx for why it is a row and not a card. The
 * discipline is in what is not on it: no tree, no tag cloud, no activity feed,
 * no counts of anything, and no hero card of the note you were last in. That
 * card was here for a year and it was always the first row of the list printed
 * six times larger, because the note you were last in is by definition the one
 * edited most recently.
 *
 * ## Library
 *
 * The whole collection by folder, and the way new notes come in. Two tabs, and
 * there will go on being two: a tab bar that can grow is a navigation system,
 * and this screen exists because the app had one too many of those.
 *
 * ## Writing from here
 *
 * The bar at the bottom is the only thing on this screen that makes something
 * rather than finding it: a line to start writing, and a recorder for when
 * talking is faster than typing. It is at the bottom because that is where a
 * thumb is, and it is the same pair of controls on a monitor because two
 * layouts for one bar is two things to keep right.
 *
 * This is not what the app opens into. Opening straight into a note, with the
 * caret already in it, is the oldest promise this app makes, and a screen in
 * front of that would be one press between somebody and their first sentence.
 */
export type HomeTab = 'carry' | 'library'

export interface HomeScreenProps {
  open: boolean
  tab: HomeTab
  onTab: (tab: HomeTab) => void
  onClose: () => void
  docs: Doc[]
  projects: Project[]
  current: Doc | null
  /** The folder the open note is in, if any. */
  currentProject: Project | null
  trashed: Doc[]
  onOpen: (id: string) => void
  onNew: () => void
  onSearch: () => void
  onFavorite: (id: string, favorite: boolean) => void
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onEmptyTrash: () => void
  /** A note dictated from this screen, rather than typed into an open one. */
  onRecord: (blocks: PastedBlock[]) => void
  /* The Library tab's own handles. */
  onMove: (docId: string, projectId: string | null) => void
  onNewFolder: (docId: string) => void
  onGroup: (docIds: string[]) => void
  onMerge: (draggedId: string, targetId: string) => void
  onDelete: (docId: string) => void
  onAdd: (items: Incoming[], groups: Grouping[], withSummaries: boolean) => void
  /** Whether the model can improve imported titles and write up a recording. */
  aiReady: boolean
}

/**
 * How many notes this screen lists before pointing at the Library.
 *
 * Not a page size — there is no second page. Past this many, the question has
 * stopped being "which of these was I writing" and become "where is the one
 * about the lease", and that question is answered by search or by the Library,
 * both of which are one press from here.
 */
const LISTED = 25

export default function HomeScreen({
  open,
  tab,
  onTab,
  onClose,
  docs,
  projects,
  current,
  currentProject,
  trashed,
  onOpen,
  onNew,
  onSearch,
  onFavorite,
  onRestore,
  onPurge,
  onEmptyTrash,
  onRecord,
  onMove,
  onNewFolder,
  onGroup,
  onMerge,
  onDelete,
  onAdd,
  aiReady,
}: HomeScreenProps) {
  if (!open) return null

  const live = docs.filter((doc) => !doc.deletedAt)
  const favorites = live
    .filter((doc) => doc.favoritedAt)
    .sort((a, b) => (b.favoritedAt ?? 0) - (a.favoritedAt ?? 0))
  // A note appears in exactly one section. The same note under two headings is
  // a longer screen saying less — and it is two menus opening on top of each
  // other the moment a row carries one.
  const starred = new Set(favorites.map((doc) => doc.id))
  const rest = live.filter((doc) => !starred.has(doc.id)).slice(0, LISTED)

  return (
    <div
      role="dialog"
      aria-label="Notes"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[var(--color-paper)]"
    >
      {/* The bottom padding clears the bar, and a phone's home indicator. */}
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-32 sm:px-8 sm:py-8 sm:pb-32">
        <header className="mb-4 flex items-center gap-2">
          <h1 className="pad-serif text-[30px] font-semibold tracking-tight sm:text-[34px]">
            Notes
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to the note"
              title="Back to the note"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/*
          A field rather than a magnifying glass in a corner.

          It does not type here — pressing it opens the search panel, which
          reads inside every note rather than filtering their names. Showing
          what it searches is the point: "every word in every note" is the
          thing people do not expect a notes app to do, and a 24-pixel icon
          says none of it.
        */}
        <button
          type="button"
          onClick={onSearch}
          className="mb-5 flex w-full items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-4 py-3 text-left text-[15px] text-[var(--color-faint)] hover:border-[var(--color-faint)]"
        >
          <Search size={17} />
          Search every word in every note
        </button>

        <div
          role="tablist"
          aria-label="Notes"
          className="mb-2 flex items-stretch gap-1 border-b border-[var(--color-line)]"
        >
          <Tab id="carry" current={tab} onTab={onTab} icon={<Pencil size={14} />} label="Notes" />
          <Tab
            id="library"
            current={tab}
            onTab={onTab}
            icon={<Library size={14} />}
            label="Library"
          />
        </div>

        {tab === 'library' ? (
          <div className="pt-4">
            <LibraryView
              docs={docs}
              projects={projects}
              onOpen={onOpen}
              onMove={onMove}
              onNewFolder={onNewFolder}
              onGroup={onGroup}
              onMerge={onMerge}
              onFavorite={onFavorite}
              onDelete={onDelete}
              onAdd={onAdd}
              aiReady={aiReady}
            />
          </div>
        ) : (
          <>
            {favorites.length > 0 && (
              <Shelf icon={<Star size={13} />} label="Favourites">
                {favorites.map((doc) => (
                  <NoteRow key={doc.id} doc={doc} onOpen={onOpen} onFavorite={onFavorite} />
                ))}
              </Shelf>
            )}

            {currentProject && current && (
              <p className="mt-4 flex items-center gap-1.5 text-[13px] text-[var(--color-faint)]">
                <FolderOpen size={13} />
                The note you were in is filed under {currentProject.name}.
              </p>
            )}

            {rest.length === 0 && favorites.length === 0 ? (
              <p className="py-10 text-center text-[15px] text-[var(--color-faint)]">
                Everything you write shows up here.
              </p>
            ) : (
              <ul className="mt-1">
                {rest.map((doc) => (
                  <NoteRow key={doc.id} doc={doc} onOpen={onOpen} onFavorite={onFavorite} />
                ))}
              </ul>
            )}

            {live.length > rest.length + favorites.length && (
              <p className="mt-6 text-[13px] text-[var(--color-faint)]">
                Every note you have, including the ones not shown here, is in the Library tab.
              </p>
            )}

            {/*
              The bin lives here rather than pinned to the bottom of the side
              menu, where "delete for good" sat one row below the note somebody
              was working in. Same component, same behaviour, somewhere you go
              on purpose.
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
          </>
        )}
      </div>

      {/*
        The bar that writes a note, over the list rather than at the end of it.

        Fixed, because the thing you came to this screen to do is as likely
        after scrolling as before it, and a "new note" button that scrolls away
        is a button that is missing exactly when the list is long enough to
        make you want one.
      */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 pr-16">
          <button
            type="button"
            onClick={onNew}
            className="flex flex-1 items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-4 py-3 text-left text-[15px] text-[var(--color-faint)] hover:border-[var(--color-faint)]"
          >
            <Pencil size={16} />
            Write a note…
          </button>
        </div>
      </div>

      {/*
        The recorder, in the corner it is in everywhere else in this app. On
        this screen what it says becomes a new note rather than going into an
        open one — which is the difference between "take this down" and "write
        this in here", and they are two different intentions half a second
        apart.
      */}
      <DictationButton title="" aiReady={aiReady} onWrite={onRecord} overDialog />
    </div>
  )
}

function Tab({
  id,
  current,
  onTab,
  icon,
  label,
}: {
  id: HomeTab
  current: HomeTab
  onTab: (tab: HomeTab) => void
  icon: React.ReactNode
  label: string
}) {
  const on = current === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => onTab(id)}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[14px] ${
        on
          ? 'border-[var(--color-accent)] font-medium text-[var(--color-ink)]'
          : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/** A named run of rows. One heading, then the notes under it. */
function Shelf({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-3">
      <p className="mb-0.5 flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
        {icon}
        {label}
      </p>
      <ul>{children}</ul>
    </section>
  )
}
