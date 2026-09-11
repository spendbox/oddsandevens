'use server'

import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { startCheckout, paymentsConfigured } from '@/lib/paystack'
import { siteOrigin } from '@/lib/site'
import { MAX_TOPUP_COINS, MIN_TOPUP_COINS, nairaToKobo, coinsToNaira } from '@/lib/money'
import { coinPriceForCharge } from '@/lib/settings'

/**
 * Buy coins with a card, on Paystack's own checkout page.
 *
 * The fallback, not the front door: /wallet opens a bank transfer in the page
 * itself (see api/pay/transfer), which is what most people here reach for and
 * what survives a connection too poor to load somebody else's checkout. This is
 * for the ones who would rather use a card, and for the days Paystack will not
 * open a transfer.
 *
 * The row goes in as 'pending' before the player leaves for Paystack, so that
 * whatever comes back — the browser, the webhook, or a support request three
 * days later — there is something with that reference to match it against.
 * Coins are added only once Paystack confirms; see lib/wallet.ts.
 */
export async function startTopup(formData: FormData) {
  const { profile } = await requireProfile()

  if (!paymentsConfigured()) redirect('/wallet?problem=setup')

  const requested = Number(formData.get('coins'))
  const coins = Number.isFinite(requested) ? Math.floor(requested) : 0

  if (coins < MIN_TOPUP_COINS) redirect('/wallet?problem=minimum')
  if (coins > MAX_TOPUP_COINS) redirect('/wallet?problem=maximum')

  // The price is read here, now, rather than taken from the page the player is
  // standing on. A wallet tab left open across an admin changing the price
  // would otherwise send somebody to Paystack for yesterday's amount, and the
  // amount is the one thing on this path the browser must not influence.
  //
  // It is also the one read on this page allowed to fail: `coinPriceForCharge`
  // falls back to the built-in price on a database that has not had 0015 run,
  // and throws when it simply could not find out — and a top-up retried in a
  // minute is a far smaller thing than one taken at a price nobody set.
  let nairaPerCoin: number
  try {
    nairaPerCoin = await coinPriceForCharge()
  } catch (error) {
    console.error('[spendbox] could not read the coin price for a card top-up', error)
    redirect('/wallet?problem=price')
  }

  const amountKobo = nairaToKobo(coinsToNaira(coins, nairaPerCoin))
  // Prefixed so it is obvious what it is when it turns up in Paystack's
  // dashboard next to everything else that account is doing.
  const reference = `sbx_${crypto.randomUUID().replace(/-/g, '')}`

  const admin = supabaseAdmin()
  const { error } = await admin.from('topups').insert({
    user_id: profile.id,
    coins,
    amount_kobo: amountKobo,
    reference,
  })

  if (error) redirect('/wallet?problem=start')

  const origin = await siteOrigin()

  let checkoutUrl: string
  try {
    const checkout = await startCheckout({
      email: profile.email,
      amountKobo,
      reference,
      callbackUrl: `${origin}/wallet/return`,
    })
    checkoutUrl = checkout.authorization_url
  } catch {
    await admin.from('topups').update({ status: 'failed' }).eq('reference', reference)
    redirect('/wallet?problem=paystack')
  }

  redirect(checkoutUrl)
}
