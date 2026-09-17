'use client'

import { Pencil, Search, Star } from 'lucide-react'
import type { PastedBlock } from '@/lib/paste'
import type { Doc } from '@/lib/types'
import AccountButton, { type Account } from './account'
import DictationButton from './dictation-button'
import NoteRow from './note-row'
import TrashSection from './trash-section'
import type { SyncState } from '@/lib/sync'

/**
 * The notes: the app's front page, and the only screen it has that is not a
 * note.
 *
 * ## Why this is what opens
 *
 * For a year this app opened straight into a note with the caret already in
 * it, and that was right while a note was the unit of work. It is not: the
 * unit of work is *your notes* — the twelve of them you half-remember writing,
 * one of which has the number you need. Opening into the last one you touched
 * is opening a filing cabinet at whichever drawer was left out. So the list is
 * the front page, writing is one press from it, and the note you were in is
 * the first row.
 *
 * ## Two tabs, and why favourites is one of them
 *
 * Notes and Favourites. A favourite is not a shelf at the top of a list —
 * that is what it was, and it pushed everything else down while answering a
 * question nobody was asking. It is a *different list*: the handful you keep
 * coming back to, which is exactly what a tab is for.
 *
 * ## What is not on it
 *
 * No sidebar, no Library, no folders, no tree. Everything the app can do is
 * on this screen or one press inside a note, and the way to find something is
 * to search for it — which reads inside every note rather than filtering their
 * names.
 */
export type NotesTab = 'notes' | 'favourites'

export interface NotesScreenProps {
  docs: Doc[]
  trashed: Doc[]
  tab: NotesTab
  onTab: (tab: NotesTab) => void
  onOpen: (id: string) => void
  onCompose: () => void
  onSearch: () => void
  onFavorite: (id: string, favorite: boolean) => void
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onEmptyTrash: () => void
  /** A note dictated from here, rather than into an open one. */
  onRecord: (blocks: PastedBlock[]) => void
  /** Whether the model is configured, for the recorder's write-up. */
  aiReady: boolean
  /* Signing in, which is on this screen because this is where people are. */
  account: Account | null
  syncState: SyncState
  onSignedIn: (account: Account) => void
  onSignedOut: () => void
  onSyncNow: () => void
}

export default function NotesScreen({
  docs,
  trashed,
  tab,
  onTab,
  onOpen,
  onCompose,
  onSearch,
  onFavorite,
  onRestore,
  onPurge,
  onEmptyTrash,
  onRecord,
  aiReady,
  account,
  syncState,
  onSignedIn,
  onSignedOut,
  onSyncNow,
}: NotesScreenProps) {
  const live = docs.filter((doc) => !doc.deletedAt)
  const favourites = live
    .filter((doc) => doc.favoritedAt)
    .sort((a, b) => (b.favoritedAt ?? 0) - (a.favoritedAt ?? 0))
  const listed = tab === 'favourites' ? favourites : live

  return (
    <div className="min-h-dvh bg-[var(--color-paper)]">
      {/* The bottom padding clears the bar, and a phone's home indicator. */}
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-32 sm:px-8 sm:py-8 sm:pb-32">
        <header className="mb-4 flex items-center gap-2">
          <h1 className="pad-serif text-[30px] font-semibold tracking-tight sm:text-[34px]">
            Notes
          </h1>
          {/*
            Signing in, where it can be found.

            It was a button in a header above a note, and then a row at the
            foot of a side menu — both of them places somebody looking for
            their account would never think to look. This is the first screen
            of the app, so it is where the account belongs.
          */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AccountButton
              account={account}
              syncState={syncState}
              onSignedIn={onSignedIn}
              onSignedOut={onSignedOut}
              onSyncNow={onSyncNow}
            />
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
          <Tab id="notes" current={tab} onTab={onTab} icon={<Pencil size={14} />} label="Notes" />
          <Tab
            id="favourites"
            current={tab}
            onTab={onTab}
            icon={<Star size={14} />}
            label="Favourites"
            count={favourites.length}
          />
        </div>

        {listed.length === 0 ? (
          <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">
            {tab === 'favourites'
              ? 'Star a note and it will be here.'
              : 'Everything you write shows up here.'}
          </p>
        ) : (
          <ul className="mt-1">
            {listed.map((doc) => (
              <NoteRow key={doc.id} doc={doc} onOpen={onOpen} onFavorite={onFavorite} />
            ))}
          </ul>
        )}

        {/*
          The bin, at the foot of the notes rather than beside them: it is a
          safety net, not a place anybody wants to look at.
        */}
        {tab === 'notes' && trashed.length > 0 && (
          <section className="mt-8 border-t border-[var(--color-line)] pt-3">
            <TrashSection
              docs={trashed}
              onRestore={onRestore}
              onPurge={onPurge}
              onEmpty={onEmptyTrash}
            />
          </section>
        )}
      </div>

      {/*
        The bar that writes a note, over the list rather than at the end of it.

        Fixed, because the thing you came here to do is as likely after
        scrolling as before it, and a "new note" button that scrolls away is a
        button that is missing exactly when the list is long enough to make you
        want one.
      */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 pr-16">
          <button
            type="button"
            onClick={onCompose}
            className="flex flex-1 items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-4 py-3 text-left text-[15px] text-[var(--color-faint)] hover:border-[var(--color-faint)]"
          >
            <Pencil size={16} />
            Write a note…
          </button>
        </div>
      </div>

      {/*
        The recorder, in the corner it is in everywhere else in this app. Here
        what is said becomes a new note rather than going into an open one —
        the difference between "take this down" and "write this in here", which
        are two intentions half a second apart.
      */}
      <DictationButton title="" aiReady={aiReady} onWrite={onRecord} />
    </div>
  )
}

function Tab({
  id,
  current,
  onTab,
  icon,
  label,
  count,
}: {
  id: NotesTab
  current: NotesTab
  onTab: (tab: NotesTab) => void
  icon: React.ReactNode
  label: string
  count?: number
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
      {/* A count only where it is news: nobody needs telling how many notes
          they have, but "3" beside Favourites is the whole tab in one glyph. */}
      {count !== undefined && count > 0 && (
        <span className="text-[12px] text-[var(--color-faint)]">{count}</span>
      )}
    </button>
  )
}
