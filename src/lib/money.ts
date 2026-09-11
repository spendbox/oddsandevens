/**
 * Coins, naira, and the numbers that decide what things cost.
 *
 * Everything money-shaped in Spendbox comes from here, so there is one place to
 * change a price. The database repeats a couple of these as defaults — see the
 * comments in supabase/migrations/0001_schema.sql.
 */

/**
 * What one coin costs, in naira.
 *
 * This is the figure a fresh database starts at and the one every screen falls
 * back to when the settings table cannot be read. The live number is
 * `settings.naira_per_coin`, changed at /admin/users without a deploy — see
 * `liveCoinPrice()` in `src/lib/settings.ts`, which server components read it
 * through and client components take as a prop. The same arrangement as the
 * prize, for the same reason: a price is exactly the number somebody running
 * this site needs to move in an afternoon.
 *
 * Nothing quotes this constant to a player directly. Every sentence, button and
 * table cell that names a coin price goes through `coinsToNaira`, which takes
 * the price as an argument precisely so that the compiler asks every caller
 * where its number came from. The database repeats this as a column default in
 * supabase/migrations/0015_coin_price.sql.
 */
export const NAIRA_PER_COIN = 100

/** The smallest top-up. Below this the Paystack fee eats the transaction. */
export const MIN_TOPUP_COINS = 5

/**
 * The smallest payment worth opening, in naira.
 *
 * Not a preference — a bank transfer has a real fee behind it and a gateway
 * that will refuse an amount small enough to be a rounding error. It is written
 * here rather than in the admin screen because it is the thing that decides how
 * cheap a coin may be: the smallest payment this site can open is
 * `MIN_TOPUP_COINS` coins, so the two numbers together set the floor below.
 */
export const MIN_TOPUP_NAIRA = 100

/**
 * The least a coin may cost.
 *
 * Derived, not chosen. A player cannot buy fewer than `MIN_TOPUP_COINS` coins,
 * so a coin priced below this makes the smallest possible top-up a payment
 * worth less than it costs to take — and the failure would not look like a
 * pricing mistake, it would look like Paystack being broken for everybody.
 * Move either of the two numbers above and this follows.
 */
export const MIN_NAIRA_PER_COIN = Math.ceil(MIN_TOPUP_NAIRA / MIN_TOPUP_COINS)

/**
 * The most a coin may cost.
 *
 * A typo guard, exactly like `MAX_PRIZE_NAIRA` and `MAX_WELCOME_COINS`. A stray
 * zero turns ₦100 a coin into ₦1,000 a coin, and nothing downstream would
 * question it: the screens would quote the new price perfectly, the smallest
 * top-up would simply become ₦5,000, and the first sign of trouble would be
 * nobody buying anything. A ceiling that has to be raised in code is the
 * cheapest possible check on that.
 */
export const MAX_NAIRA_PER_COIN = 10_000

/** The largest top-up in one go. A bigger number is almost always a typo. */
export const MAX_TOPUP_COINS = 500

/**
 * What it costs to open a run at a box, from level 1.
 *
 * One coin. A run at a box puts the whole prize in front of somebody for the
 * price of a single coin, and that is what a go costs — the same coin whether
 * the run is their first of the day or their tenth, and the same coin again
 * for going back to level 1 after a miss, because that is a new run.
 *
 * The rest of the money is made further up. Level 8, with seven cleared levels
 * behind it, is worth more than a fresh start — and that is what `retryCostFor`
 * below is for. Going back to the start is never more than this one coin, so
 * nobody is ever locked out of the progress they had made for want of the
 * larger sum.
 *
 * It is a number rather than a flag so that the price can be moved — to zero
 * included — by changing this one line, and every screen that quotes it (they
 * all read it from here, through `priceLabel` or `playPricePhrase`) follows.
 */
export const COINS_PER_PLAY = 1

/**
 * What it costs to carry on from the level you are stuck on, once the free
 * replay is gone.
 *
 * Starting over costs a coin, so what is being sold here is never access to
 * the game — it is the levels already cleared, which are the one thing a fresh
 * run cannot hand back. Somebody stuck on level 8 can pay to stay there or go
 * back to level 1 for a single coin, and the gap between those two prices has
 * to be a real one or nobody would ever pay the larger.
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
 * The free coin a player starts with.
 *
 * A go at a box costs a coin, which means somebody who has just followed a
 * shared link cannot play until they have paid — and the link promised them a
 * game, not a payment screen. So every account is given this much, once, and
 * the first go is on the house.
 *
 * This is the figure a fresh database starts at and the one a screen falls back
 * to when the settings table cannot be read. The live number is
 * `settings.welcome_coins`, changed at /admin/users without a deploy, and the
 * grant itself reads it straight from that row — see
 * supabase/migrations/0014_welcome_coin.sql. Set it to zero and the free coin
 * stops, prose included: every sentence that mentions it goes through
 * `welcomeCoinPhrase`.
 */
export const WELCOME_COINS = 1

/**
 * How many free coins one internet connection may claim.
 *
 * The free coin is a real go at ₦100,000, so fifty accounts made on one phone
 * is fifty free shots at the prize and the obvious thing for somebody to try.
 * This is what stops it.
 *
 * Small, but never one. Shared connections are the normal case here — a
 * household, a hostel, a shop's wifi, and a whole mobile network behind one
 * address — so a limit of one would take the free coin away from far more
 * honest players than farmers. Like the box limit, the live number lives in the
 * settings table so it can be moved the moment it turns out to be wrong; this
 * is only what a fresh database starts at.
 */
export const MAX_WELCOME_PER_IP = 3

/**
 * The most free coins an admin may give each new player.
 *
 * A typo guard, exactly like `MAX_PRIZE_NAIRA`: every account ever made gets
 * this many, so a stray zero turns a welcome into a giveaway funded by nobody.
 * The database repeats it as a check constraint in
 * supabase/migrations/0014_welcome_coin.sql.
 */
export const MAX_WELCOME_COINS = 50

/**
 * The free coin, the way a sentence says it.
 *
 * Empty when there is no free coin, so a screen can drop the whole sentence
 * rather than print "you get 0 coins free". The same reasoning as
 * `playPricePhrase`: a paragraph promising something the server no longer gives
 * is the kind of lie the eye slides straight over.
 */
export function welcomeCoinPhrase(coins: number = WELCOME_COINS): string {
  if (coins <= 0) return ''
  return coins === 1 ? 'your first coin is free' : `your first ${coins} coins are free`
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

/**
 * The prize on a box — paid twice over: once to the creator, once to the winner.
 *
 * This is the figure a fresh database starts at and the one every page falls
 * back to when it cannot read the settings table. The live number lives in
 * `settings.prize_naira` and is changed from /admin/users without a deploy —
 * see `livePrize()` in `src/lib/settings.ts`. A box keeps the prize it was
 * created with for as long as it exists, because that is what was promised to
 * the people playing it; changing this moves the prize on boxes made from then
 * on. The database repeats it as a column default in
 * supabase/migrations/0001_schema.sql and 0012_editable_prize.sql.
 */
export const PRIZE_NAIRA = 100_000

/**
 * The most an admin may set the prize to.
 *
 * Not a rule about what a box is worth — it is a guard against a stray zero.
 * Every box carries its prize twice over when it is beaten, so a slip that
 * turns ₦100,000 into ₦1,000,000 is a ₦2,000,000 promise made by a keystroke,
 * and nothing downstream would question it. A ceiling that has to be raised in
 * code is the cheapest possible check on that.
 */
export const MAX_PRIZE_NAIRA = 1_000_000

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

/**
 * What this many coins costs, at the price that is actually being charged.
 *
 * The price is an argument with no default, and that is the whole point of it.
 * A default would let a screen quote ₦100 a coin months after an admin moved
 * the price, silently and while looking entirely correct — the same failure the
 * prize had before 0012, but on the number a player is about to transfer. With
 * no default the compiler asks every caller where its price came from, and the
 * only honest answers are `liveCoinPrice()` on the server or a prop handed down
 * from it.
 */
export function coinsToNaira(coins: number, nairaPerCoin: number): number {
  return coins * nairaPerCoin
}

/**
 * Is this a price a coin may be sold at? The reason, if not.
 *
 * Here rather than in the admin action because it is the same question the
 * check constraint in 0015_coin_price.sql asks, and a constraint violation is
 * not a sentence anybody can act on. Both ends of it are explained rather than
 * merely refused: an operator typing ₦5 is not being careless, they are
 * pricing a game, and they deserve to be told it is the payment underneath that
 * cannot be that small.
 */
export function coinPriceProblem(nairaPerCoin: number): string | null {
  if (!Number.isFinite(nairaPerCoin) || Math.floor(nairaPerCoin) !== nairaPerCoin) {
    return 'Give a price in whole naira.'
  }

  if (nairaPerCoin <= 0) {
    return (
      'A coin has to cost something. To hand coins out for nothing, give new players more ' +
      'free coins instead — that is counted as coins given rather than coins sold.'
    )
  }

  if (nairaPerCoin < MIN_NAIRA_PER_COIN) {
    return (
      `${naira(MIN_NAIRA_PER_COIN)} is the least a coin can cost. Nobody can buy fewer than ` +
      `${MIN_TOPUP_COINS} at a time, so anything cheaper makes the smallest top-up ` +
      `less than ${naira(MIN_TOPUP_NAIRA)} — an amount the transfer fee eats and Paystack ` +
      'may refuse outright.'
    )
  }

  if (nairaPerCoin > MAX_NAIRA_PER_COIN) {
    return (
      `${naira(MAX_NAIRA_PER_COIN)} is the most that can be set here, and that is a guard ` +
      'against a stray zero rather than a rule — at that price the smallest top-up anybody ' +
      `can make is ${naira(MAX_NAIRA_PER_COIN * MIN_TOPUP_COINS)}. Raise MAX_NAIRA_PER_COIN ` +
      'in src/lib/money.ts if you really mean it.'
    )
  }

  return null
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
 * "0 coins" is not a price anybody reads as free — so the word is produced here
 * rather than left to each screen to remember. Every place that quotes the cost
 * of starting a game goes through this, which is why moving COINS_PER_PLAY
 * moves the price on all of them at once.
 */
export function priceLabel(coins: number): string {
  return coins <= 0 ? 'Free' : coinWord(coins)
}

/**
 * The same price, the way a sentence says it: "is free", or "costs 1 coin".
 *
 * Prose is where a price change goes wrong. A button label is one word and a
 * screen that forgets to read it looks obviously stale, but a paragraph saying
 * "playing is free" underneath a button charging a coin is a lie the eye slides
 * straight over — and it was written down in nine places. This puts the verb
 * with the number, so the sentence follows COINS_PER_PLAY wherever it goes.
 */
export function playPricePhrase(coins: number = COINS_PER_PLAY): string {
  return coins <= 0 ? 'is free' : `costs ${coinWord(coins)}`
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
