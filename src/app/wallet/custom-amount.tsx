'use client'

import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui'
import { MIN_TOPUP_COINS, NAIRA_PER_COIN, coinsToNaira, naira } from '@/lib/money'
import { startTopup } from './actions'

/**
 * Buying a number of coins you typed yourself.
 *
 * The naira total updates as you type. Coins are an invented currency, and
 * nobody should have to do ×100 in their head to find out what a box of them
 * costs — least of all on the screen immediately before being sent to a
 * payment page. What it says here is what Paystack will ask for.
 */
export function CustomAmount() {
  const [coins, setCoins] = useState(MIN_TOPUP_COINS)

  const tooFew = coins < MIN_TOPUP_COINS
  const tooMany = coins > 500
  const valid = !tooFew && !tooMany && Number.isFinite(coins)

  return (
    <form action={startTopup} className="grid gap-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-mist">Or another amount</span>
        <div className="flex items-center gap-3">
          <input
            type="number"
            name="coins"
            min={MIN_TOPUP_COINS}
            max={500}
            value={Number.isFinite(coins) ? coins : ''}
            onChange={(event) => setCoins(Number.parseInt(event.target.value, 10))}
            inputMode="numeric"
            className="tabular h-12 w-28 rounded-2xl border border-white/12 bg-black/30 px-4
                       text-base text-chalk focus:border-gold/60 focus:outline-none
                       focus:ring-2 focus:ring-gold/25"
          />
          <span className="text-sm text-mist">
            {coins === 1 ? 'coin' : 'coins'} × {naira(NAIRA_PER_COIN)}
          </span>
        </div>
      </label>

      {/* The number that actually matters. */}
      <div className="flex items-baseline justify-between rounded-2xl bg-black/30 px-4 py-3">
        <span className="text-sm text-mist">You pay on Paystack</span>
        <span className="tabular text-2xl font-bold text-gold">
          {valid ? naira(coinsToNaira(coins)) : '—'}
        </span>
      </div>

      {tooFew ? (
        <p className="text-sm text-rose">
          The smallest top-up is {MIN_TOPUP_COINS} coins ({naira(coinsToNaira(MIN_TOPUP_COINS))}).
        </p>
      ) : null}
      {tooMany ? (
        <p className="text-sm text-rose">That is more coins than we sell in one go. Try 500 or fewer.</p>
      ) : null}

      <Button type="submit" tone="gold" size="lg" disabled={!valid}>
        <CreditCard size={18} />
        {valid ? `Pay ${naira(coinsToNaira(coins))}` : 'Pay with Paystack'}
      </Button>
    </form>
  )
}
