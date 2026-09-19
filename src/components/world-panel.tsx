'use client'

import { BookmarkCheck, BookmarkPlus, ExternalLink, LoaderCircle, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Block } from '@/lib/types'
import { when } from '@/lib/when'
import {
  markSaved,
  worldFeed,
  worldNote,
  worldStats,
  type WorldNote,
  type WorldStats,
} from '@/lib/world'

/**
 * The World: what other people have left where anybody can read it.
 *
 * ## Why it is a tab and not a second app
 *
 * Because the thing somebody wants from other people's notes is the same
 * thing they want from their own: to find one and to keep it. So it is a
 * list, in the same rows, with two things you can do to a row — read it, or
 * make it yours. There is no following, no liking, no comments and no feed
 * that decides for you what is worth reading; the order is newest first and
 * the way to find something is to search for it.
 *
 * ## Saving copies, and that is the whole of it
 *
 * A saved note is a new note of your own, made from the words. It does not
 * stay linked to the original, it does not update when the original does, and
 * taking the original down does not take your copy with it. Anything else
 * would mean a note in somebody's list that another person can edit or
 * delete, which is not a thing a notes app should ever have.
 *
 * ## Why none of this is in the first download
 *
 * It is loaded the first time the tab is pressed. The notes screen is what
 * opens, and it should not carry the weight of a screen most people will not
 * be looking at — the same reason the sign-in client and the PDF reader are
 * fetched when they are needed and not before.
 */

export default function WorldPanel({
  onSave,
}: {
  /** Makes a note of your own from a copy. Resolves once it is saved. */
  onSave: (note: { title: string; blocks: Block[] }) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  /** What the list is actually showing, which lags the field by a moment. */
  const [asked, setAsked] = useState('')
  const [notes, setNotes] = useState<WorldNote[]>([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [stats, setStats] = useState<WorldStats | null>(null)
  /** Which rows have been copied, so the button can say so. */
  const [saved, setSaved] = useState<string[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  /*
    The field waits before it asks.

    Every keystroke is a query against everybody's notes, and a search box
    that fires one per letter is six requests to answer a six-letter word. A
    third of a second is long enough that a typed word is one request and
    short enough that nobody waits for it.

    And it only asks when the question has actually changed. That guard is
    not an optimisation — it is the whole of a bug this screen had from the
    day it was written. The timer runs once on opening, with an empty field
    and an empty `asked`, and turned the spinner back on for a search that
    was never made: nothing downstream changed, so nothing ever turned it
    off, and the World opened with a wheel spinning beside the search box
    for as long as anybody left it there.
  */
  useEffect(() => {
    const wanted = query.trim()
    if (wanted === asked) return
    const timer = setTimeout(() => {
      // Both in the timer, which is a callback and not the effect's body:
      // the spinner turning on is part of "a new search has started", and
      // setting state synchronously inside an effect is the one thing this
      // codebase's lint rule will not have.
      setAsked(wanted)
      setBusy(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, asked])

  /*
    The first page of whatever is being asked for.

    The request lives inside the effect rather than in a callback the effect
    calls: setting state from an effect's own body is the thing this codebase
    does not do, and an inline async run is how every other fetch here is
    written. `cancelled` is not politeness — two searches in flight can come
    back in either order, and without it the slower, older one paints over
    the newer.
  */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const page = await worldFeed({ query: asked, offset: 0 })
      if (cancelled) return
      setProblem(page.problem ?? null)
      setNotes(page.notes)
      setMore(page.more)
      setBusy(false)
    })()
    return () => {
      cancelled = true
    }
  }, [asked])

  /** The next page, appended. An event handler, so it may say so at once. */
  const showMore = async () => {
    if (busy) return
    setBusy(true)
    const page = await worldFeed({ query: asked, offset: notes.length })
    setProblem(page.problem ?? null)
    setNotes((current) => [...current, ...page.notes])
    setMore(page.more)
    setBusy(false)
  }

  // The counts, asked for once. They are a line of context, not a number
  // anybody is watching change.
  useEffect(() => {
    void worldStats().then(setStats)
  }, [])

  const save = async (note: WorldNote) => {
    if (saving) return
    setSaving(note.id)
    const full = await worldNote(note.id)
    if (full) {
      await onSave({ title: full.title || note.title, blocks: full.blocks })
      setSaved((all) => [...all, note.id])
      // The one number the person who shared it gets back. Not awaited: the
      // note is already theirs, and a counter that failed to go up must not
      // look like a save that did not happen.
      void markSaved(note.id)
    } else {
      setProblem('That note could not be fetched. It may have been taken down.')
    }
    setSaving(null)
  }

  return (
    <div className="pb-4">
      {/*
        The search field, and under it the one line of context that says
        whether anybody else is here. A count is worth printing precisely
        once: on the screen whose whole question is "is there anything in
        this".
      */}
      <div className="mt-4">
        <label className="flex items-center gap-2.5 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-4 py-3 focus-within:border-[var(--color-faint)]">
          <Search size={17} className="shrink-0 text-[var(--color-faint)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes people have shared"
            aria-label="Search the World"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-faint)]"
          />
          {busy && <LoaderCircle size={15} className="animate-spin text-[var(--color-faint)]" />}
        </label>
        {stats && (
          <p className="mt-2 text-[12px] text-[var(--color-faint)]">
            {stats.people.toLocaleString()} {stats.people === 1 ? 'person has' : 'people have'}{' '}
            shared {stats.notes.toLocaleString()} {stats.notes === 1 ? 'note' : 'notes'}. Share one
            of yours from a note’s ⋯ menu.
          </p>
        )}
      </div>

      {problem && (
        <p className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-hover)] p-3 text-[13px] text-[var(--color-muted)]">
          {problem}
        </p>
      )}

      {!problem && !busy && notes.length === 0 && (
        <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">
          {asked ? 'Nothing here matches that.' : 'Nobody has shared a note yet. You could be first.'}
        </p>
      )}

      <ul className="mt-2">
        {notes.map((note) => (
          <li key={note.id} className="border-b border-[var(--color-line)] last:border-b-0">
            <div className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                {/*
                  The title opens the note at the address it was shared at —
                  the read-only page that has existed since sharing did. A new
                  tab, because leaving the app to read somebody else's note
                  and losing your place in your own is the wrong trade.
                */}
                <a
                  href={`/s/${note.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-[15px] font-medium underline-offset-2 hover:underline"
                >
                  <span className="min-w-0 truncate">{note.title || 'Untitled'}</span>
                  <ExternalLink size={13} className="shrink-0 text-[var(--color-faint)]" />
                </a>
                {note.preview && (
                  <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--color-muted)]">
                    {note.preview}
                  </p>
                )}
                <p className="mt-1 text-[12px] text-[var(--color-faint)]">
                  {note.author || 'Anonymous'}
                  {note.updatedAt > 0 && ` · ${when(note.updatedAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void save(note)}
                disabled={saved.includes(note.id) || saving === note.id}
                aria-label={`Save “${note.title || 'Untitled'}” to my notes`}
                className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-[var(--color-muted)] hover:border-[var(--color-faint)] hover:text-[var(--color-ink)] disabled:opacity-60"
              >
                {saving === note.id ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : saved.includes(note.id) ? (
                  <BookmarkCheck size={14} className="text-[var(--color-good)]" />
                ) : (
                  <BookmarkPlus size={14} />
                )}
                {saved.includes(note.id) ? 'Saved' : 'Save'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {more && (
        <button
          type="button"
          onClick={() => void showMore()}
          disabled={busy}
          className="mt-4 w-full rounded-full border border-[var(--color-line)] py-2.5 text-[14px] text-[var(--color-muted)] hover:border-[var(--color-faint)] hover:text-[var(--color-ink)] disabled:opacity-60"
        >
          {busy ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  )
}
