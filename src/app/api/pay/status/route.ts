import { optionalProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { chargeStatus } from '@/lib/paystack'
import { creditTopup } from '@/lib/wallet'
import type { Topup } from '@/lib/types'

/**
 * Has the money arrived?
 *
 * The screen asks this every few seconds while it waits. Three things about it
 * are deliberate:
 *
 *  - The reference is looked up with the user id in the WHERE clause. A
 *    reference is a short string in somebody's browser history; it must not be
 *    a way to watch, or finish, another person's payment.
 *  - Paystack is asked, never the browser. The answer here comes from the same
 *    place the webhook's does, and the coins are added by the same idempotent
 *    function, so the two racing is a non-event.
 *  - A pending charge is left pending. It is the webhook, or the next poll,
 *    that will settle it — nothing here writes 'failed' onto a payment somebody
 *    is still in the middle of making. That is not a preference. A row written
 *    'failed' is not a message, it is a decision: crediting claims the row out
 *    of 'pending', so a transfer failed by a poll and then actually paid was a
 *    player's money arriving into a row that could no longer take it. This path
 *    can say 'paid' and it can say 'waiting'. It cannot say 'failed'.
 */
export async function POST(request: Request) {
  const profile = await optionalProfile()
  if (!profile) return Response.json({ problem: 'Sign in first.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { reference?: unknown } | null
  const reference = typeof body?.reference === 'string' ? body.reference : ''
  if (!reference) return Response.json({ problem: 'No payment given.' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data } = await admin
    .from('topups')
    .select('*')
    .eq('reference', reference)
    .eq('user_id', profile.id)
    .maybeSingle()

  const topup = data as Topup | null
  if (!topup) return Response.json({ problem: 'No such payment.' }, { status: 404 })

  // Already settled — by the webhook, by an earlier poll, or by the player
  // paying twice in two tabs. Nothing left to ask Paystack.
  if (topup.status === 'success') {
    return Response.json({ state: 'paid', coins: topup.coins })
  }
  // A row marked 'failed' is still asked about rather than answered from here.
  // The verdict was written before the money arrived, and if Paystack now says
  // it did arrive, the money outranks the verdict and creditTopup will take the
  // row back. Only when Paystack agrees it failed is the player told so.

  try {
    const charge = await chargeStatus(reference)

    if (charge !== 'success') {
      // Including a charge Paystack has given up on. The account is open until
      // its own clock says otherwise, the webhook is behind all of this, and a
      // verdict on somebody's money is not this path's to give — so the honest
      // answer to "has it landed" is still no, and the row is left alone. A
      // transfer that never arrives stays pending and is counted as pending on
      // /admin/transactions, which is where money asked for and never received
      // is supposed to show up.
      //
      // The one failure reported from here is one that was already written on
      // the row by something entitled to write it. This asks Paystack first
      // precisely so that such a row can still be taken back if the money is
      // in fact there.
      if (charge === 'failed' && topup.status === 'failed') {
        return Response.json({ state: 'failed' })
      }
      return Response.json({ state: 'waiting' })
    }

    const credited = await creditTopup(reference)

    if (!credited.ok) {
      console.warn(`[spendbox] transfer ${reference} landed but did not credit: ${credited.reason}`)
      return Response.json({ state: 'problem', problem: credited.reason })
    }

    return Response.json({ state: 'paid', coins: credited.coins })
  } catch (error) {
    // Paystack being unreachable for one poll is not news. Say "still waiting"
    // and let the next one ask again — the webhook is the safety net either way.
    console.warn(
      `[spendbox] could not check transfer ${reference}: ` +
        (error instanceof Error ? error.message : String(error)),
    )
    return Response.json({ state: 'waiting' })
  }
}
