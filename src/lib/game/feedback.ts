// What an attempt tells you.
//
// The scoring itself lives in Postgres (`score_attempt`), where the password
// is and where it stays. This module is the shape of the answer and the words
// wrapped around it — everything the browser is allowed to know.

/** Whether the guess was shorter than, longer than, or the right length. */
export type LengthHint = "shorter" | "longer" | "exact";

export interface Verdict {
  lengthHint: LengthHint;
  /**
   * Positions that were exactly right — right character, right place, right
   * case. Never *which* positions: that is the whole difficulty of the game.
   */
  exact: number;
  /**
   * Positions holding the right letter in the right place but in the wrong
   * case. The one mercy in the scheme — it says "stop searching this position,
   * just flip the case".
   */
  miscase: number;
}

/**
 * A guess is only worth spending a life on if it is in-alphabet and not empty.
 * Length is deliberately *not* checked: not knowing how long the password is
 * is the point, and probing lengths is a legitimate move.
 */
export function isWellFormed(guess: string, alphabet: Set<string>, maxLength: number): boolean {
  if (guess.length === 0 || guess.length > maxLength) return false;
  for (const ch of guess) {
    if (!alphabet.has(ch)) return false;
  }
  return true;
}

export const LENGTH_HINT_COPY: Record<LengthHint, string> = {
  shorter: "Too short",
  longer: "Too long",
  exact: "Right length",
};

/** A one-line reading of a verdict, for the attempt log. */
export function summarise(verdict: Verdict): string {
  const parts: string[] = [LENGTH_HINT_COPY[verdict.lengthHint]];
  if (verdict.exact > 0) parts.push(`${verdict.exact} exact`);
  if (verdict.miscase > 0) parts.push(`${verdict.miscase} wrong case`);
  if (verdict.exact === 0 && verdict.miscase === 0) parts.push("nothing landed");
  return parts.join(" · ");
}

/**
 * Whether a verdict is worth drawing attention to.
 *
 * A player grinding hundreds of attempts needs the good ones to stand out in
 * the log, and "good" here means something actually landed.
 */
export function isNotable(verdict: Verdict): boolean {
  return verdict.exact > 0 || verdict.miscase > 0;
}
