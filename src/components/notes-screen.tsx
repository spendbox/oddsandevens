'use client'

import { BarChart3, Check, Globe2, ListChecks, Pencil, Search, Star } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { PastedBlock } from '@/lib/paste'
import type { Block, Doc, RemovedBlock } from '@/lib/types'
import { byDay } from '@/lib/when'
import { docLabel } from '@/lib/blocks'
import { greeting, nameFromEmail } from '@/lib/name'
import { useName } from '@/lib/profile'
import AccountButton, { type Account } from './account'
import ActionsPanel from './actions-panel'
import Confirm from './confirm'
import DictationButton from './dictation-button'
import InstallButton from './install-button'
import NoteRow from './note-row'
import TrashSection from './trash-section'
import type { SyncState } from '@/lib/sync'

/*
  The two screens nobody has opened yet are not in the first download.

  The World needs the sign-in client to talk to the server at all, and the
  dashboard is a page of numbers most people will look at once a month. Both
  are fetched the first time their tab is pressed — the same bargain the
  sign-in client and the PDF reader already make, and the reason opening the
  notes still costs what it did before either of them existed.
*/
const WorldPanel = dynamic(() => import('./world-panel'), {
  ssr: false,
  loading: () => <Waiting />,
})
const DashboardPanel = dynamic(() => import('./dashboard-panel'), {
  ssr: false,
  loading: () => <Waiting />,
})

/** What a tab shows for the moment it takes to arrive. */
function Waiting() {
  return <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">One moment…</p>
}

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
 * ## Three tabs, and three ways of looking at your own notes under one of them
 *
 * Notes, Actions, World — three *places*, and that is what a tab is for.
 * Actions is what is still to be done, written across forty notes one line at
 * a time, which no amount of scrolling the notes answers: see
 * `actions-panel.tsx`. The World is other people's notes, which is somewhere
 * else entirely: see `world-panel.tsx`.
 *
 * Favourites is not one of them, and that is the correction. It is not a
 * different place — it is the same notes, with most of them hidden — so it
 * sits under Notes with All and the dashboard, as a way of looking rather
 * than a place to go. It was a top-level tab and before that a shelf at the
 * top of the list, and both said the same wrong thing: that your favourites
 * are somewhere other than your notes.
 *
 * ## Days, not a wall
 *
 * Forty rows in one column is forty timestamps somebody reads one at a time.
 * Notes are grouped under the day they were last written in — Today,
 * Yesterday, then the weekday, then the date — because "that was Tuesday" is
 * how people actually remember writing something.
 *
 * ## Ten at a time
 *
 * Only the first page of rows is rendered, and the next ten arrive as the last
 * one scrolls into view. Somebody with six hundred notes should not pay for
 * five hundred and ninety of them to open their list, and the index that
 * search is built from is already the expensive thing in this app.
 *
 * ## What is not on it
 *
 * No sidebar, no Library, no folders, no tree. Everything the app can do is
 * on this screen or one press inside a note, and the way to find something is
 * to search for it — which reads inside every note rather than filtering their
 * names.
 */

/** How many rows are rendered at once, and how many more each time. */
const PAGE = 10
/** The three places. */
export type NotesTab = 'notes' | 'actions' | 'world'
/** The three ways of looking at your own notes, inside the first of them. */
export type NotesView = 'all' | 'favourites' | 'dashboard'

export interface NotesScreenProps {
  docs: Doc[]
  trashed: Doc[]
  tab: NotesTab
  onTab: (tab: NotesTab) => void
  /** Which of the three ways of looking at your own notes is on. */
  view: NotesView
  onView: (view: NotesView) => void
  onOpen: (id: string) => void
  onCompose: () => void
  onSearch: () => void
  onFavorite: (id: string, favorite: boolean) => void
  onDelete: (id: string) => void
  /** Ticks a box from the Actions tab, in the note it lives in. */
  onTick: (docId: string, blockId: string) => void
  /** Puts a ticked box back, in the note it lives in. */
  onUntick: (docId: string, blockId: string) => void
  /** Turns a line of prose into a box, in the note it lives in. */
  onMakeBox: (docId: string, blockId: string) => void
  /**
   * Takes lines out of a note, from the Actions tab. What comes back is
   * where each one was, so an undo can put it there.
   */
  onRemove: (docId: string, blockIds: string[]) => Promise<RemovedBlock[]>
  /** Puts those lines back, which is what the undo does. */
  onPutBack: (docId: string, removed: RemovedBlock[]) => void
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onEmptyTrash: () => void
  /** A note dictated from here, rather than into an open one. */
  onRecord: (blocks: PastedBlock[]) => void
  /** Whether the model is configured, for the recorder's write-up. */
  aiReady: boolean
  /** Whether the recording itself can be transcribed properly. */
  transcribes: boolean
  /** A note copied out of the World, which becomes a note of your own. */
  onSaveFromWorld: (note: { title: string; blocks: Block[] }) => Promise<void>
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
  view,
  onView,
  onOpen,
  onCompose,
  onSearch,
  onFavorite,
  onDelete,
  onTick,
  onUntick,
  onMakeBox,
  onRemove,
  onPutBack,
  onRestore,
  onPurge,
  onEmptyTrash,
  onRecord,
  aiReady,
  transcribes,
  onSaveFromWorld,
  account,
  syncState,
  onSignedIn,
  onSignedOut,
  onSyncNow,
}: NotesScreenProps) {
  /*
    What to call them. What they have typed wins; otherwise it is worked out
    from the account's email, which is a good guess and never a certainty —
    see lib/name.ts. With neither, the greeting is "Hi there" rather than a
    greeting addressed to nobody.
  */
  const { name: chosen, set: setName } = useName()
  const name = chosen || nameFromEmail(account?.email ?? '')

  const live = docs.filter((doc) => !doc.deletedAt)
  const favourites = live
    .filter((doc) => doc.favoritedAt)
    .sort((a, b) => (b.favoritedAt ?? 0) - (a.favoritedAt ?? 0))
  const listed = view === 'favourites' ? favourites : live

  /*
    How many rows are on screen. Reset whenever the list changes underneath —
    a different tab, or a different way of looking at the notes — because
    scrolling four pages into your notes and then pressing Favourites should
    not hand you four pages of favourites.
  */
  const [shown, setShown] = useState(PAGE)
  const [seenWhere, setSeenWhere] = useState(`${tab}/${view}`)
  if (`${tab}/${view}` !== seenWhere) {
    setSeenWhere(`${tab}/${view}`)
    setShown(PAGE)
  }

  const page = listed.slice(0, shown)
  const more = listed.length > page.length
  const sentinel = useRef<HTMLDivElement>(null)

  /*
    The next ten arrive when the bottom of the list comes into view. An
    observer rather than a scroll handler: it fires once when it matters
    instead of on every frame of a flick, and it costs nothing while the list
    is sitting still.
  */
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setShown((n) => n + PAGE)
      },
      // A screen ahead, so the rows are there before the scroll reaches them.
      { rootMargin: '600px' },
    )
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [more, shown])

  const groups = byDay(page)

  /*
    The note a swipe or a bin has offered up for deletion, and nothing has
    happened to yet. Asking is one dialog rather than a flag on the row: see
    confirm.tsx for why an inline question is the wrong shape in a list
    somebody is scrolling.
  */
  const [doomed, setDoomed] = useState<Doc | null>(null)

  return (
    <div className="min-h-dvh bg-[var(--color-paper)]">
      {/* The bottom padding clears the bar, and a phone's home indicator. */}
      <div className="mx-auto w-full max-w-3xl px-4 pb-32 sm:px-8 sm:pb-32">
        {/*
          The greeting, the search field and the tabs stay at the top while
          the notes scroll under them.

          They are one sticky block rather than three, because three things
          that stick at three different offsets is three numbers to keep in
          step — and because what they are is a header: the thing that says
          where you are and what you can do from here. Opaque, never a blur: a
          bar the page scrolls under has to be a surface, or the words show
          through it.
        */}
        <header className="sticky top-0 z-20 bg-[var(--color-paper)] pt-5 sm:pt-8">
          <div className="mb-4 flex items-center gap-2">
            <Greeting name={name} onName={setName} />
          {/*
            Signing in, where it can be found.

            It was a button in a header above a note, and then a row at the
            foot of a side menu — both of them places somebody looking for
            their account would never think to look. This is the first screen
            of the app, so it is where the account belongs.
          */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/*
              Install, beside the account and before it — the two things on
              this screen that are about the app rather than about the notes.
              It is absent on every browser that has nothing to offer, and
              gone for good once the app is installed. See install.ts.
            */}
            <InstallButton />
            <AccountButton
              account={account}
              syncState={syncState}
              onSignedIn={onSignedIn}
              onSignedOut={onSignedOut}
              onSyncNow={onSyncNow}
            />
          </div>
          </div>

        {/*
          A field rather than a magnifying glass in a corner.

          It does not type here — pressing it opens the search panel, which
          reads inside every note rather than filtering their names. Showing
          what it searches is the point: "every word in every note" is the
          thing people do not expect a notes app to do, and a 24-pixel icon
          says none of it.

          Not on the World, which searches everybody's notes and has a field
          of its own saying so. Two search boxes on one screen searching two
          different collections is the fastest way to make somebody distrust
          both.
        */}
        {tab !== 'world' && (
          <button
            type="button"
            onClick={onSearch}
            className="mb-3 flex w-full items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-4 py-3 text-left text-[15px] text-[var(--color-faint)] hover:border-[var(--color-faint)]"
          >
            <Search size={17} />
            Search every word in every note
          </button>
        )}

        <div
          role="tablist"
          aria-label="Pad"
          className="flex items-stretch gap-1 border-b border-[var(--color-line)]"
        >
          <Tab id="notes" current={tab} onTab={onTab} icon={<Pencil size={14} />} label="Notes" />
          <Tab
            id="actions"
            current={tab}
            onTab={onTab}
            icon={<ListChecks size={14} />}
            label="Actions"
          />
          <Tab id="world" current={tab} onTab={onTab} icon={<Globe2 size={14} />} label="World" />
        </div>

        {/*
          And underneath, the ways of looking at the same notes.

          Quiet pills rather than a second row of tabs with underlines: they
          are not places, and drawing them like the row above would say they
          were. They are only there while Notes is, because a way of looking
          at your notes means nothing on a screen that is not showing them.
        */}
        {tab === 'notes' && (
          <div
            role="tablist"
            aria-label="Your notes"
            className="flex items-center gap-1 pt-2 pb-1"
          >
            <View id="all" current={view} onView={onView} label="All" count={live.length} />
            <View
              id="favourites"
              current={view}
              onView={onView}
              icon={<Star size={13} />}
              label="Favourites"
              count={favourites.length}
            />
            <View
              id="dashboard"
              current={view}
              onView={onView}
              icon={<BarChart3 size={13} />}
              label="Dashboard"
            />
          </div>
        )}
        </header>

        {tab === 'actions' ? (
          <ActionsPanel
            docs={live}
            aiReady={aiReady}
            onOpen={onOpen}
            onTick={onTick}
            onUntick={onUntick}
            onMakeBox={onMakeBox}
            onRemove={onRemove}
            onPutBack={onPutBack}
          />
        ) : tab === 'world' ? (
          <WorldPanel onSave={onSaveFromWorld} />
        ) : view === 'dashboard' ? (
          <DashboardPanel docs={live} accountId={account?.id ?? null} />
        ) : listed.length === 0 ? (
          <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">
            {view === 'favourites'
              ? 'Star a note and it will be here.'
              : 'Everything you write shows up here.'}
          </p>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.label}>
                {/*
                  The day, and it sticks under the header while its own notes
                  are on screen — so scrolling never leaves somebody looking at
                  six rows with no idea which day they are in.
                */}
                <h2 className="pad-day-heading text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
                  {group.label}
                </h2>
                <ul>
                  {group.items.map((doc) => (
                    <NoteRow
                      key={doc.id}
                      doc={doc}
                      onOpen={onOpen}
                      onFavorite={onFavorite}
                      onDelete={(id) => setDoomed(live.find((d) => d.id === id) ?? null)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {/*
              What the next ten are waiting on. Rendered only while there are
              more, so an observer is never watching an element that will never
              matter again.
            */}
            {more && <div ref={sentinel} aria-hidden className="h-4" />}
          </>
        )}

        {/*
          The bin, at the foot of the notes rather than beside them: it is a
          safety net, not a place anybody wants to look at.
        */}
        {tab === 'notes' && view === 'all' && trashed.length > 0 && (
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

      <Confirm
        open={!!doomed}
        title={doomed ? `Delete “${docLabel(doomed)}”?` : ''}
        body="It goes to the trash, and stays there for 7 days."
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          if (doomed) onDelete(doomed.id)
          setDoomed(null)
        }}
      />

      {/*
        The recorder, in the corner it is in everywhere else in this app. Here
        what is said becomes a new note rather than going into an open one —
        the difference between "take this down" and "write this in here", which
        are two intentions half a second apart.
      */}
      <DictationButton
        title=""
        aiReady={aiReady}
        transcribes={transcribes}
        onWrite={onRecord}
      />
    </div>
  )
}

/**
 * "Hi, Ada", and a pencil to correct it.
 *
 * Editing happens in place — the heading becomes a field of the same size in
 * the same spot — rather than opening a dialog to change one word. Escape puts
 * it back, Return keeps it, and leaving the field keeps it too, because a name
 * somebody typed and then tapped away from is a name they meant.
 */
function Greeting({ name, onName }: { name: string; onName: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const start = () => {
    setDraft(name)
    setEditing(true)
  }
  const keep = () => {
    onName(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') keep()
            if (event.key === 'Escape') setEditing(false)
          }}
          onBlur={keep}
          aria-label="Your name"
          placeholder="Your name"
          maxLength={24}
          className="pad-serif min-w-0 flex-1 border-b border-[var(--color-accent)] bg-transparent text-[30px] font-semibold tracking-tight outline-none sm:text-[34px]"
        />
        <button
          type="button"
          onClick={keep}
          aria-label="Save your name"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
        >
          <Check size={18} />
        </button>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <h1 className="pad-serif min-w-0 truncate text-[30px] font-semibold tracking-tight sm:text-[34px]">
        {greeting(name)}
      </h1>
      <button
        type="button"
        onClick={start}
        aria-label="Change your name"
        title="Change your name"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
      >
        <Pencil size={14} />
      </button>
    </span>
  )
}

function Tab({
  id,
  current,
  onTab,
  icon,
  label,
}: {
  id: NotesTab
  current: NotesTab
  onTab: (tab: NotesTab) => void
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

/**
 * One way of looking at your own notes: a pill, not a tab.
 *
 * The difference is deliberate and it is the whole point of the change. The
 * row above is places — your notes, what is outstanding, everybody else's.
 * This row is the same notes seen three ways, and drawing it identically
 * would say there were six places when there are three.
 */
function View({
  id,
  current,
  onView,
  icon,
  label,
  count,
}: {
  id: NotesView
  current: NotesView
  onView: (view: NotesView) => void
  icon?: React.ReactNode
  label: string
  count?: number
}) {
  const on = current === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => onView(id)}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] ${
        on
          ? 'bg-[var(--color-hover)] font-medium text-[var(--color-ink)]'
          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {icon}
      {label}
      {/* A count only where it is news. Beside Favourites it is the whole
          thing in one glyph; beside All it says how much there is to scroll. */}
      {count !== undefined && count > 0 && (
        <span className="text-[12px] text-[var(--color-faint)]">{count}</span>
      )}
    </button>
  )
}
