// What a password may be built from — and who decides.
//
// The alphabet used to be a constant in `constants.ts` and nothing else, which
// made it the one number in the game that could not be tuned without a deploy.
// It is also the number the whole economy rests on: every extra character is
// another candidate at every position, so adding six symbols lengthens an
// honest brute-force by thousands of attempts and moves every power-up's worth
// with it.
//
// Two things follow from that, and they pull in opposite directions.
//
//   1. It has to be **editable**, so it lives in `platform_settings` beside the
//      prices, read at request time, defaulting to the built-in list whenever
//      nobody has said otherwise.
//   2. It has to be **visible**, because a player guessing blind is entitled to
//      know the size of the space they are guessing in. A hidden alphabet is
//      not extra difficulty, it is a player wondering whether `√` is even
//      allowed and spending a life to find out.
//
// The letters and the digits are not editable. They are in every password ever
// created, they are what "case matters" means, and an admin who removed them
// would break the game rather than tune it. Only the symbol list moves.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { DIGITS, LOWER, SPECIALS, UPPER } from "@/lib/constants";

type Db = ReturnType<typeof supabaseAdmin>;

/** No more than this many symbols, whatever an admin pastes in. */
export const MAX_SYMBOLS = 120;

/** The built-in list, and what an untouched install uses. */
export function defaultSymbols(): string[] {
  return [...SPECIALS];
}

/**
 * Everything a *new* password may contain, in the order it should be shown.
 *
 * Letters and digits first because they are the ordinary case; symbols last
 * because that is the part somebody is actually looking this up to check.
 */
export function alphabetOf(symbols: string[]): string[] {
  return [...UPPER, ...LOWER, ...DIGITS, ...symbols];
}

/**
 * Everything a *guess* may contain: the current alphabet, plus every symbol
 * that has ever been standard.
 *
 * The two sets are not the same, and the difference is deliberate. Passwords
 * are permanent — once a safe is live its password can never be edited — so an
 * admin who removes a symbol from the list must not thereby make a live safe
 * impossible to type, which would turn somebody's funded reward into a prize
 * nobody can ever claim. Shrinking the offered set stops it appearing in *new*
 * passwords and does nothing to old ones.
 *
 * The asymmetry only ever runs one way: anything creatable is guessable.
 */
export function guessAlphabet(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of [...alphabetOf(symbols), ...SPECIALS]) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

export function guessSet(symbols: string[]): Set<string> {
  return new Set(guessAlphabet(symbols));
}

/**
 * Read an admin's list into something safe to store.
 *
 * Everything that is not a single, printable, non-alphanumeric character is
 * dropped rather than rejected: this is fed by a text field somebody has
 * pasted into, and half the value of pasting is not having to think about the
 * spaces between.
 */
export function sanitiseSymbols(raw: unknown): string[] {
  const source: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [...raw]
      : [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of source) {
    if (typeof entry !== "string") continue;
    // One code point exactly. A pasted emoji is two or more and is refused —
    // not out of taste, but because a password field, a monospaced attempt log
    // and a fixed-width tile all measure characters and an emoji is not one.
    const points = [...entry];
    if (points.length !== 1) continue;
    const ch = points[0];
    const code = ch.codePointAt(0) ?? 0;

    // Control characters, and the invisible formatting characters that would
    // make two different passwords look identical.
    if (code < 0x20 || code === 0x7f) continue;
    if (code >= 0x200b && code <= 0x200f) continue;
    if (code === 0xfeff || code === 0x00ad) continue;
    // Letters and digits are permanent and are added separately.
    if (/[a-z0-9]/i.test(ch)) continue;

    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
    if (out.length >= MAX_SYMBOLS) break;
  }

  return out;
}

/**
 * The symbol list in force, or the built-in one.
 *
 * An empty stored list means "nobody has set this" rather than "no symbols at
 * all" — a password game with no punctuation is not a thing anybody meant to
 * ask for, and the alternative is an admin emptying the field by accident and
 * quietly halving the search space of every safe on the site.
 */
export async function loadSymbols(db: Db): Promise<string[]> {
  const { data } = await db.rpc("alphabet_settings");
  const stored = sanitiseSymbols((data as { symbols?: unknown } | null)?.symbols);
  return stored.length > 0 ? stored : defaultSymbols();
}

/** Whether a string is made entirely of characters from `allowed`. */
export function withinAlphabet(value: string, allowed: Set<string>): boolean {
  for (const ch of value) if (!allowed.has(ch)) return false;
  return true;
}
