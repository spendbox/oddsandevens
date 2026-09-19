'use client'

import { Globe2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { countLabel, summarise } from '@/lib/stats'
import type { Doc } from '@/lib/types'
import { myWorld, worldStats, type MyWorld, type WorldStats } from '@/lib/world'

/**
 * A page of numbers about your own notes.
 *
 * ## Why it is small on purpose
 *
 * Because it is the one screen here that is about writing rather than
 * writing: nobody opens a notes app to look at a chart. So it is a handful of
 * counts, a fortnight of days, and what kinds of note they are — read in
 * about four seconds, and then you go back to your notes. Anything more is a
 * second app growing inside this one, which is the thing the whole of
 * AGENTS.md is written against.
 *
 * ## Why there is no colour in it
 *
 * Two colours in this app have one job each: green says what kind of note
 * something is, yellow marks a searched word. A dashboard is exactly where a
 * palette creeps in — a colour per kind, a red for what is overdue — and the
 * moment it does, neither of those two colours means anything any more. So
 * the bars are ink at different weights, which is enough to compare heights
 * with and says nothing it should not.
 *
 * ## Why it costs nothing
 *
 * Every number about your own notes is counted from the notes already in
 * memory, on the device, offline, free, and the same every time. See
 * `lib/stats.ts`, where all of it lives as pure functions with unit tests —
 * this file only draws.
 *
 * ## The one part that is not local, and how it behaves
 *
 * What you have put into the World, and how many copies people took of it,
 * are facts about a server and cannot be anything else. So they arrive after
 * the rest and are their own section: the page is complete and readable the
 * moment it opens, nothing waits for them, and if they never come — no
 * account, no network, no migration — that section is simply not there. A
 * dashboard that shows a spinner where a number should be is a dashboard that
 * looks broken every time somebody opens it on a train.
 */
export default function DashboardPanel({
  docs,
  accountId,
}: {
  docs: Doc[]
  /** Null when nobody is signed in, which is what the World needs. */
  accountId: string | null
}) {
  /*
    Memoised, because it reads every block of every note and this tab
    re-renders for reasons that have nothing to do with the notes — the same
    reason the Actions tab memoises its gather.
  */
  const summary = useMemo(() => summarise(docs), [docs])

  const [mine, setMine] = useState<MyWorld | null>(null)
  const [world, setWorld] = useState<WorldStats | null>(null)

  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    void (async () => {
      const [own, all] = await Promise.all([myWorld(accountId), worldStats()])
      if (cancelled) return
      setMine(own)
      setWorld(all)
    })()
    return () => {
      cancelled = true
    }
  }, [accountId])

  if (!summary.notes) {
    return (
      <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">
        Write a note and this fills in.
      </p>
    )
  }

  return (
    <div className="pb-4">
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Notes" value={countLabel(summary.notes)} />
        <Tile label="Words" value={countLabel(summary.words)} />
        <Tile label="Written this week" value={countLabel(summary.thisWeek)} />
        <Tile
          label="Days in a row"
          value={countLabel(summary.streak)}
          hint={summary.streak === 0 ? 'Write one today' : undefined}
        />
        <Tile label="Boxes to tick" value={countLabel(summary.open)} />
        <Tile label="Ticked" value={countLabel(summary.done)} />
        <Tile label="Favourites" value={countLabel(summary.favourites)} />
        <Tile
          label="Left out of Actions"
          value={countLabel(summary.ignored)}
          hint={summary.ignored ? 'Not read for tasks' : undefined}
        />
      </div>

      {/*
        The last fortnight, one bar a day.

        Two weeks because it is the span somebody can still remember — "I did
        not write anything on Thursday" is a fact about this week, not about
        March. Drawn with two divs and a height, because a charting library
        for fourteen numbers is half a megabyte to say what CSS already says.
      */}
      <section className="mt-5 rounded-xl border border-[var(--color-line)] p-3">
        <h3 className="text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
          {/* "Fortnight" is a word half the people reading this do not use.
              Two weeks is the same span and needs no translating. */}
          The last two weeks
        </h3>
        <div className="mt-3 flex items-end gap-1" aria-hidden>
          {summary.days.map((day) => (
            <div key={day.at} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-sm bg-[var(--color-ink)]"
                style={{
                  // A day with nothing on it is a hairline rather than
                  // nothing at all: an empty column with no mark in it reads
                  // as a rendering fault, not as a quiet Tuesday.
                  height: day.count
                    ? `${Math.max(6, Math.round((day.count / summary.busiest) * 44))}px`
                    : '2px',
                  opacity: day.count ? 0.85 : 0.18,
                }}
              />
              <span className="text-[10px] text-[var(--color-faint)]">{day.label}</span>
            </div>
          ))}
        </div>
        {/* The bars are decoration; this is the sentence that carries the
            same fact to somebody using a screen reader. */}
        <p className="sr-only">
          {summary.days.map((day) => `${day.label}: ${day.count}`).join(', ')}
        </p>
      </section>

      {/*
        What you have put out there, and what came of it.

        Under its own heading rather than mixed in with the tiles above,
        because these two are about a server and the rest are about this
        device — and because a number that is sometimes missing sitting in a
        grid of numbers that never are reads as a fault rather than as a
        different kind of fact.
      */}
      {mine && (
        <section className="mt-3 rounded-xl border border-[var(--color-line)] p-3">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
            <Globe2 size={12} />
            In the World
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label="Notes you have shared" value={countLabel(mine.shared)} />
            <Tile
              label="Copies people took"
              value={countLabel(mine.saves)}
              hint={mine.shared === 0 ? 'Share one from a note’s ⋯' : undefined}
            />
            {world && (
              <Tile
                label="Notes out there"
                value={countLabel(world.notes)}
                hint={`from ${countLabel(world.people)} ${world.people === 1 ? 'person' : 'people'}`}
              />
            )}
          </div>
        </section>
      )}

      {summary.kinds.length > 1 && (
        <section className="mt-3 rounded-xl border border-[var(--color-line)] p-3">
          <h3 className="text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
            What they are
          </h3>
          <ul className="mt-2 space-y-1.5">
            {summary.kinds.map((kind) => (
              <li key={kind.kind} className="flex items-center gap-2 text-[13px]">
                <span className="w-20 shrink-0 text-[var(--color-muted)]">{kind.label}</span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-hover)]">
                  <span
                    className="block h-full rounded-full bg-[var(--color-ink)] opacity-70"
                    style={{ width: `${Math.round((kind.count / summary.notes) * 100)}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-[var(--color-faint)]">
                  {kind.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** One number, and what it is a number of. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] p-3">
      <p className="pad-serif text-[26px] leading-none font-semibold">{value}</p>
      <p className="mt-1.5 text-[12px] text-[var(--color-muted)]">{label}</p>
      {hint && <p className="text-[11px] text-[var(--color-faint)]">{hint}</p>}
    </div>
  )
}
