import 'server-only'
import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from './supabase/env'
import { PRIZE_NAIRA } from './money'

/**
 * The numbers an admin can change without a deploy, read from the settings row.
 *
 * There is one of them so far — the prize — and the shape of this file is set
 * by two rules that already cost this codebase a deploy each.
 *
 * It never throws. The prize is quoted on the landing page, on box pages and in
 * the written pages, all of which are public and all of which have to render for
 * a stranger whatever state the deployment is in. A marketing number is never
 * worth a stack trace: without Supabase, or with the settings migrations not
 * applied, this hands back the figure in `money.ts` and the page is right about
 * everything except a change nobody has made yet.
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
