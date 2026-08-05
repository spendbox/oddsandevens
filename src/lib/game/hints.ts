// A strategy, on the way in.
//
// The guess dialog is the moment somebody has decided to spend a life and has
// not yet decided what to type. That is the only moment in the game when a
// sentence about *how to play* is welcome rather than in the way — everywhere
// else it is a manual nobody opened.
//
// Two rules for what belongs here, and they are the whole of the design.
//
//   **General, never particular.** A hint is about the shape of the problem —
//   fix the length first, change one thing at a time, keep the guess that
//   scored best — and never about the safe in front of you. Nothing here can
//   be derived from a password, so nothing here can leak one, which is why
//   they can be shown to everybody at random with no thought about which box
//   is open.
//
//   **A method, not a fact.** "Passwords may contain spaces" is a fact, and
//   the FAQ has it. "If you are stuck at the same score, try replacing a
//   character with a space" is a move somebody can make in the next ten
//   seconds. Every line here should survive being read as an instruction.
//
// Admin-editable, like the prices and the alphabet, because these are the kind
// of thing that wants tuning after watching people play — and because a good
// one thought of on a Tuesday should not need a deploy.

import { supabaseAdmin } from "@/lib/supabase/admin";

type Db = ReturnType<typeof supabaseAdmin>;

export const HINT_MAX = 60;
export const HINT_LENGTH_MAX = 220;

/**
 * The built-in set.
 *
 * Ordered roughly the way a methodical player works: find the length, then the
 * alphabet, then the positions, then stop making the same mistake twice.
 */
export const DEFAULT_HINTS: string[] = [
  "Settle the length before anything else. Guess short, guess long, and halve the gap each time — you will have it in about five tries, and every guess after that is worth more.",
  "Once a guess comes back the right length, keep that length and change what is inside it. You have paid for that answer; do not throw it away on the next guess.",
  "Change one thing at a time. If you swap three characters at once and the score moves, you have learned that something helped — not which one.",
  "Keep your best guess in front of you and edit it. A password is found by improving one string, not by writing a fresh one every time.",
  "A score that will not move is telling you the characters are right and the places are wrong. Try the same letters in a different order before you reach for new ones.",
  "Passwords are allowed a space. If a guess feels like two words, put a space between them and see what the score does.",
  "Symbols are on the table too. If letters and digits have stalled you in the fifties, one punctuation mark in the right place is often the jump.",
  "Case is half the difficulty. Try your best guess again with one letter's case flipped — nothing else changed — and read the difference.",
  "Digits usually sit at the ends. If you suspect a number, try it at the back first, then the front, before you go looking in the middle.",
  "Write down what each guess scored. The game keeps your attempts, but the pattern between them is yours to find, and it is where the answer is.",
  "A score going *down* is as useful as one going up. It tells you the thing you just changed was right before you changed it.",
  "Think about who set it. A password somebody chose is a word, a name or a date far more often than it is random — and the ones that are random are usually short.",
  "If two very different guesses score the same, stop guessing and start splitting: take the half of one and the half of the other and see which side the score follows.",
  "Long shots are cheap early and expensive late. Try the wild idea while your best score is low; once you are past seventy, work in single characters.",
  "Repeated characters are commoner than they look. If you cannot move past a score, try doubling a letter you already believe in.",
];

/** Everything unusable dropped, everything long trimmed, duplicates removed. */
export function sanitiseHints(raw: unknown): string[] {
  const source: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split("\n")
      : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of source) {
    if (typeof entry !== "string") continue;
    const line = entry.replace(/\s+/g, " ").trim().slice(0, HINT_LENGTH_MAX);
    if (line.length < 8) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= HINT_MAX) break;
  }
  return out;
}

/**
 * The hints in force, or the built-in ones.
 *
 * An empty stored list means "nobody has set this" rather than "no hints at
 * all" — the same rule the alphabet follows, and for the same reason: an admin
 * emptying a field by accident should not quietly remove a feature.
 */
export async function loadHints(db: Db): Promise<string[]> {
  const { data } = await db.rpc("hint_settings");
  const stored = sanitiseHints((data as { hints?: unknown } | null)?.hints);
  return stored.length > 0 ? stored : DEFAULT_HINTS;
}
