'use client'

import { BarChart3, Check, Globe2, ListChecks, Pencil, Search, Star, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PastedBlock } from '@/lib/paste'
import type { Block, Doc, RemovedBlock } from '@/lib/types'
import { byDay } from '@/lib/when'
import { docLabel } from '@/lib/blocks'
import { gatherActions } from '@/lib/actions'
import { useDismissed } from '@/lib/dismissed'
import { greeting, nameFromEmail } from '@/lib/name'
import { draftLabel, useDraft } from '@/lib/draft'
import { useMode } from '@/lib/mode'
import { useName } from '@/lib/profile'
import AccountButton, { type Account } from './account'
import ActionsPanel from './actions-panel'
import Confirm from './confirm'
import DictationButton from './dictation-button'
import InstallButton from './install-button'
import ModeToggle from './mode-toggle'
import UpdateButton from './update-button'
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
/*
  And the team, which most people will never press. It is the largest of the
  three and the only one that is not about this person's own notes at all.
*/
const TeamsPanel = dynamic(() => import('./teams-panel'), {
  ssr: false,
  loading: () => <Waiting />,
})
/*
  And the mark that says a team has something new in it. Lazy for the same
  reason: it draws nothing at all most of the time, and the queries behind
  it belong to a screen many people will never open.
*/
const TeamNudge = dynamic(() => import('./team-nudge'), { ssr: false })

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
   * Corrects the wording of one line, in the note it lives in.
   *
   * There is nowhere else for it to go: in your own notes the task *is*
   * the line. The sheet that offers it says so before it is pressed.
   */
  onRetext: (docId: string, blockId: string, text: string) => void
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
  /**
   * Makes a new note of your own out of words from somewhere else: a copy
   * taken from the World, or a solution Brainstorm wrote. One callback,
   * because both are the same act — words in, a note in your list out.
   */
  onNewNote: (note: { title: string; blocks: Block[] }) => Promise<void>
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
  onRetext,
  onRemove,
  onPutBack,
  onRestore,
  onPurge,
  onEmptyTrash,
  onRecord,
  aiReady,
  transcribes,
  onNewNote,
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
  /*
    Which half of the app this is. Mine is the default and everything in it
    works with no account; Team is a different screen entirely, and nothing
    of yours moves into it — see lib/mode.ts.
  */
  const { mode } = useMode()
  const team = mode === 'team'
  /** Whether the search field has been asked for. Never on by default. */
  const [searching, setSearching] = useState(false)
  /** What was in the writing box when it was last closed, if anything. */
  const draft = useDraft()

  /*
    How tall the bar at the top is, written straight onto the element as a
    custom property rather than held in state.

    The team's navigation sticks underneath this one and has to know where
    "underneath" is. A number in state would be a render every time the
    header changed size — including while somebody is typing their name
    into it — and this app has already paid once for a layout that reacted
    to its own relayout. A CSS variable is read by the browser and nothing
    re-renders at all.
  */
  const header = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = header.current
    if (!el) return
    const measure = () => {
      el.parentElement?.style.setProperty('--pad-header', `${Math.round(el.offsetHeight)}px`)
    }
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [])

  const live = docs.filter((doc) => !doc.deletedAt)

  /*
    Everything outstanding, read here rather than inside the Actions tab.

    It is here because the tab has to wear the number whether or not it is
    the tab you are on — a count that only appears once you have pressed
    Actions is a count nobody needed. Reading every block of every note is
    the expensive thing in this app after the search index, so it is
    memoised on the notes and computed exactly once: the panel is handed
    the list rather than gathering its own, or the number on the tab and
    the rows under it would be two answers to one question.

    And not at all in Team, where there is no tab to wear it and none of
    this is on screen.
  */
  const { has: turnedDown } = useDismissed()
  /*
    Memoised on `docs` and not on `live`, which is a fresh array every
    render and so memoised nothing at all — this read every block of every
    note on every keystroke in the greeting. The filter it was skipping is
    one pass over a list; the gather is the expensive half.
  */
  const gathered = useMemo(
    () => (team ? [] : gatherActions(docs.filter((doc) => !doc.deletedAt))),
    [docs, team],
  )
  const outstanding = gathered.filter(
    (item) => item.kind === 'box' || !turnedDown(item.docId, item.blockId),
  )

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
      {/*
        The measure, and the one place it is not a measure.

        Notes are read at a reading width, which is what the 3xl is for. A
        chat is not: it is short lines with a name beside each one, and
        holding it to the width of a paragraph leaves two thirds of a
        laptop empty and wraps every message on a phone that did not need
        wrapping. So the team takes the screen.
      */}
      <div
        className={`mx-auto w-full px-4 pb-32 sm:px-8 sm:pb-32 ${team ? 'max-w-5xl' : 'max-w-3xl'}`}
      >
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
        {/*
          It sticks on both sides of the switch, and the team's own bar
          sticks underneath it.

          For a while it did not stick in Team, because two sticky bars at
          one offset is one of them drawn over the other and there was no
          honest way to say how tall this one was. There is now:
          `--pad-header` is measured off this element by the observer
          below and written straight onto its parent, so the team's
          navigation sticks at exactly the bottom edge of this bar however
          long a name wraps it. Which team you are in and who you are are
          both things worth keeping on screen while a chat scrolls.
        */}
        {/*
          The ref is what makes the paragraph above true, and it was
          missing from the day the measuring was written. Nothing broke
          while the greeting did not stick in Team — the team's own bar
          fell back to `top: 0`, which was where it wanted to be anyway —
          and the moment this bar started sticking too, the fallback put
          the second one directly underneath the first. A measurement
          nothing is measuring is the quietest kind of wrong.
        */}
        <header ref={header} className="sticky top-0 z-20 bg-[var(--color-paper)] pt-5 sm:pt-8">
          {/*
            Padding, not a margin, and that is load-bearing.

            The gap under the greeting was `mb-4`. In Team there is nothing
            after it inside this header — the tabs belong to your own notes
            — so it was the last child's bottom margin with no padding or
            border below it, which means it collapsed straight through the
            header and out. `offsetHeight` does not count a margin that has
            escaped, so `--pad-header` came out sixteen pixels short and the
            team's own bar stuck that far too high, overlapping the name it
            was supposed to sit under. Padding cannot collapse.
          */}
          <div className="flex items-center gap-2 pb-4">
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
            {/* Both of these are about the app rather than the notes, and
                both are absent nearly all of the time. */}
            <UpdateButton />
            <InstallButton />
            {/* The one control that changes what the whole screen is for. */}
            <ModeToggle />
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
          The field that says what it searches, when it has been asked for.

          It used to be there all the time, across the top of every screen,
          which spent the width of the page and the height of a row on a
          thing most people press once a day. It is a button in the row of
          tabs now, at the end of it beside the World — and pressing that
          opens the field, which still says "every word in every note",
          because that is the thing nobody expects a notes app to do and a
          24-pixel icon says none of it. Escape or the × puts it away.
        */}
        {!team && searching && (
          <div className="mt-2 mb-1 flex items-center gap-1">
            <button
              type="button"
              autoFocus
              onClick={onSearch}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-[var(--color-accent)] bg-[var(--color-hover)] px-4 py-3 text-left text-[15px] text-[var(--color-faint)]"
            >
              <Search size={17} />
              Search every word in every note
            </button>
            <button
              type="button"
              onClick={() => setSearching(false)}
              aria-label="Stop searching"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/*
          What has been said in a team while somebody was in their own
          notes. Nothing at all when there is nothing — see team-nudge.tsx.
        */}
        {!team && <TeamNudge accountId={account?.id ?? null} />}

        {/*
          The three places, and only in Mine: a team has two of its own and
          two rows of tabs is a screen nobody can find their way around.
        */}
        {!team && (
        <div
          role="tablist"
          aria-label="Places"
          className="flex items-stretch gap-1 border-b border-[var(--color-line)]"
        >
          <Tab id="notes" current={tab} onTab={onTab} icon={<Pencil size={14} />} label="Notes" />
          <Tab
            id="actions"
            current={tab}
            onTab={onTab}
            icon={<ListChecks size={14} />}
            label="Actions"
            count={outstanding.length}
          />
          <Tab id="world" current={tab} onTab={onTab} icon={<Globe2 size={14} />} label="World" />
          {/*
            Search, at the end of the row and lined up with the World —
            the only thing here that is not a place, so it is an icon
            rather than a word with an underline under it.

            Not on the World, which searches everybody's notes and has a
            field of its own saying so. Two search boxes on one screen
            searching two different collections is the fastest way to make
            somebody distrust both.
          */}
          {tab !== 'world' && (
          <button
            type="button"
            aria-label="Search every word in every note"
            aria-expanded={searching}
            title="Search every word in every note"
            onClick={() => setSearching((on) => !on)}
            className={`-mb-px ml-auto flex items-center justify-center border-b-2 px-3 py-2.5 ${
              searching
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            <Search size={15} />
          </button>
          )}
        </div>
        )}

        {/*
          And underneath, the ways of looking at the same notes.

          Quiet pills rather than a second row of tabs with underlines: they
          are not places, and drawing them like the row above would say they
          were. They are only there while Notes is, because a way of looking
          at your notes means nothing on a screen that is not showing them.
        */}
        {!team && tab === 'notes' && (
          <div
            role="tablist"
            aria-label="Your notes"
            /*
              A hairline under it, for the same reason the tabs above have
              one: it is the bottom edge of the header, and without it the
              pills float over the first row of notes as the list scrolls
              under them with nothing to say where one stops and the other
              starts.
            */
            className="flex items-center gap-1 border-b border-[var(--color-line)] pt-2 pb-2"
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

        {team ? (
          <TeamsPanel
            me={
              account
                ? { id: account.id, email: account.email, name: name || account.email.split('@')[0] }
                : null
            }
          />
        ) : tab === 'actions' ? (
          <ActionsPanel
            docs={live}
            items={outstanding}
            aiReady={aiReady}
            onOpen={onOpen}
            onNewNote={onNewNote}
            onTick={onTick}
            onUntick={onUntick}
            onMakeBox={onMakeBox}
            onRetext={onRetext}
            onRemove={onRemove}
            onPutBack={onPutBack}
          />
        ) : tab === 'world' ? (
          <WorldPanel onSave={onNewNote} />
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
        {!team && tab === 'notes' && view === 'all' && trashed.length > 0 && (
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

        Not in Team mode: the chat has its own box in the same place, and two
        boxes at the bottom of one screen is one of them being typed into by
        mistake.
      */}
      {!team && (
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 pr-16">
          {/*
            And if the box was closed with something in it, the bar says
            so and opening it again has the words back. A pop-up can be
            shut by every accident a phone has, and three lines lost that
            way is the worst thing this app can do — see lib/draft.ts.
          */}
          {/*
            Dark, because it is the one thing on this screen somebody came
            here to press.

            It was a pale pill on pale paper, the same weight as the search
            field and the row of tabs, sitting in a bar of its own at the
            bottom of the screen and reading as part of the furniture. The
            ink colour is the only strong value this app has that is not
            already spoken for — green says what kind of note something is,
            yellow marks a searched word — and it inverts with the theme
            for free, because both of these are the same two variables the
            page itself is made of.
          */}
          <button
            type="button"
            onClick={onCompose}
            className={`flex flex-1 items-center gap-2.5 rounded-full px-4 py-3 text-left text-[15px] ${
              draft
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90'
            }`}
          >
            <Pencil size={16} className="shrink-0" />
            <span className="min-w-0 truncate">
              {draft ? draftLabel(draft) : 'Write a note…'}
            </span>
          </button>
        </div>
      </div>
      )}

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
      {!team && (
        <DictationButton
          title=""
          aiReady={aiReady}
          transcribes={transcribes}
          onWrite={onRecord}
        />
      )}
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
          className="pad-serif min-w-0 flex-1 border-b border-[var(--color-accent)] bg-transparent text-[21px] font-semibold tracking-tight outline-none sm:text-[24px]"
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
      {/*
        Smaller than it was, on purpose and in both halves of the app.

        It was set at the size of a page's title, which is what it looked
        like: a headline saying your own name, above the thing you actually
        came to read. It is a greeting — the smallest thing on the screen
        that is still plainly a greeting — and the bar it sits in is sticky,
        so every pixel of it is a pixel of notes nobody can see.
      */}
      <h1 className="pad-serif min-w-0 truncate text-[21px] font-semibold tracking-tight sm:text-[24px]">
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
  count,
}: {
  id: NotesTab
  current: NotesTab
  onTab: (tab: NotesTab) => void
  icon: React.ReactNode
  label: string
  /** How much is waiting behind this tab, where that is worth saying. */
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
      {/*
        How many things are outstanding, on the tab rather than behind it.

        The Actions tab is the one place in this app where the answer to
        "is it worth looking" is a number, and it was only ever visible to
        somebody who had already looked. Nothing when it is nothing: a
        grey zero beside Actions is a reminder of an empty list.
      */}
      {count !== undefined && count > 0 && (
        <span className="text-[12px] text-[var(--color-faint)]">{count}</span>
      )}
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
      /*
        The one that is on is the only one that is really there.

        These three are a way of looking at the same notes rather than
        three places to go, so at a glance the row should read as one
        word with two alternatives beside it — not as three equal
        choices competing with the list underneath. The unselected pair
        fade most of the way out and come back on hover and on focus, so
        nothing is hidden from anybody navigating by keyboard.
      */
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-opacity ${
        on
          ? 'bg-[var(--color-hover)] font-medium text-[var(--color-ink)]'
          : 'text-[var(--color-muted)] opacity-40 hover:opacity-100 hover:text-[var(--color-ink)] focus-visible:opacity-100'
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
