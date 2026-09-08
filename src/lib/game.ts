/**
 * The game itself: how hard each level is, and what a correct answer looks
 * like.
 *
 * A pattern is a run of flashes on a 3x3 grid. Tiles are numbered 0 to 8,
 * reading left to right, top to bottom. Level 1 flashes four of them; each
 * level adds one, so level 10 flashes thirteen. Tiles repeat — there are only
 * nine of them and thirteen flashes to fill — but never twice in a row, because
 * a tile lighting up while it is already lit is a flash nobody can see.
 *
 * This module is imported by both the server and the browser. The server uses
 * it to generate and judge; the browser uses it to draw and to run the
 * countdown. They agree because it is the same arithmetic, and where they
 * disagree the server wins: see judge() and the deadline it is given.
 */

export const GRID_SIZE = 3
export const TILE_COUNT = GRID_SIZE * GRID_SIZE
export const LEVELS = 10

/** How many flashes level `level` has. 4 at level 1, 13 at level 10. */
export function stepsFor(level: number): number {
  return level + 3
}

/**
 * How long a single tile stays lit, in milliseconds.
 *
 * 620ms at level 1 down to 260ms at level 10 — the pattern comes at you faster
 * every level, which is most of what makes the later ones hard.
 */
export function flashMsFor(level: number): number {
  return 620 - (level - 1) * 40
}

/** The dark beat between two flashes, so a repeat reads as two taps. */
export function gapMsFor(level: number): number {
  return Math.round(flashMsFor(level) * 0.32)
}

/** How long the whole pattern takes to play. The answer clock does not run yet. */
export function showMsFor(level: number): number {
  return stepsFor(level) * (flashMsFor(level) + gapMsFor(level))
}

/**
 * How long the player gets to tap the pattern back, in milliseconds.
 *
 * Two seconds, plus another second every three levels: 2s for levels 1-3, 3s
 * for 4-6, 4s for 7-9, and 5s at level 10.
 *
 * This is the tightest number in the product and the one most worth playing
 * with. Thirteen taps in five seconds at level 10 is close to the limit of what
 * a thumb can do, which is the point — a box is worth ₦200,000 and is meant to
 * stand up for a while. If it turns out nobody ever beats one, raise the 2 or
 * loosen the divisor here and the whole curve moves with it.
 */
export function answerMsFor(level: number): number {
  return (2 + Math.floor((level - 1) / 3)) * 1000
}

/**
 * The 3-2-1 before a level, in milliseconds.
 *
 * Lives here, with the rest of the curve, because both halves have to agree on
 * it: the screen spends this long counting in, and the server has to budget for
 * it when it works out the deadline.
 *
 * It did not, once. The count-in was added to the screen alone, so every level
 * quietly handed the player 2.4 seconds less than the clock in front of them
 * claimed — 60% of the window at level 1 — and the run ended "out of time" with
 * seconds still showing. Anything that happens between issuing a pattern and
 * the player's first tap has to be counted here.
 */
export const COUNT_IN_TICKS = 3
export const COUNT_IN_TICK_MS = 800
export const COUNT_IN_MS = COUNT_IN_TICKS * COUNT_IN_TICK_MS

/** Everything the browser needs to run one level. */
export type LevelPlan = {
  level: number
  steps: number
  flashMs: number
  gapMs: number
  showMs: number
  answerMs: number
}

export function planFor(level: number): LevelPlan {
  return {
    level,
    steps: stepsFor(level),
    flashMs: flashMsFor(level),
    gapMs: gapMsFor(level),
    showMs: showMsFor(level),
    answerMs: answerMsFor(level),
  }
}

/** A whole-number 0..max-1, drawn without the bias `% max` would introduce. */
function randomBelow(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max
  const buffer = new Uint32Array(1)
  let value = 0

  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)

  return value % max
}

/**
 * A fresh pattern for a level. Generated on the server, every single time, so
 * that no two runs at a box are ever the same game.
 */
export function makePattern(level: number): number[] {
  const steps = stepsFor(level)
  const pattern: number[] = []

  while (pattern.length < steps) {
    const tile = randomBelow(TILE_COUNT)
    if (pattern.length > 0 && pattern[pattern.length - 1] === tile) continue
    pattern.push(tile)
  }

  return pattern
}

/** True when `taps` is that pattern, tap for tap. */
export function matches(pattern: number[], taps: unknown): taps is number[] {
  return (
    Array.isArray(taps) &&
    taps.length === pattern.length &&
    taps.every((tap, i) => tap === pattern[i])
  )
}

/**
 * A network allowance on the server's deadline, in milliseconds.
 *
 * The clock the player sees starts when the last flash goes out. The server's
 * has been running since it handed the pattern over, and between those two
 * moments sits a whole round trip — the response coming down, the answer going
 * back up — plus the two calls to Supabase the route makes on each leg. On
 * Nigerian mobile data that adds up to seconds, not milliseconds.
 *
 * Five of them, and it is worth being clear about why so many, because the
 * instinct is to keep this number small and that instinct is what made the game
 * unfair.
 *
 * The screen never hands out this time. It runs `min(answerMs, whatever the
 * server says is left)`, so an honest player on the real client is held to the
 * answer window for their level and not a millisecond more — this only decides
 * how late their answer may *arrive* and still count. Too small and it does not
 * cover the round trip, and then it starts coming out of the visible clock
 * instead: at a second of latency each way the level-10 window was collapsing
 * from five seconds to under two, which is the same unfairness wearing a
 * different face. Sized properly, the squeeze never happens and neither does
 * the rejection.
 *
 * What it is not is the thing that stops cheating. To show somebody a pattern
 * you have to send it to them, so anyone answering the API directly rather than
 * playing the game has already won the argument, whatever this number is. The
 * deadline exists to stop a person taking an unbounded amount of time — a
 * screenshot, a think, a careful tap — and five seconds is nowhere near enough
 * to matter for that at any level.
 *
 * Two other things used to be paid for out of this allowance and no longer are:
 * the count-in and the pattern running long on a slow phone, now that both are
 * driven off one wall clock (see use-pattern-player) instead of chains of
 * setTimeout that could only ever finish late; and the two Supabase round trips
 * the answer route spent working out who was asking before it read the clock,
 * now stamped on arrival instead. Between them they were eating most of it, and
 * players were told they were out of time with seconds on the screen.
 */
export const LATENCY_GRACE_MS = 5_000

/** A human sentence for a level, used on the box page's difficulty preview. */
export function describe(level: number): string {
  const plan = planFor(level)
  return `${plan.steps} flashes · ${(plan.answerMs / 1000).toFixed(0)}s to answer`
}
