import 'server-only'
import { headers } from 'next/headers'
import { supabaseAdmin } from './supabase/admin'

/**
 * The free coin every player starts with, and the connection it came from.
 *
 * A go at a box costs a coin, so a brand new account could not play at all
 * until it had paid — which is the wrong first minute for somebody who tapped a
 * link promising a game. Everybody gets one coin, once.
 *
 * The whole decision lives in `grant_welcome_coin` in
 * supabase/migrations/0014_welcome_coin.sql: how many coins, whether this player
 * has had theirs, and whether this connection has had its share. Nothing here
 * decides any of it, and nothing here is passed up from a browser. This file
 * works out the one fact the database cannot see for itself — where the request
 * came from — and reports what happened.
 */

/** Why a coin was not given, said in a way an operator can act on. */
const REASONS: Record<string, string> = {
  off: 'the free coin is switched off in settings',
  already: 'they have already had theirs',
  ip: 'this connection has claimed its limit',
  'no profile': 'there is no profile row to credit',
}

/**
 * The address this request came from, as far as it can be trusted.
 *
 * Read in order of how hard each header is to lie about. `x-vercel-forwarded-for`
 * is written by Vercel's own edge and a browser cannot set it. `x-forwarded-for`
 * is a list that proxies append to, so the LAST entry is the one closest to us
 * and the only one a client cannot choose — reading the first entry, which is
 * the usual mistake, means anybody can claim a fresh connection for every
 * account by typing one header.
 *
 * Never throws and never blocks anything. An unknown address is an empty string,
 * which the database treats as "do not count this against anybody" — a player
 * must not lose their coin because a header was missing.
 */
export async function clientIp(): Promise<string> {
  try {
    const head = await headers()

    const vercel = head.get('x-vercel-forwarded-for')
    if (vercel) return normalise(vercel.split(',').pop() ?? '')

    const real = head.get('x-real-ip')
    if (real) return normalise(real)

    const forwarded = head.get('x-forwarded-for')
    if (forwarded) return normalise(forwarded.split(',').pop() ?? '')

    return ''
  } catch {
    // headers() is not available in every rendering context, and a free coin is
    // never worth failing a page over.
    return ''
  }
}

/**
 * Give somebody their free coin, if they have one coming.
 *
 * Called the first time an account exists and nowhere else. Safe to call twice:
 * the grant is keyed on the player's id in the database, so a second call is a
 * no-op rather than a second coin.
 *
 * Never throws. Signing up must not fail because a giveaway did — so every
 * outcome, including the refusals, goes to the server log and nowhere near the
 * browser. A silent path here would be indistinguishable from a broken one, and
 * "nobody is getting their free coin" is exactly the sort of thing that goes
 * unnoticed for a month.
 */
export async function welcomeCoin(userId: string): Promise<number> {
  try {
    const ip = await clientIp()
    const admin = supabaseAdmin()

    const { data, error } = await admin
      .rpc('grant_welcome_coin', { p_user: userId, p_ip: ip })
      .maybeSingle()

    if (error) {
      console.warn(
        `[spendbox] could not give ${userId} their free coin: ${error.message}. ` +
          'If this database has not had 0014_welcome_coin.sql applied, that is why.',
      )
      return 0
    }

    const row = (data ?? {}) as { granted?: boolean; coins?: number; reason?: string }

    if (row.granted) {
      console.info(`[spendbox] gave ${userId} ${row.coins} free coin(s)`)
      return Number(row.coins ?? 0)
    }

    const reason = row.reason ?? 'unknown'
    console.info(
      `[spendbox] no free coin for ${userId}: ${REASONS[reason] ?? reason}` +
        (reason === 'ip' ? ` (${ip || 'unknown connection'})` : ''),
    )
    return 0
  } catch (error) {
    console.warn(
      '[spendbox] the free coin could not be given: ' +
        (error instanceof Error ? error.message : String(error)),
    )
    return 0
  }
}

/**
 * One address, reduced to the thing worth counting.
 *
 * A port is stripped: the same person on the same connection gets a new one
 * every request, and counting those would make the limit meaningless.
 *
 * An IPv6 address is cut down to the network it was handed out on — the first
 * four groups, the /64 that a home connection is given as a block. Left whole,
 * somebody on IPv6 can use a different address for every account without
 * touching anything, and the limit would never fire once.
 */
function normalise(raw: string): string {
  let value = raw.trim().toLowerCase()
  if (!value) return ''

  // [2001:db8::1]:443 — an IPv6 address with a port.
  if (value.startsWith('[')) {
    const close = value.indexOf(']')
    if (close > 0) value = value.slice(1, close)
  } else if (value.split(':').length === 2) {
    // Exactly one colon, so it is 1.2.3.4:5678 rather than an IPv6 address.
    value = value.split(':')[0]
  }

  // ::ffff:1.2.3.4 — IPv4 wearing an IPv6 hat.
  if (value.startsWith('::ffff:')) value = value.slice('::ffff:'.length)

  if (!value.includes(':')) return value

  return ipv6Network(value)
}

/** The /64 an IPv6 address sits in, with `::` expanded far enough to find it. */
function ipv6Network(value: string): string {
  const [head, tail] = value.split('::')
  const left = head ? head.split(':').filter(Boolean) : []

  let groups: string[]

  if (tail === undefined) {
    groups = left
  } else {
    const right = tail ? tail.split(':').filter(Boolean) : []
    const missing = Math.max(8 - left.length - right.length, 0)
    groups = [...left, ...Array<string>(missing).fill('0'), ...right]
  }

  if (groups.length < 4) return value

  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}
