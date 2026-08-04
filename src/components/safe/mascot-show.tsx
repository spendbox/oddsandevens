"use client";

// Boxy does a bit, above the guess box.
//
// The two seconds between deciding to guess and typing it are dead. This is
// what fills them: one of ten short turns, picked at random each time the
// dialog opens, sitting on the lip of the sheet. Nobody will notice which one
// they got. They will notice that it is never the same twice.
//
// Each turn is a mood, a movement and at most one prop. That is the whole
// budget — a bit that needs explaining is a bit that has failed.

import { useState } from "react";
import { Boxy, type BoxyMood } from "@/components/art/boxy";

type Prop = "key" | "coin" | "ball" | "bulb" | "crowbar" | "star" | "note" | "none";

interface Turn {
  mood: BoxyMood;
  /** One of the `turn-*` keyframes in globals.css. */
  move: string;
  seconds: number;
  prop: Prop;
  /** One of the `prop-*` keyframes. */
  propMove: string;
}

const TURNS: Turn[] = [
  { mood: "sly", move: "turn-spin", seconds: 1.6, prop: "key", propMove: "prop-orbit" },
  { mood: "cheer", move: "turn-hop", seconds: 0.9, prop: "coin", propMove: "prop-bounce" },
  { mood: "thinking", move: "turn-peek", seconds: 2.2, prop: "none", propMove: "" },
  { mood: "happy", move: "turn-wobble", seconds: 1.4, prop: "crowbar", propMove: "prop-swing" },
  { mood: "cheer", move: "turn-pump", seconds: 0.8, prop: "star", propMove: "prop-pop" },
  { mood: "dizzy", move: "turn-tumble", seconds: 0.7, prop: "none", propMove: "" },
  { mood: "sad", move: "turn-shiver", seconds: 1.1, prop: "none", propMove: "" },
  { mood: "happy", move: "turn-float", seconds: 2.4, prop: "note", propMove: "prop-drift" },
  { mood: "thinking", move: "turn-lean", seconds: 1.8, prop: "bulb", propMove: "prop-pop" },
  { mood: "sly", move: "turn-drum", seconds: 1, prop: "ball", propMove: "prop-bounce" },
];

export function MascotShow({ className = "" }: { className?: string }) {
  // Chosen once, on mount, which is once per opening of the dialog. Lazy so it
  // is never called during a render the server might also run.
  const [turn] = useState(() => TURNS[Math.floor(Math.random() * TURNS.length)]);

  return (
    <div className={`pointer-events-none flex justify-center ${className}`} aria-hidden>
      <div className="relative">
        <span
          className="turn block"
          style={{ animation: `${turn.move} ${turn.seconds}s ease-in-out infinite` }}
        >
          <Boxy mood={turn.mood} still className="size-20 drop-shadow-2xl" />
        </span>

        {turn.prop !== "none" && (
          <span
            className="turn-prop absolute left-1/2 top-1/2 -ml-3 -mt-3 block size-6"
            style={{ animation: `${turn.propMove} ${turn.seconds}s ease-in-out infinite` }}
          >
            <PropArt kind={turn.prop} />
          </span>
        )}
      </div>
    </div>
  );
}

function PropArt({ kind }: { kind: Prop }) {
  const stroke = { stroke: "var(--ink)", strokeWidth: 2 } as const;
  return (
    <svg viewBox="0 0 24 24" className="size-full">
      {kind === "key" && (
        <g {...stroke}>
          <circle cx="7" cy="12" r="5" fill="var(--brass)" />
          <path d="M12 12 H21 M18 12 v4 M21 12 v3" fill="none" strokeLinecap="round" />
        </g>
      )}
      {kind === "coin" && (
        <g {...stroke}>
          <circle cx="12" cy="12" r="9" fill="var(--brass)" />
          <circle cx="12" cy="12" r="5" fill="var(--brass-bright)" />
        </g>
      )}
      {kind === "ball" && (
        <g {...stroke}>
          <circle cx="12" cy="12" r="9" fill="var(--berry)" />
          <path d="M4 10 q8 5 16 0" fill="none" />
        </g>
      )}
      {kind === "bulb" && (
        <g {...stroke}>
          <circle cx="12" cy="10" r="7" fill="var(--brass-bright)" />
          <rect x="9" y="16" width="6" height="5" rx="2" fill="var(--brass-deep)" />
        </g>
      )}
      {kind === "crowbar" && (
        <g {...stroke}>
          <path d="M5 20 L17 6 q3 -3 2 -4" fill="none" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}
      {kind === "star" && (
        <path
          d="M12 2 l3 6.5 7 1 -5 5 1.2 7-6.2-3.4-6.2 3.4 1.2-7-5-5 7-1z"
          fill="var(--brass)"
          {...stroke}
        />
      )}
      {kind === "note" && (
        <g {...stroke}>
          <circle cx="9" cy="18" r="4" fill="var(--grape)" />
          <path d="M13 18 V5 l7 -2 v12" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
