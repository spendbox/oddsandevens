"use client";

// The keypad on the front of the safe.
//
// It carries all 36 characters and colours each one with the best verdict it
// has ever earned, which is most of what a player is actually reasoning with —
// the board says what happened, the keypad says what's left. Characters a
// Sweep has struck off are drawn as spent rather than removed, so the layout
// never shifts under a thumb mid-guess.

import { Delete, CornerDownLeft } from "lucide-react";
import { LETTERS, SPECIALS } from "@/lib/constants";
import type { Mark } from "@/lib/game/feedback";

const MARK_STYLES: Record<Mark, string> = {
  g: "bg-mark-green text-white border-mark-green",
  o: "bg-mark-orange text-white border-mark-orange",
  r: "bg-white/[0.02] text-zinc-600 border-white/5",
};

// Three rows of letters, then the specials. Not QWERTY: a password is not a
// word, so alphabetical order is the only order anyone can actually search.
const LETTER_ROWS = [LETTERS.slice(0, 9), LETTERS.slice(9, 18), LETTERS.slice(18)];

export function Keypad({
  marks,
  dead,
  disabled,
  onKey,
  onEnter,
  onBackspace,
  canSubmit,
}: {
  /** Best verdict per character, from every guess so far. */
  marks: Record<string, Mark>;
  /** Characters a Sweep has proved absent. */
  dead: Set<string>;
  disabled: boolean;
  onKey: (char: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  canSubmit: boolean;
}) {
  const key = (char: string) => {
    const mark: Mark | undefined = dead.has(char) ? "r" : marks[char];
    return (
      <button
        key={char}
        type="button"
        disabled={disabled}
        onClick={() => onKey(char)}
        className={
          "h-11 min-w-[8vw] flex-1 rounded-md border font-mono text-sm font-bold transition active:scale-95 disabled:opacity-40 sm:min-w-9 sm:text-base " +
          (mark ? MARK_STYLES[mark] : "border-white/10 bg-white/10 text-zinc-100 hover:bg-white/15")
        }
      >
        {char}
      </button>
    );
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {LETTER_ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-1.5">
          {row.map(key)}
        </div>
      ))}

      <div className="flex justify-center gap-1.5">{SPECIALS.map(key)}</div>

      <div className="mt-1 flex justify-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onBackspace}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/10 text-sm font-semibold text-zinc-100 transition active:scale-95 disabled:opacity-40"
        >
          <Delete className="size-4" aria-hidden />
          Delete
        </button>
        <button
          type="button"
          disabled={disabled || !canSubmit}
          onClick={onEnter}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-brass text-sm font-bold text-zinc-950 transition active:scale-95 hover:bg-brass-bright disabled:opacity-40"
        >
          <CornerDownLeft className="size-4" aria-hidden />
          Try it
        </button>
      </div>
    </div>
  );
}
