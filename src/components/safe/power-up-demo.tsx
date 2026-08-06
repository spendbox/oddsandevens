"use client";

// What the thing you are about to buy actually does, shown rather than described.
//
// The shelf explains each power-up in a paragraph, and a paragraph is asking a
// player to imagine the result at exactly the moment they are deciding whether
// to spend real money on it. So every dialog runs a four-second loop of the
// effect happening to a sample password — a made-up one, obviously, and the
// same made-up one every time, because the demo must never be a hint.
//
// Everything here is CSS: `transform` and `opacity` only, one shared cycle
// length, and it all holds still under `prefers-reduced-motion`. No timers, no
// state, nothing that has to be cleaned up when a dialog closes.

import type { CSSProperties } from "react";
import { isScanKind, SCANS, type PowerUpKind, type ScanField } from "@/lib/game/power-ups";
import { visible } from "@/lib/constants";

/**
 * The password every demo is performed on. Never a real one, and chosen so
 * that every counter's answer on it is non-zero — a demo that answers "0" is
 * demonstrating nothing.
 */
const SAMPLE = "Tr0ub 4d!";

/** Whether a sample character belongs to a class. Presentation only. */
const MATCHES: Record<ScanField, (ch: string) => boolean> = {
  upper: (ch) => /[A-Z]/.test(ch),
  lower: (ch) => /[a-z]/.test(ch),
  numbers: (ch) => /[0-9]/.test(ch),
  spaces: (ch) => ch === " ",
  symbols: (ch) => !/[A-Za-z0-9]/.test(ch) && ch !== " ",
  vowels: (ch) => /[aeiou]/i.test(ch),
  consonants: (ch) => /[a-z]/i.test(ch) && !/[aeiou]/i.test(ch),
};

export function PowerUpDemo({ kind }: { kind: PowerUpKind }) {
  return (
    <div
      aria-hidden
      className="relative flex h-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/10 bg-black/35 px-3"
    >
      {isScanKind(kind) ? (
        <ScanDemo field={SCANS[kind].field} />
      ) : kind === "length_lock" ? (
        <LengthDemo />
      ) : kind === "second_wind" ? (
        <WindDemo />
      ) : kind === "breakdown" ? (
        <ColourDemo />
      ) : (
        <XRayDemo />
      )}
    </div>
  );
}

/** One character of the sample, face down unless something has revealed it. */
function Tile({
  children,
  tone = "hidden",
  className = "",
  style,
}: {
  children: React.ReactNode;
  tone?: "hidden" | "lit" | "plain";
  className?: string;
  style?: CSSProperties;
}) {
  const face =
    tone === "lit"
      ? "border-brass bg-brass/25 text-brass"
      : tone === "plain"
        ? "border-white/15 bg-white/8 text-zinc-300"
        : "border-white/12 bg-white/5 text-zinc-600";
  return (
    <span
      style={style}
      className={`flex size-6 shrink-0 items-center justify-center rounded border-2 font-mono text-xs font-black ${face} ${className}`}
    >
      {children}
    </span>
  );
}

/** A chip stating the answer, popping in once the effect has run. */
function Answer({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span
      style={{ animationName: "demo-pop", ["--i" as string]: 6 } as CSSProperties}
      className={`demo-run rounded-full px-2.5 py-1 text-xs font-black ${tone}`}
    >
      {children}
    </span>
  );
}

/** Length Lock: two jaws close on the row and the count appears. */
function LengthDemo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center gap-0.5 px-4">
        <span
          style={{ animationName: "demo-clamp", ["--dir" as string]: -1 } as CSSProperties}
          className="demo-run absolute left-0 h-8 w-1.5 rounded-full bg-sky"
        />
        {[...SAMPLE].map((_, i) => (
          <Tile key={i}>?</Tile>
        ))}
        <span
          style={{ animationName: "demo-clamp", ["--dir" as string]: 1 } as CSSProperties}
          className="demo-run absolute right-0 h-8 w-1.5 rounded-full bg-sky"
        />
      </div>
      <Answer tone="bg-sky/20 text-sky">{SAMPLE.length} characters</Answer>
    </div>
  );
}

/** Second Wind: guesses go out, the pool doesn't move. */
function WindDemo() {
  return (
    <div className="flex items-center gap-3">
      {/* Guesses going out. Laid in a row rather than stacked at percentage
          offsets, which put three 28px chips inside 64px and produced one
          illegible smear reading "trytrytry". */}
      <div className="flex h-16 items-end gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={
              { animationName: "demo-fire", ["--i" as string]: i * 7 } as CSSProperties
            }
            className="demo-run rounded bg-brass/25 px-1.5 py-0.5 font-mono text-[10px] font-black text-brass"
          >
            try
          </span>
        ))}
      </div>
      <div className="flex flex-col items-start gap-1.5">
        {/* The pool, deliberately static — that is the whole product. */}
        <span className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-berry" />
          ))}
        </span>
        <Answer tone="bg-mint/20 text-mint">No lives spent</Answer>
      </div>
    </div>
  );
}

/** Colour Read: one number becoming four. */
function ColourDemo() {
  const parts: [string, string, string][] = [
    ["44%", "bg-mark-green", "exact"],
    ["23%", "bg-mark-orange", "wrong case"],
    ["21%", "bg-sky", "elsewhere"],
    ["12%", "bg-grape", "both wrong"],
  ];
  return (
    <div className="flex w-full max-w-[16rem] flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-black text-zinc-400">62%</span>
        <span className="text-xs text-zinc-600">→</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <span className="flex h-full">
            {parts.map(([w, tone], i) => (
              <span
                key={w}
                style={{
                  animationName: "demo-split",
                  ["--i" as string]: i * 3,
                  width: w,
                  transformOrigin: "left",
                } as CSSProperties}
                className={`demo-run h-full ${tone}`}
              />
            ))}
          </span>
        </span>
      </div>
      <div className="flex justify-between gap-1">
        {parts.map(([, tone, label], i) => (
          <span
            key={label}
            style={{ animationName: "demo-pop", ["--i" as string]: i * 3 + 2 } as CSSProperties}
            className="demo-run flex items-center gap-1 text-[10px] font-bold text-zinc-400"
          >
            <span className={`size-2 rounded-full ${tone}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** X-Ray: some of the characters turn face up. Unordered, and it shows that. */
function XRayDemo() {
  // Deliberately out of order and deliberately not all of them: the two things
  // the caveat says, said again in pictures.
  const shown = new Map(
    [1, 4, 6, 8].map((i) => [i, visible(SAMPLE[i])] as const)
  );
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[...SAMPLE].map((_, i) =>
          shown.has(i) ? (
            <Tile
              key={i}
              tone="lit"
              className="demo-run"
              style={
                { animationName: "demo-flip", ["--i" as string]: i } as CSSProperties
              }
            >
              {shown.get(i)}
            </Tile>
          ) : (
            <Tile key={i}>•</Tile>
          )
        )}
      </div>
      <Answer tone="bg-brass/20 text-brass">4 characters, in no order</Answer>
    </div>
  );
}

/** What one of each class is called, singular. */
const NOUNS: Record<ScanField, string> = {
  upper: "capital",
  lower: "lowercase letter",
  numbers: "digit",
  spaces: "space",
  symbols: "symbol",
  vowels: "vowel",
  consonants: "consonant",
};

/** A counter: a beam crosses the row and the matching characters light up. */
function ScanDemo({ field }: { field: ScanField }) {
  const chars = [...SAMPLE];
  const hits = chars.filter((ch) => MATCHES[field](ch)).length;
  const noun = NOUNS[field];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center gap-0.5 overflow-hidden px-1 py-1">
        {chars.map((ch, i) => (
          <span key={i} className="relative">
            <Tile tone="plain">{visible(ch)}</Tile>
            {MATCHES[field](ch) && (
              <span
                style={
                  {
                    animationName: "demo-lit",
                    // Lit as the beam reaches it, not all at once.
                    ["--i" as string]: i * 3,
                  } as CSSProperties
                }
                className="demo-run absolute inset-0 rounded-md border-2 border-brass bg-brass/30"
              />
            )}
          </span>
        ))}
        {/* Full width, not a narrow bar. `translateX` is a percentage of the
            *element*, so a 32px sweep travelling "100%" crosses 32px and parks
            over the first tile — which reads as that tile being a hit. At full
            width the same keyframe carries the band the length of the row. */}
        <span
          style={
            {
              animationName: "demo-sweep",
              backgroundImage:
                "linear-gradient(90deg, transparent 40%, rgb(255 194 71 / 0.5) 50%, transparent 60%)",
            } as CSSProperties
          }
          className="demo-run pointer-events-none absolute inset-0"
        />
      </div>
      <Answer tone="bg-brass/20 text-brass">
        {hits} {hits === 1 ? noun : `${noun}s`}
      </Answer>
    </div>
  );
}
