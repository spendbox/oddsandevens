/**
 * Coins, naira, and the numbers that decide what things cost.
 *
 * Everything money-shaped in Spendbox comes from here, so there is one place to
 * change a price. The database repeats a couple of these as defaults — see the
 * comments in supabase/migrations/0001_schema.sql.
 */

/** What one coin costs, in naira. */
export const NAIRA_PER_COIN = 100

/** The smallest top-up. Below this the Paystack fee eats the transaction. */
export const MIN_TOPUP_COINS = 5

/** What one attempt at a box costs. */
export const COINS_PER_PLAY = 1

/** The prize on a box — paid twice over: once to the creator, once to the winner. */
export const PRIZE_NAIRA = 100_000

/** Paystack counts in kobo. One naira is one hundred of them. */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100)
}

export function coinsToNaira(coins: number): number {
  return coins * NAIRA_PER_COIN
}

/** "N100,000" — the way a price should read on screen. */
export function naira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

export function coinWord(coins: number): string {
  return `${coins} ${coins === 1 ? 'coin' : 'coins'}`
}

/**
 * The head start on the counters shown on the front page.
 *
 * These are added to the real totals from the database, so the numbers on the
 * landing page are this plus whatever has genuinely happened since.
 *
 * They are a launch figure, not a measurement. Anyone reading that page will
 * take "boxes created" and "paid out" as a record of what this platform has
 * actually done, so treat changing them as a claim you are making rather than
 * a setting you are tuning — and set them to zero if you would rather the page
 * only ever showed real activity.
 */
export const STATS_BASELINE = {
  boxes: 210,
  paidOutNaira: 4_000_000,
}
