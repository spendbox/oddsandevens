'use server'

import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { startCheckout, paymentsConfigured } from '@/lib/paystack'
import { siteOrigin } from '@/lib/site'
import { MIN_TOPUP_COINS, nairaToKobo, coinsToNaira } from '@/lib/money'

/**
 * Buy coins.
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
  if (coins > 500) redirect('/wallet?problem=maximum')

  const amountKobo = nairaToKobo(coinsToNaira(coins))
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
