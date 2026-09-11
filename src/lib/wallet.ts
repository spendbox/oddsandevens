import 'server-only'
import { supabaseAdmin } from './supabase/admin'
import { verifyPayment } from './paystack'

/**
 * Turning a Paystack payment into coins.
 *
 * Two things can tell us a payment happened: the player's browser coming back
 * from checkout, and Paystack's webhook. Both call this, often within a second
 * of each other, and sometimes twice. Crediting the same payment twice would be
 * giving away coins, so the whole function is built to be safe to run again:
 *
 *   1. Paystack is asked directly. Never take the browser's word for it.
 *   2. The amount is checked against what we asked for.
 *   3. The topup row is flipped to success in one conditional update. Exactly
 *      one caller can win that. Everyone else stops there.
 *   4. Only the winner adds the coins.
 *
 * A row already marked 'failed' is claimed too, and that is deliberate. A
 * failure is a guess about money that had not arrived yet; money arriving is a
 * fact. Where the two disagree the money wins, and a player whose payment was
 * written off early still gets the coins they paid for when it lands.
 */
export type CreditResult =
  | { ok: true; coins: number; alreadyCredited: boolean }
  | { ok: false; reason: string }

export async function creditTopup(reference: string): Promise<CreditResult> {
  const admin = supabaseAdmin()

  const { data: topup } = await admin
    .from('topups')
    .select('*')
    .eq('reference', reference)
    .maybeSingle()

  if (!topup) return { ok: false, reason: 'We have no record of that payment.' }
  if (topup.status === 'success') {
    return { ok: true, coins: topup.coins, alreadyCredited: true }
  }

  const payment = await verifyPayment(reference)

  if (payment.status !== 'success') {
    // 'failed' and 'reversed' are verdicts about the money. Everything else —
    // 'abandoned' above all, which is what verify calls a transfer nobody has
    // made yet — is a payment still in progress, and writing it off here is how
    // a row stops being able to take the money when it does arrive.
    if (payment.status === 'failed' || payment.status === 'reversed') {
      await admin
        .from('topups')
        .update({ status: 'failed' })
        .eq('reference', reference)
        .eq('status', 'pending')
    }

    return { ok: false, reason: `Paystack says this payment ${payment.status}.` }
  }

  // Paystack lets the amount be edited on its own checkout page in some setups,
  // so pay out coins for what actually arrived, not what we hoped for.
  if (payment.amount < topup.amount_kobo) {
    await admin
      .from('topups')
      .update({ status: 'failed' })
      .eq('reference', reference)
      .eq('status', 'pending')

    return { ok: false, reason: 'The amount paid was less than the amount due.' }
  }

  // Paystack has confirmed the money. Anything not already credited is claimed
  // — a row an earlier verdict wrote off included; see above. Still one update,
  // so still exactly one winner.
  const { data: claimed } = await admin
    .from('topups')
    .update({ status: 'success', paid_at: new Date().toISOString() })
    .eq('reference', reference)
    .in('status', ['pending', 'failed'])
    .select('*')
    .maybeSingle()

  // Somebody else got there first — the webhook and the browser racing. Their
  // call added the coins; ours must not add them again.
  if (!claimed) return { ok: true, coins: topup.coins, alreadyCredited: true }

  const { error } = await admin.rpc('add_coins', {
    p_user: claimed.user_id,
    p_coins: claimed.coins,
    p_kind: 'topup',
    p_memo: `Bought ${claimed.coins} coins`,
  })

  if (error) {
    // The money is real and the row says paid, so leaving it is the safer
    // failure: it can be topped up by hand, whereas rolling back would lose it.
    return { ok: false, reason: 'Payment received, but crediting the coins failed.' }
  }

  return { ok: true, coins: claimed.coins, alreadyCredited: false }
}
