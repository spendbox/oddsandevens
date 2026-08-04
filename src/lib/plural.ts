/**
 * "1 hunter", "2 hunters", "0 hunters".
 *
 * Trivial, and worth having in one place: the same count was being written out
 * by hand in half a dozen components and one of them rendered "1 hunters".
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = count === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${count.toLocaleString("en-NG")} ${word}`;
}

/**
 * A count that fits in a tile: 942, 4.1k, 128k, 2.3m.
 *
 * A popular box reaches six figures, and "128,431" in a 64px counter either
 * wraps or shrinks to unreadable. Thousands get one decimal place because the
 * difference between 4.1k and 4.9k is worth seeing; millions get one for the
 * same reason and nothing beyond that ever will.
 */
export function compact(value: number): string {
  const n = Math.max(0, Math.round(value));

  // Thresholds are 999.5k rather than 1,000,000 because the *rounded* figure is
  // what gets printed: at 999,999 the naive test still says "thousands" and
  // renders "1000k", which is worse than either neighbour.
  if (n < 999.5) return String(n);
  if (n < 999_500) return unit(n / 1_000, "k");
  return unit(n / 1_000_000, "m");
}

/** One decimal below ten, none above — the difference between 4.1k and 4.9k is
 * worth seeing; the one between 41k and 41.2k is not. */
function unit(value: number, suffix: string): string {
  const shown = value < 9.95 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${shown}${suffix}`;
}
