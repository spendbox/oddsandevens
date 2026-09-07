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
 * A tolerance on the server's deadline, in milliseconds.
 *
 * The clock the player sees starts when the last flash goes out. The server's
 * starts when it hands over the pattern, which is a network trip earlier, and
 * a phone on Nigerian mobile data can easily lose most of a second to that.
 * Without this, a slow connection would fail honest players on time they never
 * had. It is deliberately generous; it buys nobody an extra tap, because the
 * hard part of level 10 is the tapping, not the third of a second.
 */
export const LATENCY_GRACE_MS = 1_200

/** A human sentence for a level, used on the box page's difficulty preview. */
export function describe(level: number): string {
  const plan = planFor(level)
  return `${plan.steps} flashes · ${(plan.answerMs / 1000).toFixed(0)}s to answer`
}
