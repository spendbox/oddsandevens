import 'server-only'
import { supabaseAdmin } from './supabase/admin'
import { STATS_BASELINE } from './money'

/**
 * The two numbers on the front page: boxes made, and money paid out.
 *
 * Both are the launch baseline plus what has actually happened — so a new box
 * moves the first, and an admin ticking a payout as paid moves the second.
 * Only payouts marked paid count; money that is owed but not yet transferred
 * has not been paid out, and saying otherwise on a public page would be a
 * claim we cannot stand behind.
 */
export type SiteStats = { boxes: number; paidOut: number }

export async function siteStats(): Promise<SiteStats> {
  const admin = supabaseAdmin()

  const [boxes, payouts] = await Promise.all([
    admin.from('boxes').select('*', { count: 'exact', head: true }),
    admin.from('payouts').select('amount_naira').eq('status', 'paid'),
  ])

  const paid = (payouts.data ?? []).reduce(
    (total, row) => total + (row.amount_naira ?? 0),
    0,
  )

  return {
    boxes: STATS_BASELINE.boxes + (boxes.count ?? 0),
    paidOut: STATS_BASELINE.paidOutNaira + paid,
  }
}
