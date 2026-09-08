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
 *    is still in the middle of making.
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
  if (topup.status === 'failed') {
    return Response.json({ state: 'failed' })
  }

  try {
    const charge = await chargeStatus(reference)

    if (charge === 'failed') {
      await admin
        .from('topups')
        .update({ status: 'failed' })
        .eq('reference', reference)
        .eq('status', 'pending')
      return Response.json({ state: 'failed' })
    }

    if (charge !== 'success') return Response.json({ state: 'waiting' })

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
