'use client'

import { useActionState, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button, Card, Problem } from '@/components/ui'
import {
  COINS_PER_PLAY,
  CHEAPEST_RETRY,
  MAX_NAIRA_PER_COIN,
  MIN_NAIRA_PER_COIN,
  MIN_TOPUP_COINS,
  NAIRA_PER_COIN,
  coinPriceProblem,
  coinWord,
  coinsToNaira,
  naira,
} from '@/lib/money'
import { setCoinPrice, type CoinPriceState } from './actions'

/**
 * What a coin costs.
 *
 * The only price on this site, and the one an operator will want to move
 * fastest — it is the answer to "is anybody actually buying these", and until
 * 0015 it was a constant in the code and therefore a deploy.
 *
 * The card is arranged around the fact that nobody buys one coin. The price
 * typed here is multiplied by five before it becomes a real payment, by twenty
 * five for the pack most people tap, so the figures underneath the box are what
 * a player is actually asked to transfer. A price that reads as sensible on its
 * own can be quietly absurd by the time it reaches somebody's banking app, and
 * this is the screen that has to say so before it does.
 *
 * `current` is null when the settings row or the column could not be read. That
 * is a database without 0015 applied, not a coin that costs nothing, and the
 * card says which rather than showing a confident figure nobody set. What is
 * being charged in that state is the fallback in `money.ts` — which is also
 * what every screen is quoting, so nothing is out of step; it just cannot be
 * changed from here yet.
 */
export function CoinPrice({
  current,
  held,
  unreadable,
}: {
  current: number | null
  /** Coins sitting in wallets right now, or null where nothing counted them. */
  held: number | null
  unreadable: string | null
}) {
  const [state, action] = useActionState<CoinPriceState, FormData>(setCoinPrice, {})

  // The database's answer, never what was typed.
  const price = state.saved ?? current
  const known = price !== null
  const showing = price ?? NAIRA_PER_COIN

  // What the number in the box would mean, updated as it is typed. The refusal
  // is the same function the action and the check constraint use, so the card
  // cannot promise a price that the save is about to turn down.
  const [typed, setTyped] = useState<string>(String(showing))

  // When a save comes back, the box shows what was stored rather than what was
  // typed — the same rule as the figure above it. They are usually the same
  // number; where they are not, the database is the one telling the truth.
  const [lastSaved, setLastSaved] = useState(state.saved)
  if (state.saved !== lastSaved) {
    setLastSaved(state.saved)
    if (state.saved !== undefined) setTyped(String(state.saved))
  }

  const wanted = Number(typed.replace(/[₦,\s]/g, ''))
  const preview = Number.isFinite(wanted) ? Math.floor(wanted) : NaN
  const refusal = Number.isNaN(preview) ? null : coinPriceProblem(preview)
  const previewable = !Number.isNaN(preview) && !refusal && preview !== showing

  return (
    <Card>
      <p className="text-sm font-semibold">Price of a coin</p>
      <p className="mt-1 text-xs text-dusk">
        What players pay for one coin. A go at a box is {coinWord(COINS_PER_PLAY)}, and coins
        are the only thing sold here.
      </p>

      <div className="mt-4 flex items-baseline gap-2">
        {known ? (
          <>
            <span className="tabular text-3xl font-bold text-gold">{naira(price)}</span>
            <span className="text-mist">
              per coin · {naira(coinsToNaira(MIN_TOPUP_COINS, price))} for the smallest top-up
            </span>
          </>
        ) : (
          <span className="text-mist">
            not stored — coins are being sold at {naira(NAIRA_PER_COIN)}
          </span>
        )}
      </div>

      {known ? null : (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            This database has no coin price stored, so coins are sold at the built-in{' '}
            {naira(NAIRA_PER_COIN)} and every screen quotes that. Run the migration in{' '}
            <code>supabase/migrations</code> — 0015_coin_price.sql — then save a price here. (
            {unreadable ?? 'no settings row'})
          </span>
        </p>
      )}

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">New price (naira per coin)</span>
          <input
            type="number"
            name="naira_per_coin"
            min={MIN_NAIRA_PER_COIN}
            max={MAX_NAIRA_PER_COIN}
            step={1}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            inputMode="numeric"
            className="tabular h-11 w-40 rounded-xl border border-white/12 bg-black/30 px-3
                       text-base text-chalk focus:border-violet/60 focus:outline-none"
          />
        </label>
        {/* Button watches the form itself — no disabled, no swapped label. */}
        <Button type="submit" size="sm">
          Save price
        </Button>
        {state.saved !== undefined ? (
          <span className="flex items-center gap-1.5 text-sm text-lime">
            <Check size={15} /> Saved {naira(state.saved)}
          </span>
        ) : null}
      </form>

      {/* What that price becomes by the time it reaches a bank app. Shown for
          the number being typed, because that is the one that needs checking. */}
      {previewable ? (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-mist">
          At {naira(preview)} a coin: a go at a box is{' '}
          <span className="tabular text-chalk">{naira(coinsToNaira(COINS_PER_PLAY, preview))}</span>
          , carrying on from a missed level is from{' '}
          <span className="tabular text-chalk">{naira(coinsToNaira(CHEAPEST_RETRY, preview))}</span>
          , and the smallest top-up anybody can make is{' '}
          <span className="tabular text-chalk">
            {naira(coinsToNaira(MIN_TOPUP_COINS, preview))}
          </span>
          .
        </p>
      ) : null}

      {refusal ? (
        <p className="mt-3 rounded-2xl border border-gold/25 bg-gold/8 px-4 py-3 text-sm text-gold">
          {refusal}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-dusk">
        Between {naira(MIN_NAIRA_PER_COIN)} and {naira(MAX_NAIRA_PER_COIN)} a coin. It changes
        every screen that quotes a price — the landing page, box pages, the wallet, the terms
        and How it works — the moment it is saved. A transfer somebody has already opened is
        honoured at the amount they were given.
      </p>

      {held !== null && held > 0 ? (
        <p className="mt-3 text-sm text-mist">
          <span className="tabular font-semibold text-chalk">{held.toLocaleString('en-NG')}</span>{' '}
          coins are sitting in wallets, bought at whatever they cost at the time. What they buy
          has not changed: a go at a box is {coinWord(COINS_PER_PLAY)} whatever a coin costs.
          This price is about buying coins, never about spending them.
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
