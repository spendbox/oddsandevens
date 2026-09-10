'use client'

import { useActionState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button, Card, Problem } from '@/components/ui'
import { MAX_PRIZE_NAIRA, PRIZE_NAIRA, naira } from '@/lib/money'
import { setPrize, type PrizeState } from './actions'

/**
 * What a box is worth.
 *
 * The one number on this site that everything else is arranged around: it is on
 * the front page, on every box, in the terms, and it is what gets paid out —
 * twice — when somebody wins. So this card is careful in the same two ways the
 * box limit above it is.
 *
 * `current` is null when the settings row or the prize column could not be
 * read. That is a database without 0012 applied, not a prize of nothing, and
 * the card says which rather than showing a confident figure nobody set. What
 * is quoted on the public pages in that state is the fallback in `money.ts`.
 *
 * `stillOpen` is the part an operator will actually want. Changing the prize
 * changes what the *next* box is worth; boxes that already exist keep the
 * amount they were made with, because that amount is what everybody currently
 * playing them was promised. Left unsaid, that reads as the setting not having
 * worked. So the boxes still carrying another figure are listed, with their
 * number, right under the form.
 */
export function PrizeAmount({
  current,
  stillOpen,
  unreadable,
}: {
  current: number | null
  stillOpen: { prize: number; count: number }[]
  unreadable: string | null
}) {
  const [state, action] = useActionState<PrizeState, FormData>(setPrize, {})

  // The database's answer, never what was typed.
  const prize = state.saved ?? current
  const known = prize !== null

  const others = known ? stillOpen.filter((row) => row.prize !== prize) : stillOpen

  return (
    <Card>
      <p className="text-sm font-semibold">Prize on a box</p>
      <p className="mt-1 text-xs text-dusk">
        What a new box is worth. Paid twice when one is beaten — once to the winner, once to
        whoever made it.
      </p>

      <div className="mt-4 flex items-baseline gap-2">
        {known ? (
          <>
            <span className="tabular text-3xl font-bold text-gold">{naira(prize)}</span>
            <span className="text-mist">per box · {naira(prize * 2)} paid out when beaten</span>
          </>
        ) : (
          <span className="text-mist">
            not stored — pages are showing {naira(PRIZE_NAIRA)}
          </span>
        )}
      </div>

      {known ? null : (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            This database has no prize stored, so every box is made at the built-in{' '}
            {naira(PRIZE_NAIRA)}. Run the migration in <code>supabase/migrations</code> —
            0012_editable_prize.sql — then save an amount here. ({unreadable ?? 'no settings row'})
          </span>
        </p>
      )}

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">New prize (naira)</span>
          <input
            type="number"
            name="prize_naira"
            min={1}
            max={MAX_PRIZE_NAIRA}
            step={1}
            defaultValue={prize ?? PRIZE_NAIRA}
            inputMode="numeric"
            className="tabular h-11 w-40 rounded-xl border border-white/12 bg-black/30 px-3
                       text-base text-chalk focus:border-violet/60 focus:outline-none"
          />
        </label>
        {/* Button watches the form itself — no disabled, no swapped label. */}
        <Button type="submit" size="sm">
          Save prize
        </Button>
        {state.saved !== undefined ? (
          <span className="flex items-center gap-1.5 text-sm text-lime">
            <Check size={15} /> Saved {naira(state.saved)}
          </span>
        ) : null}
      </form>

      <p className="mt-2 text-xs text-dusk">
        Applies to boxes made from now on, up to {naira(MAX_PRIZE_NAIRA)}. A box that already
        exists keeps what it was made with — that figure is a promise to everyone playing it.
      </p>

      {others.length > 0 ? (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-mist">
          Still open on another amount:{' '}
          {others
            .map((row) => `${row.count} ${row.count === 1 ? 'box' : 'boxes'} at ${naira(row.prize)}`)
            .join(', ')}
          . Those pay out what they say.
        </p>
      ) : null}

      {state.problem ? (
        <div className="mt-3">
          <Problem>{state.problem}</Problem>
        </div>
      ) : null}
    </Card>
  )
}
