import 'server-only'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv, supabaseEnv } from './supabase/env'
import { NAIRA_PER_COIN, PRIZE_NAIRA, WELCOME_COINS } from './money'

/**
 * The numbers an admin can change without a deploy, read from the settings row.
 *
 * The prize, the free coin and the price of a coin so far, and the shape of
 * this file is set by two rules that already cost this codebase a deploy each.
 *
 * It never throws — with one exception at the foot of the file, which is the
 * read a payment depends on and says so at length. The prize is quoted on the
 * landing page, on box pages and in the written pages, all of which are public
 * and all of which have to render for a stranger whatever state the deployment
 * is in. A marketing number is never worth a stack trace: without Supabase, or
 * with the settings migrations not applied, this hands back the figure in
 * `money.ts` and the page is right about everything except a change nobody has
 * made yet.
 *
 * And it reads through the anon key rather than the service role. The settings
 * row is readable by anyone — the policy in 0008 says so, because a creator has
 * to be told when boxes have run out — so there is no reason for a public page
 * to reach for the key that ignores row level security, and every reason not to.
 */

/** The value that stands in when the table cannot be read. */
const FALLBACK = { prizeNaira: PRIZE_NAIRA }

export type LiveSettings = { prizeNaira: number }

/**
 * `cache` is React's per-request memo, not a cross-request one: several
 * components on the same page asking for the prize make one round trip, and the
 * next request reads the table again. An admin who changes the prize sees it on
 * their next page load, which is the whole point of it not being a constant.
 */
export const liveSettings = cache(async (): Promise<LiveSettings> => {
  const env = readSupabaseEnv()
  if (!env.ok) return FALLBACK

  try {
    const supabase = createClient(env.settings.url, env.settings.key, {
      auth: { persistSession: false },
    })

    const { data } = await supabase.from('settings').select('prize_naira').maybeSingle()
    const prize = data?.prize_naira

    // A prize of zero or a missing column is a database that has not had 0012
    // applied, not somebody's decision. Fall back rather than telling a reader
    // that a box is worth nothing.
    return typeof prize === 'number' && prize > 0 ? { prizeNaira: prize } : FALLBACK
  } catch {
    return FALLBACK
  }
})

/** What a box made right now is worth. */
export async function livePrize(): Promise<number> {
  return (await liveSettings()).prizeNaira
}

/**
 * How many coins a new player is given, as the settings row says.
 *
 * Asked for on its own rather than added to the select above, and that is not
 * tidiness — a column that does not exist yet fails the whole query it is named
 * in. Reading the two together would mean a database without 0014 applied
 * showed the prize as unreadable as well, and the prize is quoted on the
 * landing page and on every box. The same reasoning splits these two reads on
 * /admin/users.
 *
 * Falls back to the figure in `money.ts` and never throws, for the same reason
 * the prize does: the only thing this number is used for is a sentence, and a
 * sentence is never worth a stack trace.
 */
export const liveWelcomeCoins = cache(async (): Promise<number> => {
  const env = readSupabaseEnv()
  if (!env.ok) return WELCOME_COINS

  try {
    const supabase = createClient(env.settings.url, env.settings.key, {
      auth: { persistSession: false },
    })

    const { data } = await supabase.from('settings').select('welcome_coins').maybeSingle()
    const coins = data?.welcome_coins

    // Zero is a real answer here, unlike the prize: an admin may switch the
    // free coin off, and every screen that mentions it drops the sentence
    // rather than promising something nobody will get.
    return typeof coins === 'number' && coins >= 0 ? coins : WELCOME_COINS
  } catch {
    return WELCOME_COINS
  }
})

/**
 * What one coin costs, as the settings row says.
 *
 * Its own read, for the third time and for the same reason as the free coin
 * above: a column that does not exist yet fails the whole query it is named in,
 * and this is the newest of them. Reading it alongside the prize would mean a
 * database without 0015 applied showing the prize as unreadable too — and the
 * prize is quoted on the landing page and on every box link.
 *
 * Falls back to the figure in `money.ts` and never throws. Every public page
 * quotes this price, so the reasoning is the prize's exactly: without Supabase,
 * or with 0015 not applied, the page shows the price this deployment is
 * actually charging, which is the built-in one.
 *
 * The one caller that must not accept a guess is the one about to take money —
 * see `coinPriceForCharge()` below.
 */
export const liveCoinPrice = cache(async (): Promise<number> => {
  const env = readSupabaseEnv()
  if (!env.ok) return NAIRA_PER_COIN

  try {
    const supabase = createClient(env.settings.url, env.settings.key, {
      auth: { persistSession: false },
    })

    const { data } = await supabase.from('settings').select('naira_per_coin').maybeSingle()
    const price = data?.naira_per_coin

    // Zero is not an answer, the way it is for the free coin: a coin that costs
    // nothing is a payment of nothing, which no gateway will open. A zero or a
    // missing column is a database without 0015, not somebody's decision.
    return typeof price === 'number' && price > 0 ? price : NAIRA_PER_COIN
  } catch {
    return NAIRA_PER_COIN
  }
})

/**
 * The same price, for the two paths that are about to charge somebody.
 *
 * Everything else on this page reports rather than throws, because everything
 * else is a sentence and a sentence is never worth a stack trace. This one
 * hands a figure to Paystack, and the two failures behind a fallback are not
 * the same failure at all:
 *
 *   * The migration has not been applied — no settings row, no column, no
 *     table. Then ₦100 is not a guess, it is this deployment's actual price,
 *     the one every screen is quoting, and the payment should go ahead at it.
 *
 *   * The read itself failed — Supabase unreachable, a timeout, a key rotated
 *     out from under the deployment. Then nobody knows what a coin costs right
 *     now, and opening a payment anyway means charging a price that may be
 *     months out of date. Both callers already have a "we could not start that
 *     payment, try again" path, and a top-up that has to be retried in a minute
 *     is a far smaller thing than one taken at the wrong price.
 *
 * Not cached: `cache` is per-request, and the only two callers do one of these
 * each. It reads through `supabaseEnv()`, which throws, rather than
 * `readSupabaseEnv()`, which reports — this is a caller holding a coin.
 */
export async function coinPriceForCharge(): Promise<number> {
  const { url, key } = supabaseEnv()

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase.from('settings').select('naira_per_coin').maybeSingle()

  if (error) {
    // PGRST202/42883: no function. PGRST205/42P01: no table. 42703: no column.
    // All of them mean 0015 has not been run here, which is a deployment
    // selling coins at the built-in price rather than a broken read.
    const missing =
      ['PGRST202', 'PGRST205', '42883', '42P01', '42703'].includes(error.code ?? '') ||
      /could not find the (function|table|column)/i.test(error.message ?? '')

    if (missing) return NAIRA_PER_COIN

    throw new Error(`could not read the coin price: ${error.message}`)
  }

  const price = data?.naira_per_coin
  return typeof price === 'number' && price > 0 ? price : NAIRA_PER_COIN
}
