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

/**
 * What it costs to open a run at a box, from level 1.
 *
 * Nothing. A player who has never seen Spendbox before can tap Play and be
 * inside the game, and a box link is worth sharing precisely because the
 * person it is sent to is not asked for money to find out what it is.
 *
 * The money is made further up. Level 1 is free; level 8, with seven cleared
 * levels behind it, is worth paying to keep — and that is what `retryCostFor`
 * below is for. Anyone who wants to go back to the start may always do so for
 * nothing, so nobody is ever locked out of the game, only out of the progress
 * they had made in it.
 *
 * It is a number rather than a flag so that a price can be put back on the
 * first level by changing this one line, and every screen that quotes it —
 * they all read it from here — follows.
 */
export const COINS_PER_PLAY = 0

/**
 * What it costs to carry on from the level you are stuck on, once the free
 * replay is gone.
 *
 * This is the only thing in the game anybody pays for. Starting over is free,
 * so what is being sold here is never access to the game — it is the levels
 * already cleared, which are the one thing a fresh run cannot hand back.
 * Somebody stuck on level 8 can pay to stay there or go back to level 1 for
 * nothing, and that choice has to have a real price attached or nobody would
 * ever pay it.
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
 * How many free replays a run comes with.
 *
 * One, in somebody else's box: miss a level and you may take it again, same
 * level, new pattern, nothing to pay. It is there so that one unlucky level —
 * a bus, a notification, a thumb in the wrong place — does not end a run the
 * player was winning.
 *
 * None, in your own. A creator is already paid ₦100,000 when their box is
 * beaten, so a free go at beating it themselves is the platform handing them
 * a second run at their own prize at its own expense. They may still play it,
 * and still carry on from a level by paying for it like anybody else — what
 * they do not get is the free one.
 *
 * The server decides this, at the moment the run is opened, from the box's
 * creator and the person asking. The browser is not asked and could not be
 * believed: the number goes into `start_attempt` the same way the price of a
 * retry goes into `buy_replay`.
 */
export function freeReplaysFor(isOwnBox: boolean): number {
  return isOwnBox ? 0 : 1
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

/**
 * How many boxes may exist in total, until an admin says otherwise.
 *
 * Every box ever made is a standing ₦100,000 promise, and ₦200,000 once it is
 * beaten, so this is the ceiling on what the platform has committed to. The
 * live number lives in the `settings` table and is changed from /admin/users
 * without a deploy — this is only the value a fresh database starts at, and
 * what the admin screen falls back to when it cannot read the table at all.
 * The database repeats it as a column default in
 * supabase/migrations/0009_box_limit_default.sql.
 */
export const DEFAULT_MAX_BOXES = 10_000

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
 * A price, the way a button says it.
 *
 * "0 coins" is not a price anybody reads as free, and free is the whole point
 * of the first level — so the word is produced here rather than left to each
 * screen to remember. Every place that quotes the cost of starting a game goes
 * through this, which is why setting COINS_PER_PLAY back to 1 puts the price
 * back on all of them at once.
 */
export function priceLabel(coins: number): string {
  return coins <= 0 ? 'Free' : coinWord(coins)
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
