import 'server-only'
import { supabaseAdmin } from './supabase/admin'
import type { Box, Payout, Topup } from './types'

/**
 * The numbers the admin screens are made of, counted by the database.
 *
 * Everything here goes through the functions in
 * supabase/migrations/0013_admin_insights.sql rather than pulling rows into the
 * app and adding them up, for one reason: PostgREST hands back a page of rows,
 * not a table. A dashboard that sums what it was handed is right until the
 * thousandth payment and then stops growing without saying so, which is how a
 * site ends up confidently reporting last quarter's income forever.
 *
 * A database that has not had 0013 applied is not a broken one. The totals fall
 * back to the old row-by-row sum and are marked as approximate; the two lists —
 * who is spending, and which box is being played — say plainly that a migration
 * is missing rather than showing a number nobody counted.
 */

/** The name of the migration, in one place, because three screens name it. */
export const INSIGHTS_MIGRATION = '0013_admin_insights.sql'

/** A row of anything, or the reason there isn't one. */
export type Insight<Row> =
  | { ok: true; rows: Row[] }
  | { ok: false; needsMigration: boolean; problem: string }

/**
 * Is this error "the database has not been brought up to date", as opposed to
 * "the database said no"?
 *
 * Same list of codes as the prize check on /admin/users, and for the same
 * reason: a missing function, table or column all mean a migration has not been
 * run, and telling somebody to run it is a great deal more use than showing
 * them what Postgres calls it.
 */
function missingPiece(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const code = error.code ?? ''
  const message = error.message ?? ''

  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === '42P01' ||
    code === '42703' ||
    /could not find the (function|table|column)/i.test(message)
  )
}

function failed<Row>(error: { code?: string; message?: string }): Insight<Row> {
  return {
    ok: false,
    needsMigration: missingPiece(error),
    problem: error.message || 'the database refused the question.',
  }
}

const number = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0))

/* ------------------------------------------------------------------------- */
/* Money                                                                      */
/* ------------------------------------------------------------------------- */

export type MoneySnapshot = {
  players: number
  payingPlayers: number
  coinsSold: number
  nairaIn: number
  payments: number
  nairaPending: number
  paymentsPending: number
  nairaFailed: number
  paymentsFailed: number
  coinsSpent: number
  coinsHeld: number
  /** Coins handed out rather than sold: the welcome coin, and any other bonus. */
  coinsGiven: number
  /** How many players have been given their welcome coin. */
  welcomeClaims: number
  nairaOwed: number
  nairaPaid: number
  boxesTotal: number
  boxesOpen: number
  boxesWon: number
  games: number
  playersWhoPlayed: number
  /**
   * True when Postgres counted these over the whole table. False when 0013 is
   * missing and the app added up the page of rows it was given — in which case
   * the screen has to say so, because an undercount that looks like a total is
   * worse than no total at all.
   */
  exact: boolean
}

export async function moneySnapshot(): Promise<MoneySnapshot> {
  const admin = supabaseAdmin()

  const { data, error } = await admin.rpc('admin_money_snapshot').maybeSingle()

  if (!error && data) {
    const row = data as Record<string, unknown>
    return {
      players: number(row.players),
      payingPlayers: number(row.paying_players),
      coinsSold: number(row.coins_sold),
      nairaIn: number(row.naira_in),
      payments: number(row.payments),
      nairaPending: number(row.naira_pending),
      paymentsPending: number(row.payments_pending),
      nairaFailed: number(row.naira_failed),
      paymentsFailed: number(row.payments_failed),
      coinsSpent: number(row.coins_spent),
      coinsHeld: number(row.coins_held),
      coinsGiven: number(row.coins_given),
      welcomeClaims: number(row.welcome_claims),
      nairaOwed: number(row.naira_owed),
      nairaPaid: number(row.naira_paid),
      boxesTotal: number(row.boxes_total),
      boxesOpen: number(row.boxes_open),
      boxesWon: number(row.boxes_won),
      games: number(row.games),
      playersWhoPlayed: number(row.players_who_played),
      exact: true,
    }
  }

  return approximateSnapshot()
}

/**
 * The old way, kept for a database that is one migration behind.
 *
 * The counts are exact — `head: true` with an exact count asks Postgres for the
 * number and brings back no rows — and only the sums are capped at whatever
 * page of rows comes back. That is why `exact` is false and why the screen
 * prints a line about it rather than quietly showing the smaller figure.
 */
async function approximateSnapshot(): Promise<MoneySnapshot> {
  const admin = supabaseAdmin()

  const [players, boxesTotal, boxesOpen, boxesWon, games, topups, payouts, wallets] =
    await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }),
      admin.from('boxes').select('*', { count: 'exact', head: true }),
      admin.from('boxes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      admin.from('boxes').select('*', { count: 'exact', head: true }).eq('status', 'won'),
      admin.from('attempts').select('*', { count: 'exact', head: true }),
      admin.from('topups').select('user_id, coins, amount_kobo, status'),
      admin.from('payouts').select('amount_naira, status'),
      admin.from('profiles').select('coins'),
    ])

  const rows = (topups.data ?? []) as Pick<
    Topup,
    'user_id' | 'coins' | 'amount_kobo' | 'status'
  >[]
  const paid = rows.filter((row) => row.status === 'success')
  const pending = rows.filter((row) => row.status === 'pending')
  const bounced = rows.filter((row) => row.status === 'failed')
  const kobo = (list: typeof rows) => list.reduce((sum, row) => sum + row.amount_kobo, 0) / 100

  const owedRows = (payouts.data ?? []) as Pick<Payout, 'amount_naira' | 'status'>[]
  const money = (status: Payout['status']) =>
    owedRows
      .filter((row) => row.status === status)
      .reduce((sum, row) => sum + row.amount_naira, 0)

  return {
    players: players.count ?? 0,
    payingPlayers: new Set(paid.map((row) => row.user_id)).size,
    coinsSold: paid.reduce((sum, row) => sum + row.coins, 0),
    nairaIn: kobo(paid),
    payments: paid.length,
    nairaPending: kobo(pending),
    paymentsPending: pending.length,
    nairaFailed: kobo(bounced),
    paymentsFailed: bounced.length,
    // Without the migration there is no cheap way to add up the ledger, and a
    // guess at coins spent or given away is not worth having. Nothing on screen
    // quotes any of these three unless the snapshot is exact.
    coinsSpent: 0,
    coinsGiven: 0,
    welcomeClaims: 0,
    coinsHeld: ((wallets.data ?? []) as { coins: number }[]).reduce(
      (sum, row) => sum + row.coins,
      0,
    ),
    nairaOwed: money('pending'),
    nairaPaid: money('paid'),
    boxesTotal: boxesTotal.count ?? 0,
    boxesOpen: boxesOpen.count ?? 0,
    boxesWon: boxesWon.count ?? 0,
    games: games.count ?? 0,
    playersWhoPlayed: 0,
    exact: false,
  }
}

/* ------------------------------------------------------------------------- */
/* Who is spending                                                            */
/* ------------------------------------------------------------------------- */

export type Spender = {
  userId: string
  email: string
  displayName: string
  /** Money in, in naira. Successful payments only. */
  nairaIn: number
  coinsBought: number
  payments: number
  /** Coins gone from the wallet: games started and retries bought. */
  coinsSpent: number
  coinsLeft: number
  firstPaidAt: string | null
  lastPaidAt: string | null
}

export async function topSpenders(limit = 20): Promise<Insight<Spender>> {
  const admin = supabaseAdmin()

  const { data, error } = await admin.rpc('admin_top_spenders', { p_limit: limit })
  if (error) return failed<Spender>(error)

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    userId: String(row.user_id),
    email: String(row.email ?? ''),
    displayName: String(row.display_name ?? ''),
    nairaIn: number(row.naira_in),
    coinsBought: number(row.coins_bought),
    payments: number(row.payments),
    coinsSpent: number(row.coins_spent),
    coinsLeft: number(row.coins_left),
    firstPaidAt: (row.first_paid_at as string | null) ?? null,
    lastPaidAt: (row.last_paid_at as string | null) ?? null,
  }))

  return { ok: true, rows }
}

/* ------------------------------------------------------------------------- */
/* Which box is being played                                                  */
/* ------------------------------------------------------------------------- */

/**
 * The ways a list of boxes can be arranged, and what each one is for.
 *
 * Players and games are deliberately separate. `boxes.attempts_count` counts
 * goes, and forty goes from four people is a box people are stuck on, while
 * forty goes from forty people is a box that is being shared — the same number
 * describing two opposite situations.
 */
export const BOX_SORTS = [
  { key: 'players', label: 'Most players', note: 'How many different people have played it' },
  { key: 'games', label: 'Most games', note: 'How many goes have been paid for' },
  { key: 'best', label: 'Closest to beaten', note: 'The level somebody has reached' },
  { key: 'newest', label: 'Newest', note: 'Most recently made' },
  { key: 'quietest', label: 'Quietest', note: 'Fewest players — the ones nobody found' },
] as const

export type BoxSort = (typeof BOX_SORTS)[number]['key']

/** Whatever came in on the query string, turned into a sort this app knows. */
export function boxSortFrom(value: unknown): BoxSort {
  const found = BOX_SORTS.find((sort) => sort.key === value)
  return found ? found.key : 'players'
}

export type BoxActivity = Pick<
  Box,
  'id' | 'code' | 'title' | 'creator_id' | 'creator_name' | 'status' | 'prize_naira' | 'best_level'
> & {
  /** Distinct people who have played it. */
  players: number
  /** Goes paid for. */
  games: number
  winners: number
  lastPlayedAt: string | null
  createdAt: string
}

export async function boxActivity(
  sort: BoxSort,
  limit = 100,
): Promise<Insight<BoxActivity>> {
  const admin = supabaseAdmin()

  const { data, error } = await admin.rpc('admin_box_activity', {
    p_sort: sort,
    p_limit: limit,
  })
  if (error) return failed<BoxActivity>(error)

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ''),
    title: String(row.title ?? ''),
    creator_id: String(row.creator_id),
    creator_name: String(row.creator_name ?? ''),
    status: (row.status === 'won' ? 'won' : 'open') as Box['status'],
    prize_naira: number(row.prize_naira),
    best_level: number(row.best_level),
    players: number(row.players),
    games: number(row.games),
    winners: number(row.winners),
    lastPlayedAt: (row.last_played_at as string | null) ?? null,
    createdAt: String(row.created_at),
  }))

  return { ok: true, rows }
}

/* ------------------------------------------------------------------------- */
/* Where the free coins are going                                             */
/* ------------------------------------------------------------------------- */

export type WelcomeIp = {
  /** The connection, as it is stored. Shown shortened — see `maskIp`. */
  ip: string
  claims: number
  coins: number
  lastAt: string | null
}

/**
 * The connections that have claimed more than one free coin.
 *
 * The evidence that the per-connection limit is doing its job, and the only way
 * to tell whether it is set right. A connection with a queue of accounts behind
 * it is either a hostel, an office or somebody working through your prize fund,
 * and nothing but looking will say which.
 */
export async function welcomeIps(limit = 8): Promise<Insight<WelcomeIp>> {
  const admin = supabaseAdmin()

  const { data, error } = await admin.rpc('admin_welcome_ips', { p_limit: limit })
  if (error) return failed<WelcomeIp>(error)

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    ip: String(row.ip ?? ''),
    claims: number(row.claims),
    coins: number(row.coins),
    lastAt: (row.last_at as string | null) ?? null,
  }))

  return { ok: true, rows }
}

/**
 * An address, shortened for a screen.
 *
 * An admin looking at this list needs to tell two connections apart and see how
 * many accounts sit behind each. They do not need the whole address to do it,
 * and a page of them is a page of somebody's home details — so the last part is
 * dropped. The full value stays in the database, where only the service role
 * can reach it.
 */
export function maskIp(ip: string): string {
  if (!ip) return 'unknown'

  // IPv6 is already stored as the /64 it was handed out on, not one device.
  if (ip.includes(':')) return ip

  const parts = ip.split('.')
  if (parts.length !== 4) return ip

  return `${parts[0]}.${parts[1]}.${parts[2]}.x`
}
