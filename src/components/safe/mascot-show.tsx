"use client";

// Boxy does a bit, above the guess box.
//
// The two seconds between deciding to guess and typing it are dead. This is
// what fills them: one of fifty short turns, picked at random each time the
// dialog opens, sitting on the lip of the sheet. Nobody will notice which one
// they got. They will notice that it is never the same twice.
//
// Fifty rather than ten because this dialog opens forty times an hour for
// somebody mid-siege, and at ten a turn comes round often enough to stop being
// a surprise and start being furniture.
//
// Each turn is a mood, a movement and at most one prop. That is the whole
// budget — a bit that needs explaining is a bit that has failed. Two are gone
// rather than added to: a full rotation and a repeated lean to the left, both
// of which read as a loading spinner that had got stuck, which is the one
// thing a mascot on a lip must never look like.

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
  // ---- up and down --------------------------------------------------------
  { mood: "cheer", move: "turn-hop", seconds: 0.9, prop: "coin", propMove: "prop-bounce" },
  { mood: "cheer", move: "turn-bounce", seconds: 1.2, prop: "star", propMove: "prop-pop" },
  { mood: "happy", move: "turn-spring", seconds: 1.1, prop: "none", propMove: "" },
  { mood: "thinking", move: "turn-hover", seconds: 2.6, prop: "bulb", propMove: "prop-shine" },
  { mood: "sly", move: "turn-skip", seconds: 1.3, prop: "key", propMove: "prop-toss" },
  { mood: "dizzy", move: "turn-thud", seconds: 1.4, prop: "none", propMove: "" },
  { mood: "happy", move: "turn-boing", seconds: 1, prop: "ball", propMove: "prop-bounce" },
  { mood: "cheer", move: "turn-jog", seconds: 0.8, prop: "none", propMove: "" },
  { mood: "sly", move: "turn-drum", seconds: 1, prop: "ball", propMove: "prop-bounce" },
  { mood: "happy", move: "turn-tiptoe", seconds: 2, prop: "note", propMove: "prop-drift" },
  { mood: "sad", move: "turn-dip", seconds: 1.9, prop: "none", propMove: "" },
  { mood: "sly", move: "turn-pounce", seconds: 1.2, prop: "crowbar", propMove: "prop-swing" },

  // ---- side to side -------------------------------------------------------
  { mood: "thinking", move: "turn-peek", seconds: 2.2, prop: "none", propMove: "" },
  { mood: "happy", move: "turn-slide", seconds: 2, prop: "coin", propMove: "prop-circle" },
  { mood: "cheer", move: "turn-shuffle", seconds: 1.4, prop: "none", propMove: "" },
  { mood: "dizzy", move: "turn-dodge", seconds: 1.6, prop: "ball", propMove: "prop-toss" },
  { mood: "happy", move: "turn-sway", seconds: 2.4, prop: "note", propMove: "prop-shine" },
  { mood: "sly", move: "turn-swoop", seconds: 1.8, prop: "key", propMove: "prop-orbit" },
  { mood: "sad", move: "turn-shiver", seconds: 1.1, prop: "none", propMove: "" },
  { mood: "dizzy", move: "turn-jitter", seconds: 0.6, prop: "none", propMove: "" },
  { mood: "sly", move: "turn-scoot", seconds: 1.7, prop: "coin", propMove: "prop-tag" },
  { mood: "thinking", move: "turn-glance", seconds: 1.9, prop: "none", propMove: "" },

  // ---- tilting ------------------------------------------------------------
  { mood: "happy", move: "turn-wobble", seconds: 1.4, prop: "crowbar", propMove: "prop-swing" },
  { mood: "thinking", move: "turn-tick", seconds: 1.6, prop: "none", propMove: "" },
  { mood: "happy", move: "turn-rock", seconds: 1.8, prop: "star", propMove: "prop-shine" },
  { mood: "happy", move: "turn-nod", seconds: 1.2, prop: "none", propMove: "" },
  { mood: "sad", move: "turn-headshake", seconds: 1.3, prop: "none", propMove: "" },
  { mood: "dizzy", move: "turn-tip", seconds: 2, prop: "none", propMove: "" },
  { mood: "dizzy", move: "turn-teeter", seconds: 1.5, prop: "ball", propMove: "prop-circle" },
  { mood: "sly", move: "turn-swagger", seconds: 1.7, prop: "key", propMove: "prop-tag" },
  { mood: "thinking", move: "turn-pendulum", seconds: 2.2, prop: "bulb", propMove: "prop-swing" },
  { mood: "sly", move: "turn-lurk", seconds: 2.1, prop: "none", propMove: "" },
  { mood: "cheer", move: "turn-strut", seconds: 1.4, prop: "star", propMove: "prop-toss" },
  { mood: "thinking", move: "turn-shrug", seconds: 1.6, prop: "none", propMove: "" },

  // ---- breathing and pulsing ---------------------------------------------
  { mood: "cheer", move: "turn-pump", seconds: 0.8, prop: "star", propMove: "prop-pop" },
  { mood: "thinking", move: "turn-breathe", seconds: 3, prop: "none", propMove: "" },
  { mood: "cheer", move: "turn-throb", seconds: 1.3, prop: "coin", propMove: "prop-pop" },
  { mood: "happy", move: "turn-inflate", seconds: 2.4, prop: "none", propMove: "" },
  { mood: "dizzy", move: "turn-squish", seconds: 1.2, prop: "none", propMove: "" },
  { mood: "sly", move: "turn-blip", seconds: 2.6, prop: "bulb", propMove: "prop-pop" },
  { mood: "sad", move: "turn-quiver", seconds: 1.4, prop: "none", propMove: "" },
  { mood: "dizzy", move: "turn-flicker", seconds: 1.8, prop: "none", propMove: "" },

  // ---- arrivals -----------------------------------------------------------
  { mood: "dizzy", move: "turn-tumble", seconds: 0.7, prop: "none", propMove: "" },
  { mood: "happy", move: "turn-dropin", seconds: 1.5, prop: "coin", propMove: "prop-rain" },
  { mood: "cheer", move: "turn-riseup", seconds: 1.6, prop: "star", propMove: "prop-pop" },
  { mood: "sly", move: "turn-slidein", seconds: 1.4, prop: "crowbar", propMove: "prop-swing" },
  { mood: "cheer", move: "turn-zoomin", seconds: 1.2, prop: "none", propMove: "" },
  { mood: "sly", move: "turn-peekaboo", seconds: 2.3, prop: "none", propMove: "" },
  { mood: "happy", move: "turn-float", seconds: 2.4, prop: "note", propMove: "prop-drift" },
  { mood: "thinking", move: "turn-orbitlite", seconds: 2.8, prop: "key", propMove: "prop-circle" },
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
