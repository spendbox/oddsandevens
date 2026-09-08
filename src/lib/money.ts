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

/** The largest top-up in one go. A bigger number is almost always a typo. */
export const MAX_TOPUP_COINS = 500

/** What one attempt at a box costs. */
export const COINS_PER_PLAY = 1

/**
 * What it costs to carry on from the level you are stuck on, once the free
 * replay is gone.
 *
 * Always more than starting over, because it is always worth more: you keep
 * every level you have already cleared. Somebody stuck on level 8 can pay to
 * stay there or one coin to go back to level 1, and that choice has to have a
 * real price attached or nobody would ever start again.
 *
 * The price climbs because what it buys climbs with it. Carrying on at level 2
 * saves a player one cleared level; carrying on at level 9 saves them eight,
 * and eight cleared levels is most of the way to ₦100,000. A flat price would
 * mean the cheapest thing in the game is also the most valuable thing in it.
 *
 * The bands are the same shape as the difficulty curve in `game.ts`, which
 * steps at 4 and 7 for exactly the same reason.
 */
const RETRY_BANDS = [
  { fromLevel: 8, coins: 5 },
  { fromLevel: 4, coins: 3 },
  { fromLevel: 1, coins: 2 },
] as const

export function retryCostFor(level: number): number {
  return RETRY_BANDS.find((band) => level >= band.fromLevel)?.coins ?? 2
}

/**
 * The least a retry can ever cost.
 *
 * Used where the question is "can this player afford to keep going at all"
 * rather than "what does this particular level cost".
 */
export const CHEAPEST_RETRY = Math.min(...RETRY_BANDS.map((band) => band.coins))

/** The bands, for the pages that have to explain them. */
export const RETRY_PRICES = [
  { levels: '1–3', coins: RETRY_BANDS[2].coins },
  { levels: '4–7', coins: RETRY_BANDS[1].coins },
  { levels: '8–10', coins: RETRY_BANDS[0].coins },
]

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
