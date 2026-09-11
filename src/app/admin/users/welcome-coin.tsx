'use client'

import { useActionState } from 'react'
import { Check, Gift, TriangleAlert } from 'lucide-react'
import { Button, Card, Problem } from '@/components/ui'
import {
  MAX_WELCOME_COINS,
  MAX_WELCOME_PER_IP,
  WELCOME_COINS,
  coinWord,
  naira,
  coinsToNaira,
} from '@/lib/money'
import { setWelcomeRules, type WelcomeState } from './actions'

export type Connection = { ip: string; claims: number; coins: number }

/**
 * The free coin, and the limit that keeps it from being farmed.
 *
 * Both numbers in one card because they are one decision. The coin is what
 * makes a brand new player's first go cost nothing; the limit is the only thing
 * between that and forty accounts made on one phone for forty free shots at the
 * prize.
 *
 * The busiest connections are shown underneath, because the limit is unusual
 * among settings in that being wrong is invisible from the number alone. Set
 * too low it does not look broken — it just quietly stops giving coins to a
 * hostel, and the only sign is a connection sitting exactly on the limit.
 *
 * `current` is null when the settings row or these columns could not be read.
 * That is a database without 0014 applied, not a free coin of nothing, and the
 * card says which rather than showing a confident figure nobody set.
 */
export function WelcomeCoin({
  current,
  perIp,
  nairaPerCoin,
  given,
  claims,
  connections,
  unreadable,
}: {
  current: number | null
  perIp: number | null
  /** What a coin costs today, so what has been given away can be priced. */
  nairaPerCoin: number
  /** Coins handed out so far, in total. */
  given: number
  /** How many players have had theirs. */
  claims: number
  connections: Connection[]
  unreadable: string | null
}) {
  const [state, action] = useActionState<WelcomeState, FormData>(setWelcomeRules, {})

  // The database's answer, never what was typed.
  const coins = state.saved?.coins ?? current
  const limit = state.saved?.maxPerIp ?? perIp
  const known = coins !== null && limit !== null

  const atLimit = known ? connections.filter((row) => row.claims >= limit).length : 0

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Gift size={15} className="text-gold" /> Free coin to start
      </p>
      <p className="mt-1 text-xs text-dusk">
        What every new player is given, once, so their first go at a box costs them nothing.
        Everybody who already had an account got theirs when the migration ran.
      </p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {known ? (
          <>
            <span className="tabular text-3xl font-bold text-gold">
              {coins === 0 ? 'Off' : coinWord(coins)}
            </span>
            <span className="text-mist">
              {coins === 0
                ? '— new players start with an empty wallet'
                : `each · ${limit} per connection`}
            </span>
          </>
        ) : (
          <span className="text-mist">
            not stored — the built-in {coinWord(WELCOME_COINS)} applies
          </span>
        )}
      </div>

      {known ? null : (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            This database has no free coin stored, so nobody is being given one. Run the
            migration in <code>supabase/migrations</code> — 0014_welcome_coin.sql — which also
            gives every player already here theirs. ({unreadable ?? 'no settings row'})
          </span>
        </p>
      )}

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">Free coins</span>
          <input
            type="number"
            name="welcome_coins"
            min={0}
            max={MAX_WELCOME_COINS}
            step={1}
            defaultValue={coins ?? WELCOME_COINS}
            inputMode="numeric"
            className="tabular h-11 w-24 rounded-xl border border-white/12 bg-black/30 px-3
                       text-base text-chalk focus:border-violet/60 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-mist">Per connection</span>
          <input
            type="number"
            name="welcome_max_per_ip"
            min={1}
            max={1000}
            step={1}
            defaultValue={limit ?? MAX_WELCOME_PER_IP}
            inputMode="numeric"
            className="tabular h-11 w-24 rounded-xl border border-white/12 bg-black/30 px-3
                       text-base text-chalk focus:border-violet/60 focus:outline-none"
          />
        </label>
        <Button type="submit" size="sm">
          Save
        </Button>
        {state.saved ? (
          <span className="flex items-center gap-1.5 text-sm text-lime">
            <Check size={15} /> Saved
          </span>
        ) : null}
      </form>

      <p className="mt-2 text-xs text-dusk">
        Zero free coins switches it off entirely, prose included. One connection must be
        allowed at least one — homes, hostels and whole mobile networks share an address here,
        so a tight limit turns honest players away long before it stops anybody farming.
      </p>

      {claims > 0 ? (
        <p className="mt-3 text-sm text-mist">
          <span className="tabular font-semibold text-chalk">{claims.toLocaleString('en-NG')}</span>{' '}
          {claims === 1 ? 'player has' : 'players have'} had one —{' '}
          <span className="tabular">{given.toLocaleString('en-NG')}</span> coins given away,
          worth {naira(coinsToNaira(given, nairaPerCoin))} if they had been bought today.
        </p>
      ) : null}

      {connections.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
          <p className="text-xs font-semibold tracking-wider text-dusk uppercase">
            Connections claiming more than one
          </p>
          <ul className="mt-2 grid gap-1.5">
            {connections.map((row) => (
              <li key={row.ip} className="flex items-center justify-between gap-3 text-sm">
                <span className="tabular truncate font-mono text-xs text-mist">{row.ip}</span>
                <span
                  className={
                    'tabular shrink-0 text-xs ' +
                    (known && row.claims >= limit ? 'text-gold' : 'text-dusk')
                  }
                >
                  {row.claims} accounts
                  {known && row.claims >= limit ? ' · at the limit' : ''}
                </span>
              </li>
            ))}
          </ul>
          {atLimit > 0 ? (
            <p className="mt-2 text-xs text-dusk">
              {atLimit === 1 ? 'One connection is' : `${atLimit} connections are`} on the limit
              and getting no more free coins. If that is a shared address rather than somebody
              farming, raise the number.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.problem ? (
        <div className="mt-3">
          <Problem>{state.problem}</Problem>
        </div>
      ) : null}
    </Card>
  )
}
