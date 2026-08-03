// Scoring a guess.
//
// This is the whole game, so it lives in one small pure function that never
// runs in a browser. The secret is read with the service-role key inside a
// route handler, scored here, and thrown away; what goes back to the player is
// three colours per position and nothing else.

import { ALPHABET_SET } from "@/lib/constants";

/**
 * Per-character verdict, stored one letter per position so a whole guess is a
 * short string in the database:
 *
 *   `g` green  — right character, right place
 *   `o` orange — the character is in the password, but not here
 *   `r` red    — the character is not in the password at all
 */
export type Mark = "g" | "o" | "r";

/**
 * Wordle's two-pass rule, and it matters: oranges are budgeted by how many
 * copies of the character are actually left over after the greens are taken.
 *
 * Guess `AAB` against `ABC` scores `g r o`, not `g o o` — there is only one
 * `A` in the password and the first position already claimed it. Without the
 * budget a player could count duplicates for free, which turns a long password
 * into a much shorter one.
 */
export function scoreGuess(secret: string, guess: string): string {
  const n = secret.length;
  const marks: Mark[] = new Array(n).fill("r");

  // Pass one: exact hits, and take those characters out of circulation.
  const spare = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (guess[i] === secret[i]) {
      marks[i] = "g";
    } else {
      spare.set(secret[i], (spare.get(secret[i]) ?? 0) + 1);
    }
  }

  // Pass two: misplaced hits, only while an unclaimed copy remains.
  for (let i = 0; i < n; i++) {
    if (marks[i] === "g") continue;
    const left = spare.get(guess[i]) ?? 0;
    if (left > 0) {
      marks[i] = "o";
      spare.set(guess[i], left - 1);
    }
  }

  return marks.join("");
}

export function isSolved(feedback: string): boolean {
  return feedback.length > 0 && !feedback.includes("o") && !feedback.includes("r");
}

/** A guess is only worth scoring if it is the right length and in-alphabet. */
export function isWellFormed(guess: string, length: number): boolean {
  if (guess.length !== length) return false;
  for (const ch of guess) {
    if (!ALPHABET_SET.has(ch)) return false;
  }
  return true;
}

/**
 * The best verdict each character has ever earned across a run, which is what
 * the on-screen keyboard colours itself with. Green outranks orange outranks
 * red, so a character never downgrades once it has been placed.
 */
export function keyboardState(
  guesses: { value: string; feedback: string }[]
): Record<string, Mark> {
  const rank: Record<Mark, number> = { r: 0, o: 1, g: 2 };
  const best: Record<string, Mark> = {};
  for (const { value, feedback } of guesses) {
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      const mark = feedback[i] as Mark;
      if (!best[ch] || rank[mark] > rank[best[ch]]) best[ch] = mark;
    }
  }
  return best;
}
