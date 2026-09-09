'use client'

import { useActionState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button, Card, Problem } from '@/components/ui'
import { DEFAULT_MAX_BOXES } from '@/lib/money'
import { setBoxLimit, type LimitState } from './actions'

/**
 * The ceiling on how many boxes may exist, across everybody.
 *
 * Every box is a standing ₦100,000 promise — ₦200,000 once it is beaten — so
 * this is the platform's total exposure, and the one number worth being able to
 * change without waiting for a deploy.
 *
 * `current` is null when the settings row could not be read, and that is a
 * state this card has to show rather than paper over. It used to fall back to
 * zero, which read as "the limit is 0, everything is full" — a number nobody
 * set, describing a cap that in that state is not running at all, sitting above
 * a form that could not change it either. A limit that cannot be read is not a
 * limit of nothing; it is a database that has not had the settings migrations
 * applied, and saying so is the only thing that gets anybody to a fix.
 */
export function BoxLimit({
  current,
  used,
  unreadable,
}: {
  current: number | null
  used: number
  unreadable: string | null
}) {
  const [state, action] = useActionState<LimitState, FormData>(setBoxLimit, {})

  // What the database last told us: the value it stored on the most recent
  // save, or the one read with the page. Never what was typed.
  const limit = state.saved ?? current
  const known = limit !== null

  const share = !known || limit === 0 ? 0 : Math.min(100, (used / limit) * 100)
  const full = known && limit > 0 && used >= limit

  return (
    <Card>
      <p className="text-sm font-semibold">Box limit</p>
      <p className="mt-1 text-xs text-dusk">
        The most boxes that may exist in total. Nobody can create one past it.
      </p>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="tabular text-3xl font-bold">{used}</span>
        {known ? (
          <span className="text-mist">of {limit.toLocaleString('en-NG')} used</span>
        ) : (
          <span className="text-mist">so far — no limit is being enforced</span>
        )}
        {full ? <span className="ml-auto text-xs font-semibold text-rose">Full</span> : null}
      </div>

      {known ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={
              'h-full rounded-full transition-all ' +
              (share > 90 ? 'bg-rose' : share > 70 ? 'bg-gold' : 'bg-lime')
            }
            style={{ width: `${share}%` }}
          />
        </div>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            This database has no box limit stored, so nothing is stopping boxes being
            made. Run <code>supabase/migrations/0009_box_limit_default.sql</code> against
            it, then save a limit here. ({unreadable ?? 'no settings row'})
          </span>
        </p>
      )}

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">New limit</span>
          <input
            type="number"
            name="max_boxes"
            min={0}
            step={1}
            defaultValue={limit ?? DEFAULT_MAX_BOXES}
            inputMode="numeric"
            className="tabular h-11 w-32 rounded-xl border border-white/12 bg-black/30 px-3
                       text-base text-chalk focus:border-violet/60 focus:outline-none"
          />
        </label>
        {/* No `disabled` and no swapped label: Button watches the form itself,
            keeps its width, and dims to busy rather than to disabled. */}
        <Button type="submit" size="sm">
          Save limit
        </Button>
        {state.saved !== undefined ? (
          <span className="flex items-center gap-1.5 text-sm text-lime">
            <Check size={15} /> Saved {state.saved.toLocaleString('en-NG')}
          </span>
        ) : null}
      </form>

      <p className="mt-2 text-xs text-dusk">
        Starts at {DEFAULT_MAX_BOXES.toLocaleString('en-NG')}. Zero stops anybody creating a
        new box.
      </p>

      {state.problem ? (
        <div className="mt-3">
          <Problem>{state.problem}</Problem>
        </div>
      ) : null}
    </Card>
  )
}
