'use client'

import { useActionState } from 'react'
import { Check } from 'lucide-react'
import { Button, Card, Problem } from '@/components/ui'
import { setBoxLimit, type LimitState } from './actions'

/**
 * The ceiling on how many boxes may exist, across everybody.
 *
 * Every box is a standing ₦100,000 promise — ₦200,000 once it is beaten — so
 * this is the platform's total exposure, and the one number worth being able to
 * change without waiting for a deploy.
 */
export function BoxLimit({ current, used }: { current: number; used: number }) {
  const [state, action, pending] = useActionState<LimitState, FormData>(setBoxLimit, {})

  const limit = state.saved ?? current
  const share = limit === 0 ? 100 : Math.min(100, (used / limit) * 100)
  const full = used >= limit

  return (
    <Card>
      <p className="text-sm font-semibold">Box limit</p>
      <p className="mt-1 text-xs text-dusk">
        The most boxes that may exist in total. Nobody can create one past it.
      </p>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="tabular text-3xl font-bold">{used}</span>
        <span className="text-mist">of {limit} used</span>
        {full ? <span className="ml-auto text-xs font-semibold text-rose">Full</span> : null}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={
            'h-full rounded-full transition-all ' +
            (share > 90 ? 'bg-rose' : share > 70 ? 'bg-gold' : 'bg-lime')
          }
          style={{ width: `${share}%` }}
        />
      </div>

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">New limit</span>
          <input
            type="number"
            name="max_boxes"
            min={0}
            defaultValue={limit}
            inputMode="numeric"
            className="tabular h-11 w-28 rounded-xl border border-white/12 bg-black/30 px-3
                       text-base text-chalk focus:border-violet/60 focus:outline-none"
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save limit'}
        </Button>
        {state.saved !== undefined ? (
          <span className="flex items-center gap-1.5 text-sm text-lime">
            <Check size={15} /> Saved
          </span>
        ) : null}
      </form>

      {state.problem ? (
        <div className="mt-3">
          <Problem>{state.problem}</Problem>
        </div>
      ) : null}
    </Card>
  )
}
