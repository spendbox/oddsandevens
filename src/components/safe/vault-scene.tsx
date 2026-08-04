"use client";

// The place you are playing in, and it is the whole screen.
//
// This used to be a safe, face-on, floating in a rounded box in the middle of
// the page with the interface stacked above and below it. That is a picture of
// the game rather than the game: nothing was behind the door, nothing was in
// front of it, and the only thing that ever moved was the safe itself.
//
// It is a side-on cutaway now, and everything follows from that one decision.
// Side-on means there is a *near* side and a *far* side, so there is somewhere
// for Boxy to stand and something for him to stand in front of. Cutaway means
// the chamber is open to you while the door is shut, so the gold is visible the
// entire time — which is the point, because the gold is the reason anybody is
// here and it was previously a line of text at the top of the page.
//
// Back to front:
//
//   the sky      a full-bleed gradient that follows the player's own clock.
//                Dawn, day, dusk, night, with the sun or the moon in it.
//   the chamber  drawn in section: shell, lit interior, and the gold stacked
//                on the floor of it. Tapping the gold says what it is worth.
//   the door     a thick door on the near face of the chamber, with the wheel
//                Boxy is hauling on and the ten bolts down its leading edge
//   Boxy         standing on the floor, hands on the wheel
//
// The sky and the floor fill the viewport. The chamber, the door and Boxy live
// inside one stage of fixed proportion anchored to the floor, so they keep
// their relationship to each other at every screen size instead of drifting
// apart on a wide one.

import { useEffect, useRef, useState } from "react";
import { DESIGN_SPECS, type Design } from "@/lib/game/designs";
import { barsFor, daypartAt, stackRows, type Daypart } from "@/lib/game/vault";
import { Cracker, type CrackerState } from "./cracker";

export type { CrackerState };

/** How many bolts hold the door. One per ten points of score. */
export const LOCKS = 10;

/** Bolts drawn by a score. 20% draws two, 40% four, 100% all ten. */
export function locksOpen(percent: number): number {
  return Math.max(0, Math.min(LOCKS, Math.floor(percent / (100 / LOCKS))));
}

export function VaultScene({
  design,
  /** The score driving the bolts: the last guess, or 0 before there is one. */
  percent,
  /** What is in the chamber, in kobo. Decides how much gold is stacked. */
  rewardKobo,
  /** Cracked. The door swings and the light comes out. */
  open,
  /** Bumped once per guess, so every bolt takes the hit even when none give. */
  jolt = 0,
  /** What Boxy is doing. */
  cracker = "idle",
  /** Tapping the gold. */
  onGold,
  className = "",
}: {
  design: Design;
  percent: number;
  rewardKobo: number;
  open?: boolean;
  jolt?: number;
  cracker?: CrackerState;
  onGold?: () => void;
  className?: string;
}) {
  const spec = DESIGN_SPECS[design];
  const target = open ? LOCKS : locksOpen(percent);
  const shown = useStaggered(target);
  const daypart = useDaypart();
  const rows = stackRows(barsFor(rewardKobo));

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <Sky daypart={daypart} warmth={target / LOCKS} />
      <Floor daypart={daypart} />

      {/*
        One stage of fixed proportion, anchored to the floor and centred. The
        vault and the character are positioned inside it as percentages, so
        they hold their arrangement from a 320px phone to a desktop instead of
        sliding away from each other.
      */}
      <div className="absolute inset-x-0 bottom-[15%] mx-auto h-[48%] w-full max-w-[32rem] px-2">
        <div className="absolute inset-0">
          <Chamber spec={spec} rows={rows} open={open} onGold={onGold} />
          <Door spec={spec} open={open} bolts={shown} jolt={jolt} />
          {/* Positioned so his hands land on the wheel rather than near it —
              the whole pose is "pulling on that", and an inch of daylight
              between the two undoes it. */}
          <Cracker
            state={cracker}
            className="absolute bottom-[7%] left-[-2%] h-[54%] drop-shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Bolts draw one after another rather than all at once.
 *
 * Closing is immediate — a worse guess should take them back at once, because
 * pretending otherwise would mean showing a score you did not get.
 */
function useStaggered(target: number): number {
  const [shown, setShown] = useState(target);
  // Mirrors `shown` so the effect can compare against it without reading state
  // during render or bouncing a value through a setState callback.
  const at = useRef(target);

  useEffect(() => {
    if (target <= at.current) {
      at.current = target;
      setShown(target);
      return;
    }
    const timer = window.setInterval(() => {
      at.current += 1;
      setShown(at.current);
      if (at.current >= target) window.clearInterval(timer);
    }, 90);
    return () => window.clearInterval(timer);
  }, [target]);

  return shown;
}

/**
 * The hour, read from the player's own clock.
 *
 * Deliberately after mount rather than during render: the server has no idea
 * what time it is where you are, and guessing would mean the first paint
 * disagreeing with the second. Night is the default because it is the brand,
 * and because somebody arriving in daylight seeing night for 200ms is a nicer
 * failure than a night player being flashbanged.
 */
function useDaypart(): Daypart {
  const [daypart, setDaypart] = useState<Daypart>("night");

  useEffect(() => {
    const read = () => setDaypart(daypartAt(new Date().getHours()));
    read();
    // Checked every ten minutes, so a session that runs past sunset sees it.
    const id = window.setInterval(read, 600_000);
    return () => window.clearInterval(id);
  }, []);

  return daypart;
}

// ---------------------------------------------------------------------------
// The sky
// ---------------------------------------------------------------------------

/** Block heights, in pixels. Fixed so every render draws the same city. */
const SKYLINE = [34, 58, 26, 72, 44, 90, 38, 64, 30, 80, 48, 22, 68, 40, 56, 28];

const SKIES: Record<Daypart, { grad: string; body: string; glow: string; stars: number }> = {
  dawn: {
    grad: "linear-gradient(180deg, #2b2151 0%, #7d4a86 40%, #d9825c 76%, #ffb877 100%)",
    body: "#ffd9a0",
    glow: "rgb(255 176 110 / 0.55)",
    stars: 0.2,
  },
  day: {
    grad: "linear-gradient(180deg, #2f6fd0 0%, #59a7ea 45%, #9ed3f2 82%, #d3ecff 100%)",
    body: "#fff6d5",
    glow: "rgb(255 240 190 / 0.7)",
    stars: 0,
  },
  dusk: {
    grad: "linear-gradient(180deg, #241a49 0%, #5b2f74 36%, #b8496b 70%, #ef8250 100%)",
    body: "#ffcf9a",
    glow: "rgb(255 140 90 / 0.5)",
    stars: 0.4,
  },
  night: {
    grad: "linear-gradient(180deg, #08050f 0%, #150e2b 40%, #221749 74%, #2f2159 100%)",
    body: "#e9e4ff",
    glow: "rgb(200 190 255 / 0.35)",
    stars: 1,
  },
};

function Sky({ daypart, warmth }: { daypart: Daypart; warmth: number }) {
  const sky = SKIES[daypart];

  return (
    <div aria-hidden className="absolute inset-0">
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{ background: sky.grad }}
      />

      {/* Stars, faded by daypart rather than switched on and off. Seeded from
          the index so the server and the browser draw the same sky. */}
      {sky.stars > 0 &&
        Array.from({ length: 44 }, (_, i) => (
          <span
            key={i}
            className="mote absolute rounded-full bg-white"
            style={{
              left: `${(i * 37) % 99}%`,
              top: `${(i * 23) % 52}%`,
              width: i % 7 === 0 ? 3 : 2,
              height: i % 7 === 0 ? 3 : 2,
              opacity: sky.stars * (0.3 + ((i * 13) % 60) / 100),
              animation: `mote ${6 + (i % 5)}s ease-in-out ${i * 0.3}s infinite`,
            }}
          />
        ))}

      {/* The sun, or the moon. Same arc; which one you get is the only
          difference, so a session crossing sunset sees the swap in place. */}
      <div
        className="absolute left-[10%] top-[8%] size-14 rounded-full transition-all duration-1000 sm:size-20"
        style={{ background: sky.body, boxShadow: `0 0 70px 24px ${sky.glow}` }}
      >
        {daypart === "night" && (
          <>
            <span className="absolute left-3 top-3 size-3 rounded-full bg-black/10" />
            <span className="absolute right-3 top-7 size-2 rounded-full bg-black/10" />
            <span className="absolute left-6 top-9 size-1.5 rounded-full bg-black/10" />
          </>
        )}
      </div>

      {/* Clouds by day, and a skyline under all of it. Without a horizon the
          sky is a gradient rather than a place, and two thirds of the screen
          were saying nothing. */}
      {(daypart === "day" || daypart === "dusk") &&
        [
          { top: "18%", left: "8%", w: "9rem", o: 0.75 },
          { top: "30%", left: "58%", w: "7rem", o: 0.55 },
          { top: "11%", left: "72%", w: "5rem", o: 0.4 },
        ].map((c) => (
          <span
            key={c.left}
            className="absolute rounded-full bg-white blur-[6px]"
            style={{
              top: c.top,
              left: c.left,
              width: c.w,
              height: `calc(${c.w} / 3)`,
              opacity: c.o * (daypart === "dusk" ? 0.5 : 1),
            }}
          />
        ))}

      {/*
        A skyline, so the vault is somewhere. Drawn as a row of blocks rather
        than a masked silhouette: an SVG mask is one typo away from rendering
        nothing at all, and this is scenery — it has to be the cheapest, most
        boring thing on the screen.
      */}
      <div
        className="absolute inset-x-0 bottom-[23%] flex items-end justify-center gap-[2px] transition-opacity duration-1000"
        style={{ opacity: daypart === "day" ? 0.3 : 0.55 }}
      >
        {SKYLINE.map((h, i) => (
          <span
            key={i}
            className="relative w-[5%] rounded-t-sm bg-[#08050f]"
            style={{ height: `${h}px` }}
          >
            {/* Lit windows, at night only. Two per block, seeded by index. */}
            {daypart === "night" && i % 2 === 0 && (
              <>
                <span className="absolute left-1/4 top-2 size-1 rounded-[1px] bg-brass/70" />
                <span className="absolute right-1/4 top-5 size-1 rounded-[1px] bg-brass/50" />
              </>
            )}
          </span>
        ))}
      </div>

      {/* A wash from the vault itself, warming as the bolts give way. The one
          part of the sky that is about the game rather than the hour. */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 transition-opacity duration-1000"
        style={{
          background: "radial-gradient(70% 62% at 62% 100%, var(--brass), transparent 70%)",
          opacity: 0.05 + warmth * 0.32,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------

function Floor({ daypart }: { daypart: Daypart }) {
  const dark = daypart === "night" || daypart === "dawn";
  return (
    <div aria-hidden className="absolute inset-x-0 bottom-0 h-[24%]">
      <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={{
          background: dark
            ? "linear-gradient(180deg, #1c1436 0%, #08050f 100%)"
            : "linear-gradient(180deg, #40305f 0%, #1c1436 100%)",
        }}
      />
      {/* Boards running away from you, which is the cheapest depth there is. */}
      <div
        className="scene-floor absolute inset-x-[-30%] inset-y-0"
        style={{
          background:
            "repeating-linear-gradient(to right, rgb(255 255 255 / 0.09) 0 1px, transparent 1px 64px)",
          transform: "perspective(160px) rotateX(58deg)",
          transformOrigin: "50% 0%",
          maskImage: "linear-gradient(to bottom, black, transparent 78%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 78%)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The chamber, and the gold in it
// ---------------------------------------------------------------------------

type Spec = (typeof DESIGN_SPECS)[Design];

function Chamber({
  spec,
  rows,
  open,
  onGold,
}: {
  spec: Spec;
  rows: number[];
  open?: boolean;
  onGold?: () => void;
}) {
  const empty = rows.length === 0;

  return (
    <div className="absolute bottom-[8%] right-0 h-[78%] w-[62%]">
      {/* The shell, cut open towards you. */}
      <div
        className="absolute inset-0 rounded-r-3xl border-[3px] border-ink"
        style={{
          background: `linear-gradient(155deg, ${spec.frame} 0%, #150e2b 90%)`,
          boxShadow: "0 30px 50px -22px rgb(0 0 0 / 0.95)",
        }}
      />

      {/* The inside. Lit warmly, because there is gold in it. */}
      <div
        className="absolute inset-[6%] left-[14%] overflow-hidden rounded-r-2xl border-2 border-ink/60 transition-all duration-700"
        style={{
          background: open
            ? "radial-gradient(circle at 40% 65%, #fff3cf, #b8750f 72%)"
            : "linear-gradient(170deg, #241a49 0%, #0b0718 100%)",
          boxShadow: "inset 0 10px 26px rgb(0 0 0 / 0.85)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-1/2"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, rgb(255 214 120 / 0.4), transparent 70%)",
          }}
        />

        {/* The stack. A button, because tapping it is how you find out what it
            is worth — the figure is deliberately nowhere else on this screen. */}
        <button
          type="button"
          onClick={onGold}
          disabled={!onGold}
          aria-label="What is in this vault"
          className="absolute inset-x-0 bottom-0 flex flex-col-reverse items-center gap-[3px] px-[8%] pb-[8%] transition hover:brightness-110 disabled:cursor-default"
        >
          {empty ? (
            <span className="pb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              nothing but pride
            </span>
          ) : (
            rows.map((count, r) => (
              <span key={r} className="flex w-full justify-center gap-[2.5%]">
                {Array.from({ length: count }, (_, i) => (
                  <GoldBar key={i} index={r * 7 + i} />
                ))}
              </span>
            ))
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * One bar.
 *
 * A trapezoid rather than a rectangle — the front face of an ingot is wider at
 * the bottom, and that single angled edge is the difference between a stack of
 * gold and a bar chart.
 */
function GoldBar({ index }: { index: number }) {
  return (
    <span
      className="relative block h-2 flex-1 sm:h-2.5"
      style={{
        clipPath: "polygon(7% 0, 93% 0, 100% 100%, 0 100%)",
        background: "linear-gradient(180deg, #ffe89a 0%, #ffc247 45%, #b8750f 100%)",
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.7), 0 1px 0 rgb(0 0 0 / 0.45)",
        // A shimmer that crosses the pile rather than lighting every bar at
        // once, which would read as the whole thing blinking.
        animation: `gold-shimmer 5s ease-in-out ${(index % 9) * 0.22}s infinite`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------

function Door({
  spec,
  open,
  bolts,
  jolt,
}: {
  spec: Spec;
  open?: boolean;
  bolts: number;
  jolt: number;
}) {
  return (
    <div
      className="absolute bottom-[8%] left-[22%] h-[78%] w-[34%]"
      style={{ perspective: "900px" }}
    >
      {/* The jamb the door seats into, which stays put when the door swings. */}
      <div
        className="absolute inset-0 rounded-l-[2rem] border-[3px] border-ink"
        style={{ background: `linear-gradient(160deg, ${spec.metal}, ${spec.frame})` }}
      />

      {/* The door itself, hinged on its left edge. */}
      <div
        className="absolute inset-[7%] origin-left rounded-l-[1.6rem] rounded-r border-[3px] border-ink transition-transform duration-[1200ms] ease-[cubic-bezier(0.34,1.2,0.5,1)]"
        style={{
          background: `
            repeating-linear-gradient(100deg, rgb(255 255 255 / 0.06) 0 2px, transparent 2px 6px),
            linear-gradient(150deg, ${spec.body[0]} 0%, ${spec.body[1]} 60%, ${spec.frame} 100%)
          `,
          transform: open
            ? "translateX(-64%) rotateY(-58deg)"
            : "translateX(0) rotateY(0deg)",
          boxShadow:
            "inset 3px 4px 0 rgb(255 255 255 / 0.4), inset -4px -6px 0 rgb(0 0 0 / 0.35), 0 20px 40px -14px rgb(0 0 0 / 0.9)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 top-1.5 h-[22%] rounded-t-[1.3rem] bg-gradient-to-b from-white/40 to-transparent"
        />
        <div
          aria-hidden
          className="scene-glint pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />

        {/* The wheel Boxy has his hands on, at his shoulder height on the near
            edge — which is why he can reach it. */}
        <Wheel spec={spec} />

        {/* The bolts, down the leading edge: the edge they would actually
            shoot out of. Vertical, so ten fit a door taller than it is wide. */}
        {!open && <Bolts open={bolts} jolt={jolt} />}
      </div>
    </div>
  );
}

/** The wheel: rim, knurling, four spokes, hub. */
function Wheel({ spec }: { spec: Spec }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute left-1/2 top-1/2 w-[74%] -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      <defs>
        <radialGradient id="dw-face" cx="34%" cy="28%">
          <stop offset="0" stopColor={spec.metal} />
          <stop offset="1" stopColor={spec.body[1]} />
        </radialGradient>
      </defs>

      {Array.from({ length: 20 }, (_, i) => (
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
          transform={`rotate(${i * 18} 50 50)`}
        />
      ))}

      <circle cx="50" cy="50" r="43" fill="url(#dw-face)" stroke="var(--ink)" strokeWidth="3" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.5" />

      {[45, 135, 225, 315].map((deg) => (
        <rect
          key={deg}
          x="46"
          y="12"
          width="8"
          height="38"
          rx="4"
          fill={spec.accent}
          stroke="var(--ink)"
          strokeWidth="2"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}

      <circle cx="50" cy="50" r="12" fill={spec.accent} stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="46" cy="46" r="3.5" fill="#fff" opacity="0.6" />
    </svg>
  );
}

/**
 * Ten bolts down the door's leading edge.
 *
 * Thrown: out, seated in the jamb, dark. Drawn: pulled back into the door,
 * lit, with the empty socket glowing. The difference is a position as well as
 * a colour, so it survives being read by somebody who cannot tell mint from
 * slate — which matters, because this is the entire read-out.
 */
function Bolts({ open, jolt }: { open: number; jolt: number }) {
  return (
    <div
      aria-hidden
      className="absolute inset-y-[5%] right-[-11%] flex w-[20%] flex-col justify-between"
    >
      {Array.from({ length: LOCKS }, (_, i) => (
        <Bolt key={i} drawn={i < open} index={i} jolt={jolt} />
      ))}
    </div>
  );
}

function Bolt({ drawn, index, jolt }: { drawn: boolean; index: number; jolt: number }) {
  return (
    <span className="relative flex h-[7%] items-center">
      {/* The socket in the jamb, lit once its bolt has pulled out of it. */}
      <span
        className={
          "socket absolute right-0 h-full w-2/5 rounded-r-sm transition-colors duration-300 " +
          (drawn ? "bg-mint/80 shadow-[0_0_8px_var(--mint)]" : "bg-black/70")
        }
      />
      <span
        key={`${jolt}-${drawn}`}
        className={
          "bolt relative h-full w-full rounded-sm border transition-colors duration-300 " +
          (drawn
            ? "border-mint-deep bg-mint shadow-[0_0_10px_-1px_var(--mint)]"
            : "border-ink bg-[#7a68a6]")
        }
        style={{
          animation: drawn
            ? `bolt-draw-x 0.45s cubic-bezier(0.34,1.5,0.5,1) ${index * 0.05}s both`
            : `bolt-jolt-x 0.4s ease ${index * 0.02}s`,
        }}
      >
        <span className="absolute inset-x-0.5 top-1/2 h-px -translate-y-1/2 bg-white/50" />
      </span>
    </span>
  );
}
