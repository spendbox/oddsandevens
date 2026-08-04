"use client";

// The thing you are playing against, as a place rather than a picture.
//
// A password game is, mechanically, a text field and a number. That is a fine
// description of the rules and a terrible screen: nothing about it says there
// is money behind this, that other people are working on it, or that you are
// getting closer. So the middle of the play screen is a scene — a lit room, a
// safe standing in it with real depth, and ten locks laid over the door that
// open as your score climbs.
//
// Three layers, back to front:
//
//   1. The room.   Drifting orbs in the safe's own colours, and password
//                  characters rising through them. Pure decoration, and the
//                  only decoration on the screen.
//   2. The vault.  Planes at different depths inside one `preserve-3d`
//                  container, so the idle rotation gives real parallax
//                  between the cabinet, the door and the dial rather than
//                  sliding a flat image around.
//   3. The x-ray.  Ten locks in a ring, one per ten points of score, and a
//                  scanning line. This is the read-out: everything else here
//                  is atmosphere, this is the game.
//
// What it deliberately does not do is say anything in words. The screen used
// to explain the length hint, the score, the power-ups and the life economy
// inline; all of that is one tap away in the explainer now, and what is left
// is the safe, the number and ten locks.

import { useEffect, useRef, useState } from "react";
import { DESIGN_SPECS, type Design } from "@/lib/game/designs";

/** How many locks the door has. One per ten points of score. */
export const LOCKS = 10;

/** Locks opened by a score. 20% opens two, 40% four, 100% all ten. */
export function locksOpen(percent: number): number {
  return Math.max(0, Math.min(LOCKS, Math.floor(percent / (100 / LOCKS))));
}

export function VaultScene({
  design,
  /** The score driving the locks: the last guess, or 0 before there is one. */
  percent,
  /** Set for one beat after a guess is refused — the scene flinches. */
  recoil,
  /** Cracked. The door swings and the locks all stand open. */
  open,
  className = "",
}: {
  design: Design;
  percent: number;
  recoil?: boolean;
  open?: boolean;
  className?: string;
}) {
  const spec = DESIGN_SPECS[design];
  const target = open ? LOCKS : locksOpen(percent);

  // Locks open one after another rather than all at once. A jump from two to
  // seven is the best thing that can happen in this game and it deserves more
  // than a re-render.
  const shown = useStaggered(target);

  return (
    <div
      className={
        // A framed viewport into the room, not a bleeding background. The orbs
        // are blurred well past their own edges, and without a frame to stop
        // them the scene ended in a visible rectangle halfway down the page.
        "relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 " +
        className
      }
    >
      <Room accent={spec.body[0]} metal={spec.metal} warmth={target / LOCKS} />

      <div className="vault-stage relative flex items-center justify-center px-4 pb-16 pt-8">
        {/*
          `--r` is the lock ring's radius and has to be an absolute length:
          a percentage in `translate()` resolves against the *lock's* own box,
          not the safe's, which piled all ten of them on top of the dial.
        */}
        <div
          className={
            "vault-body relative [--r:3.9rem] min-[380px]:[--r:4.6rem] sm:[--r:5.3rem] " +
            (recoil ? "vault-recoil" : "")
          }
        >
          <Vault spec={spec} open={open} />
          <XRay open={shown} lit={target > 0} />
        </div>
      </div>
    </div>
  );
}

/**
 * Opens locks one at a time, ~90ms apart.
 *
 * Closing is immediate — a worse guess should take the locks back at once,
 * because pretending otherwise would mean showing a score you did not get.
 */
function useStaggered(target: number): number {
  const [shown, setShown] = useState(target);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    setShown((current) => {
      if (target <= current) return target;
      timer.current = window.setInterval(() => {
        setShown((n) => {
          if (n >= target) {
            if (timer.current) window.clearInterval(timer.current);
            return target;
          }
          return n + 1;
        });
      }, 90);
      return current;
    });
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [target]);

  return shown;
}

// ---------------------------------------------------------------------------
// 1. The room
// ---------------------------------------------------------------------------

/** Where the characters drifting through the room are drawn from. */
const CIPHER = "aA9#zQ7!kX3$mB5&pR2?wS8*";

/**
 * The room the safe stands in.
 *
 * It was three blurred circles, which is a background rather than a place —
 * nothing in it said where the floor was or where the light came from. It has
 * both now:
 *
 *   a horizon    a warm band the safe is silhouetted against
 *   a floor      a perspective grid running away underneath it, which is the
 *                single cheapest thing that turns a flat panel into a space
 *   a key light  one cone from above-left, which is where every other lit
 *                thing on this site is lit from
 *   weather      drifting orbs, hanging dust, and the password characters
 *
 * The colour temperature answers to the score: cold and blue with nothing
 * found, warm and gold as the locks give way. That is the one part of the
 * decoration doing a job — you can tell at a glance across a room how a hunt is
 * going, before reading a digit.
 */
function Room({
  accent,
  metal,
  warmth,
}: {
  accent: string;
  metal: string;
  /** 0–1, how close the hunt is. Drives the temperature of the light. */
  warmth: number;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* The far wall, and the horizon the safe stands against. */}
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={{
          background: `
            radial-gradient(120% 70% at 50% 108%, rgb(255 194 71 / ${0.05 + warmth * 0.3}) 0%, transparent 60%),
            linear-gradient(180deg, #0a0618 0%, #150e2b 55%, #221741 100%)
          `,
        }}
      />

      {/* The key light: one soft cone from above-left, the direction
          everything else in the art set is lit from. */}
      <div
        className="absolute -left-1/4 -top-1/2 size-[38rem] rounded-full opacity-25 blur-3xl transition-colors duration-1000"
        style={{ background: warmth > 0.45 ? "var(--brass)" : accent }}
      />

      {/* The floor. A perspective grid, laid flat and running to the horizon —
          the cheapest possible depth cue and by far the most effective. */}
      <div
        className="scene-floor absolute inset-x-[-40%] bottom-0 h-[42%] opacity-40"
        style={{
          background: `
            repeating-linear-gradient(to right, rgb(255 255 255 / 0.12) 0 1px, transparent 1px 56px),
            repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.12) 0 1px, transparent 1px 56px)
          `,
          transform: "perspective(220px) rotateX(62deg)",
          transformOrigin: "50% 100%",
          maskImage: "linear-gradient(to bottom, transparent, black 45%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 45%)",
        }}
      />

      {/* Weather. Two slow orbs on different periods, so the light never
          repeats in a way you can catch. */}
      <div
        className="scene-orb absolute -right-1/4 top-1/4 size-[22rem] rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--grape)", animation: "orb-b 18s ease-in-out infinite" }}
      />
      <div
        className="scene-orb absolute left-1/4 top-0 size-[16rem] rounded-full opacity-15 blur-3xl"
        style={{ background: metal, animation: "orb-c 22s ease-in-out infinite" }}
      />

      {/* Dust hanging in the beam. */}
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={`m${i}`}
          className="mote absolute size-1 rounded-full bg-white/60"
          style={{
            left: `${(i * 53) % 97}%`,
            top: `${(i * 31) % 88}%`,
            ["--mx" as string]: `${((i * 17) % 24) - 12}px`,
            ["--my" as string]: `${-8 - ((i * 11) % 18)}px`,
            animation: `mote ${7 + (i % 6)}s ease-in-out ${i * 0.4}s infinite`,
          }}
        />
      ))}

      {/* Characters rising through the room. Seeded from their own index
          rather than at random, so the server and the browser agree on what
          they say and React has nothing to complain about. */}
      {Array.from({ length: 10 }, (_, i) => {
        const char = CIPHER[(i * 7) % CIPHER.length];
        return (
          <span
            key={i}
            className="cipher absolute font-mono text-sm font-black text-white/25"
            style={{
              left: `${6 + ((i * 37) % 88)}%`,
              bottom: "-2rem",
              ["--drift" as string]: `${((i * 13) % 40) - 20}px`,
              ["--turn" as string]: `${((i * 29) % 40) - 20}deg`,
              animation: `cipher-rise ${11 + (i % 5) * 2}s linear ${i * 1.3}s infinite`,
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. The vault
// ---------------------------------------------------------------------------

type Spec = (typeof DESIGN_SPECS)[Design];

/**
 * The safe, in planes.
 *
 * Each piece sits at its own `translateZ`, which is what makes the idle lean
 * read as an object turning rather than an image sliding: the wheel travels
 * further across the screen than the door, and the door further than the
 * cabinet behind it.
 *
 * The first version of this was a rounded rectangle with a wheel on it, and it
 * read as a flat icon at any size. What was missing was *material*. Five things
 * fixed it and none of them is the 3D transform:
 *
 *   a rim         a metal band around the cabinet, which is the piece that
 *                 says this is machined rather than moulded
 *   rivets        eight of them around that band, at a size you can count
 *   brushed metal a fine repeating gradient across the door, so light behaves
 *                 the way it does on steel instead of on plastic
 *   an edge       the door's own thickness, drawn as a plate behind its face
 *   a glint       one highlight that crosses the door every nine seconds
 *
 * Together they are the difference between a shape the colour of a safe and a
 * thing that looks heavy.
 */
function Vault({ spec, open }: { spec: Spec; open?: boolean }) {
  return (
    <div
      className="relative size-48 min-[380px]:size-56 sm:size-64"
      style={{ transformStyle: "preserve-3d" }}
    >
      {/* The floor it stands on. Laid flat in the scene rather than painted
          under it, so the lean moves the shadow with the safe. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[88%] h-10 w-4/5 -translate-x-1/2 rounded-[50%] bg-black/70 blur-xl"
        style={{ transform: "translateX(-50%) translateZ(-70px) rotateX(76deg)" }}
      />

      {/* A rim light in the safe's own colour, so it separates from the room
          however dark the wall behind it goes. */}
      <div
        aria-hidden
        className="absolute -inset-3 rounded-[2.4rem] opacity-50 blur-2xl"
        style={{ background: spec.body[0], transform: "translateZ(-50px)" }}
      />

      {/* Cabinet: the case the door is set into. */}
      <div
        className="absolute inset-0 rounded-[2rem] border-2 border-ink"
        style={{
          transform: "translateZ(-30px)",
          background: `linear-gradient(155deg, ${spec.frame} 0%, #150e2b 85%)`,
          boxShadow:
            "inset 0 3px 0 rgb(255 255 255 / 0.22), inset 0 -8px 18px rgb(0 0 0 / 0.55), 0 40px 60px -30px rgb(0 0 0 / 0.95)",
        }}
      />

      {/* The machined band around the cabinet, and the rivets holding it on. */}
      <div
        className="absolute inset-[3%] rounded-[1.8rem] border-2 border-ink"
        style={{
          transform: "translateZ(-28px)",
          background: `linear-gradient(160deg, ${spec.metal}, ${spec.frame})`,
          boxShadow: "inset 0 2px 0 rgb(255 255 255 / 0.45), inset 0 -3px 6px rgb(0 0 0 / 0.4)",
        }}
      />
      {RIVETS.map((at) => (
        <span
          key={at}
          className={`absolute size-2 rounded-full border border-ink ${at}`}
          style={{
            transform: "translateZ(-26px)",
            background: `radial-gradient(circle at 32% 30%, #fff, ${spec.frame})`,
          }}
        />
      ))}

      {/* The cavity, and the light inside it. Dark while the safe is shut;
          when it opens this is what spills out. */}
      <div
        className="absolute inset-[8%] rounded-[1.5rem] transition-all duration-700"
        style={{
          transform: "translateZ(-24px)",
          background: open
            ? `radial-gradient(circle at 50% 42%, #fff8e0, ${spec.accent} 45%, ${spec.frame} 100%)`
            : "linear-gradient(160deg, #120c26, #06040f)",
          boxShadow: open
            ? `0 0 70px 12px ${spec.accent}`
            : "inset 0 8px 22px rgb(0 0 0 / 0.9)",
        }}
      />

      {/* The door's own thickness, sitting a little behind its face. Without
          this the door is a decal; with it, it is a slab. */}
      <div
        className="absolute inset-[10%] origin-left rounded-[1.3rem] transition-transform duration-1000 ease-[cubic-bezier(0.34,1.3,0.5,1)]"
        style={{
          background: spec.frame,
          transform: open ? "rotateY(-115deg) translateZ(-8px)" : "translateZ(-8px)",
        }}
      />

      {/* The door. Swings on its left edge when the box is cracked. */}
      <div
        className="absolute inset-[10%] origin-left overflow-hidden rounded-[1.3rem] border-2 border-ink transition-transform duration-1000 ease-[cubic-bezier(0.34,1.3,0.5,1)]"
        style={{
          background: `
            repeating-linear-gradient(102deg, rgb(255 255 255 / 0.07) 0 2px, transparent 2px 5px),
            linear-gradient(146deg, ${spec.body[0]} 0%, ${spec.body[1]} 62%, ${spec.frame} 100%)
          `,
          transform: open ? "rotateY(-115deg)" : "rotateY(0deg)",
          transformStyle: "preserve-3d",
          // Two bevels and a lip: lit from the top-left, shaded at the
          // bottom-right, with a hard edge underneath so the door has weight.
          boxShadow:
            "inset 2px 3px 0 rgb(255 255 255 / 0.45), inset -3px -5px 0 rgb(0 0 0 / 0.35), inset 0 -14px 26px rgb(0 0 0 / 0.35), 0 18px 40px -14px rgb(0 0 0 / 0.9)",
        }}
      >
        {/* A gloss across the upper third — the house rule for anything with a
            face, and what stops the door reading as flat paint. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-1.5 h-[30%] rounded-[1.1rem] bg-gradient-to-b from-white/45 to-transparent"
        />

        {/* The glint: one highlight crossing the metal, on a long period. */}
        <div
          aria-hidden
          className="scene-glint pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
        />

        {/* An inner panel line, the way a real door is pressed rather than
            moulded. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[8%] rounded-[0.9rem] border border-white/20"
          style={{ boxShadow: "inset 0 -2px 0 rgb(0 0 0 / 0.3)" }}
        />

        {/* Hinges, on the edge it swings from. */}
        <div className="absolute -left-1.5 top-[18%] h-[16%] w-3 rounded-full border-2 border-ink" style={{ background: spec.metal }} />
        <div className="absolute -left-1.5 bottom-[18%] h-[16%] w-3 rounded-full border-2 border-ink" style={{ background: spec.metal }} />

        {/* The handle, standing off the door face. */}
        <div
          className="absolute right-[7%] top-1/2 h-[34%] w-3 rounded-full border-2 border-ink"
          style={{
            background: `linear-gradient(90deg, ${spec.metal}, ${spec.body[1]})`,
            transform: "translateY(-50%) translateZ(12px)",
          }}
        />

        {/* The wheel. */}
        <Wheel spec={spec} />
      </div>
    </div>
  );
}

/** Eight rivets around the cabinet band, at a size you can count. */
const RIVETS = [
  "left-[7%] top-[7%]",
  "left-1/2 top-[5%] -translate-x-1/2",
  "right-[7%] top-[7%]",
  "left-[5%] top-1/2 -translate-y-1/2",
  "right-[5%] top-1/2 -translate-y-1/2",
  "left-[7%] bottom-[7%]",
  "left-1/2 bottom-[5%] -translate-x-1/2",
  "right-[7%] bottom-[7%]",
];

/**
 * The vault wheel: rim, four spokes, hub.
 *
 * Drawn in SVG rather than assembled from divs because it is all arcs and
 * radial marks — twenty-four knurls around a rim is one `Array.from` here and
 * twenty-four absolutely positioned elements otherwise.
 */
function Wheel({ spec }: { spec: Spec }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute left-1/2 top-1/2 size-[46%]"
      style={{ transform: "translate(-50%, -50%) translateZ(18px)" }}
      aria-hidden
    >
      <defs>
        <radialGradient id="wheel-face" cx="34%" cy="28%">
          <stop offset="0" stopColor={spec.metal} />
          <stop offset="1" stopColor={spec.body[1]} />
        </radialGradient>
        <linearGradient id="wheel-spoke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={spec.accent} />
          <stop offset="1" stopColor={spec.body[1]} />
        </linearGradient>
      </defs>

      {/* Knurling, so the rim has something to grip. */}
      {Array.from({ length: 24 }, (_, i) => (
        <rect
          key={i}
          x="48.5"
          y="2"
          width="3"
          height="7"
          rx="1.5"
          fill={spec.body[1]}
          stroke="var(--ink)"
          strokeWidth="0.8"
          transform={`rotate(${i * 15} 50 50)`}
        />
      ))}

      <circle cx="50" cy="50" r="44" fill="url(#wheel-face)" stroke="var(--ink)" strokeWidth="3" />
      <circle cx="50" cy="50" r="35" fill="none" stroke="var(--ink)" strokeWidth="1.6" opacity="0.5" />

      {/* Four spokes at 45°, which is the angle every vault wheel in every
          photograph seems to be left at. */}
      {[45, 135, 225, 315].map((deg) => (
        <rect
          key={deg}
          x="46"
          y="12"
          width="8"
          height="38"
          rx="4"
          fill="url(#wheel-spoke)"
          stroke="var(--ink)"
          strokeWidth="2"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}

      <circle cx="50" cy="50" r="13" fill={spec.accent} stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="46" cy="46" r="4" fill="#fff" opacity="0.55" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 3. The x-ray
// ---------------------------------------------------------------------------

/**
 * Ten locks in a ring, and a scanning line.
 *
 * The ring is the score, restated as an object: ten locks, one per ten points,
 * opening from the top clockwise. It is the same information as the percentage
 * and it is the one people will actually read — "three of ten" is a position in
 * a game, "31.25%" is a measurement.
 *
 * It floats in front of the door at `translateZ(52px)`, far enough that turning
 * the safe separates it from the metal and it reads as a projection onto the
 * door rather than paint on it.
 */
function XRay({ open, lit }: { open: number; lit: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ transform: "translateZ(52px)" }}
    >
      {/* The pane. A cool wash and a hairline ring, so there is visibly a piece
          of equipment between you and the door. */}
      <div
        className="absolute inset-[10%] rounded-full border-2 border-sky/40 bg-sky/10 shadow-[0_0_40px_-6px_var(--sky)] transition-opacity duration-500"
        style={{ opacity: lit ? 1 : 0.45, animation: lit ? "ring-charge 2.4s ease-in-out infinite alternate" : undefined }}
      />

      {/* The sweep. Clipped to the pane so it reads as scanning the door. */}
      <div className="absolute inset-[10%] overflow-hidden rounded-full">
        <div
          className="xray-sweep absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-sky/60 to-transparent"
          style={{ animation: "xray-sweep 4.5s ease-in-out infinite" }}
        />
      </div>

      {Array.from({ length: LOCKS }, (_, i) => {
        // Clockwise from the top, so the first lock is where the eye lands.
        const angle = (i / LOCKS) * 360 - 90;
        const isOpen = i < open;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 flex size-6 items-center justify-center min-[380px]:size-7 sm:size-8"
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg) translate(var(--r)) rotate(${-angle}deg)`,
            }}
          >
            <Lock open={isOpen} index={i} />
          </span>
        );
      })}
    </div>
  );
}

/**
 * One lock.
 *
 * Open and closed differ in shape as well as colour — the shackle lifts and
 * swings clear — because a colour change alone is the one signal a
 * colourblind player might miss, and this is the entire read-out.
 */
function Lock({ open, index }: { open: boolean; index: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-full drop-shadow-lg"
      style={
        open
          ? { animation: `pin-open 0.45s cubic-bezier(0.34,1.56,0.64,1) ${index * 0.05}s both` }
          : undefined
      }
    >
      {/* Shackle. Closed: a squared-off U into the body. Open: swung up and
          out of the left side. */}
      <path
        d={open ? "M8 10 V7 a4 4 0 0 1 7.6-1.6" : "M8 10 V7 a4 4 0 0 1 8 0 v3"}
        fill="none"
        stroke={open ? "var(--mint)" : "#6b5a94"}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="10"
        width="14"
        height="11"
        rx="3"
        fill={open ? "var(--mint)" : "#3a2f5c"}
        stroke="var(--ink)"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="15.5" r="1.7" fill={open ? "var(--ink)" : "#6b5a94"} />
    </svg>
  );
}
