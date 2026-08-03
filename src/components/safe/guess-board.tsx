"use client";

// The board: one row per guess, one tile per character.
//
// A password can be 26 characters long, which is far too wide for a phone at
// any comfortable tile size, so the tiles are sized from the password's length
// rather than being fixed — short boxes get big satisfying tiles, long ones
// get dense ones, and neither needs a horizontal scrollbar.

import type { Mark } from "@/lib/game/feedback";
import type { Revealed } from "@/lib/game/power-ups";
import type { GuessRow } from "@/lib/types";

const MARK_STYLES: Record<Mark, string> = {
  g: "bg-mark-green border-mark-green text-white",
  o: "bg-mark-orange border-mark-orange text-white",
  r: "bg-mark-red border-mark-red text-zinc-400",
};

/** Tile size in pixels, chosen so a full row fits a narrow phone. */
function tileSize(length: number): number {
  if (length <= 5) return 56;
  if (length <= 8) return 44;
  if (length <= 12) return 34;
  if (length <= 18) return 26;
  return 20;
}

function Tile({
  char,
  mark,
  hint,
  size,
  index,
  animate,
}: {
  char: string;
  mark?: Mark;
  /** A position a power-up has already revealed, shown when nothing's typed. */
  hint?: string;
  size: number;
  index: number;
  animate?: boolean;
}) {
  const base =
    "flex items-center justify-center rounded-md border-2 font-mono font-bold uppercase";
  const style = mark
    ? MARK_STYLES[mark]
    : char
      ? "border-brass/60 bg-white/5 text-zinc-100"
      : hint
        ? "border-brass/40 border-dashed bg-brass/10 text-brass"
        : "border-white/10 bg-white/[0.02] text-zinc-600";

  return (
    <div
      className={`${base} ${style} ${animate ? "animate-flip stagger" : ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.45)),
        ["--i" as string]: index,
      }}
    >
      {char || hint || ""}
    </div>
  );
}

export function GuessBoard({
  length,
  rows,
  current,
  revealed,
  totalRows,
  shake,
}: {
  length: number;
  /** Guesses already scored, oldest first. */
  rows: GuessRow[];
  /** What the player is typing right now, or null when the run is over. */
  current: string | null;
  revealed: Revealed;
  /** Guesses this run is allowed, so the empty rows below are honest. */
  totalRows: number;
  /** Bumped to replay the refusal animation on an invalid submit. */
  shake: number;
}) {
  const size = tileSize(length);
  const gap = size > 40 ? 6 : 4;
  const blanks = Math.max(0, totalRows - rows.length - (current === null ? 0 : 1));

  const row = (children: React.ReactNode, key: string, extra = "") => (
    <div key={key} className={`flex justify-center ${extra}`} style={{ gap }}>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col items-center" style={{ gap }}>
      {rows.map((guess, r) =>
        row(
          Array.from({ length }, (_, i) => (
            <Tile
              key={i}
              char={guess.value[i] ?? ""}
              mark={guess.feedback[i] as Mark}
              size={size}
              index={i}
              // Only the newest row flips; replaying the whole board on every
              // render would be a light show.
              animate={r === rows.length - 1}
            />
          )),
          `guess-${r}`
        )
      )}

      {current !== null &&
        row(
          Array.from({ length }, (_, i) => (
            <Tile
              key={i}
              char={current[i] ?? ""}
              hint={revealed.positions[String(i)]}
              size={size}
              index={i}
            />
          )),
          `current-${shake}`,
          shake > 0 ? "animate-shake" : ""
        )}

      {Array.from({ length: blanks }, (_, r) =>
        row(
          Array.from({ length }, (_, i) => (
            <Tile
              key={i}
              char=""
              hint={revealed.positions[String(i)]}
              size={size}
              index={i}
            />
          )),
          `blank-${r}`
        )
      )}
    </div>
  );
}

/** What the three colours mean. Shown once, above the board. */
export function BoardLegend() {
  const items: { mark: Mark; label: string }[] = [
    { mark: "g", label: "Right character, right place" },
    { mark: "o", label: "In the password, wrong place" },
    { mark: "r", label: "Not in the password" },
  ];
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
      {items.map(({ mark, label }) => (
        <li key={mark} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-sm border ${MARK_STYLES[mark]}`} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
