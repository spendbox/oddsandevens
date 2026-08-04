"use client";

// A car chasing a runaway safe, seen from above, forever.
//
// The rule this screen is built on is that the game's one mechanic should be
// visible as an event. A guess either beat your own best or it did not, and
// that is a binary — so it is a shot that lands or a shot that goes wide, and
// the safe carries the damage from every one that landed. Ten hits and it
// bursts.
//
// Top-down because a chase needs two things moving in the same direction and a
// third — the ground — moving the other way, and from above you get all three
// with no horizon to draw. Endless because there is no level to finish: you are
// on this safe until it opens.
//
// Layers, back to front: verge, road, scenery, speed lines, safe, car, gunfire.
// Everything scrolls on its own period so nothing ever lines up twice.

import { useEffect, useState } from "react";
import { DESIGN_SPECS, type Design } from "@/lib/game/designs";
import { cracksFor, TERRAINS, TERRAIN_MS, type ChaseTerrain, type Shot } from "@/lib/game/chase";
import { daypartAt, type Daypart } from "@/lib/game/vault";
import type { Rival } from "@/lib/types";

export function ChaseScene({
  design,
  /** Best score so far. Decides how broken the safe looks. */
  percent,
  /** Bumped once per guess. */
  jolt = 0,
  /** What the last guess did — only a new personal best lands. */
  shot,
  /** Cracked. The safe bursts and the gold comes out. */
  open,
  /** Tapping the safe. */
  onSafe,
  /** The field: top ten on this box, closest first, you marked. */
  rivals = [],
  /** Tapping somebody's car. */
  onRival,
  /** Bumped when somebody *else* fires — their shot lands on the same safe. */
  rivalShot = 0,
  className = "",
}: {
  design: Design;
  percent: number;
  jolt?: number;
  shot?: Shot;
  open?: boolean;
  onSafe?: () => void;
  rivals?: Rival[];
  onRival?: (rival: Rival) => void;
  rivalShot?: number;
  className?: string;
}) {
  const terrain = useTerrain();
  const daypart = useDaypart();
  const cracks = open ? 10 : cracksFor(percent);
  const lanes = {
    mine: laneOf(rivals.findIndex((r) => r.you)),
    // Somebody else's shot comes from wherever the leader is, which is the car
    // a spectator is most likely to be looking at anyway.
    other: laneOf(rivals.findIndex((r) => !r.you)),
  };

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/*
        Keyed on the guess count so a landed shot remounts this and re-runs the
        shake. A flag in state plus a timer to clear it would do the same job
        and would also be a render per guess for a 400ms animation.
      */}
      <div
        key={shot === "hit" ? jolt : undefined}
        className={"absolute inset-0 " + (jolt > 0 && shot === "hit" ? "chase-shake" : "")}
      >
        <Verge terrain={terrain} />
        <Road terrain={terrain} />
        <Scenery terrain={terrain} />
        <Streaks />

        <Safe design={design} cracks={cracks} open={open} onTap={onSafe} />

        {/*
          The field. Ordered by how close each of them is, laid across six
          lanes and stepped back row by row, so nobody is ever behind anybody
          else — a leaderboard you can read at a glance only works if you can
          see all of it.
        */}
        <Field
          rivals={rivals}
          night={daypart === "night" || daypart === "dawn"}
          onRival={onRival}
        />

        {jolt > 0 && <Gunfire key={jolt} shot={shot ?? "miss"} lane={lanes.mine} />}
        {rivalShot > 0 && (
          <Gunfire key={`r${rivalShot}`} shot="hit" lane={lanes.other} quiet />
        )}
        {open && <Payday />}
      </div>

      {/* The hour of the day, as one tint over everything. Top-down has no sky
          to put a sun in, so this is where dawn, dusk and night live. */}
      <Daylight daypart={daypart} />

      {/* A vignette, so the HUD along the top and bottom always has something
          dark enough behind it to be legible over. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(8 5 15 / 0.72) 0%, transparent 22%, transparent 70%, rgb(8 5 15 / 0.78) 100%)",
        }}
      />
    </div>
  );
}

/** Where the chase is. Cycles in order — teleporting between biomes reads as a bug. */
function useTerrain(): ChaseTerrain {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setAt((n) => (n + 1) % TERRAINS.length), TERRAIN_MS);
    return () => window.clearInterval(id);
  }, []);
  return TERRAINS[at];
}

function useDaypart(): Daypart {
  const [daypart, setDaypart] = useState<Daypart>("night");
  useEffect(() => {
    const read = () => setDaypart(daypartAt(new Date().getHours()));
    read();
    const id = window.setInterval(read, 600_000);
    return () => window.clearInterval(id);
  }, []);
  return daypart;
}

// ---------------------------------------------------------------------------
// The ground
// ---------------------------------------------------------------------------

function Verge({ terrain }: { terrain: ChaseTerrain }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 transition-[background] duration-1000"
      style={{
        background: `linear-gradient(105deg, ${terrain.verge[0]}, ${terrain.verge[1]})`,
      }}
    />
  );
}

/**
 * The road.
 *
 * Two scrolling gradients: the surface, which is nearly uniform and there to
 * carry the speed, and the centre line, which is the only thing on this screen
 * whose motion you can actually count. Both on `background-position`, which the
 * compositor can move without laying anything out.
 */
function Road({ terrain }: { terrain: ChaseTerrain }) {
  return (
    <div aria-hidden className="absolute inset-y-0 left-1/2 w-[80%] -translate-x-1/2 sm:w-[62%]">
      {/* The surface itself does not move. A repeating band across it read as
          floor tiles rather than tarmac — the speed comes from the markings,
          the tyre tracks and the streaks, all of which are things that would
          actually be moving. */}
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          background: `linear-gradient(100deg, ${terrain.road[0]}, ${terrain.road[1]})`,
          boxShadow:
            "inset 14px 0 28px -14px rgb(0 0 0 / 0.7), inset -14px 0 28px -14px rgb(0 0 0 / 0.7)",
        }}
      />

      {/* Two worn strips where everything before you has driven. */}
      {["left-[24%]", "right-[24%]"].map((side) => (
        <div
          key={side}
          className={`absolute inset-y-0 w-[9%] bg-black/15 blur-[2px] ${side}`}
        />
      ))}

      {/* Centre line. */}
      <div
        className="chase-road absolute inset-y-0 left-1/2 w-[3%] -translate-x-1/2 opacity-80"
        style={{
          backgroundImage: `repeating-linear-gradient(180deg, ${terrain.paint} 0 70px, transparent 70px 240px)`,
          backgroundSize: "100% 240px",
        }}
      />

      {/* Edge markings. */}
      {["left-[3%]", "right-[3%]"].map((side) => (
        <div
          key={side}
          className={`absolute inset-y-0 w-[1.5%] opacity-50 ${side}`}
          style={{ background: terrain.paint }}
        />
      ))}
    </div>
  );
}

/** Scenery down both verges, on staggered loops. */
function Scenery({ terrain }: { terrain: ChaseTerrain }) {
  return (
    <div aria-hidden className="absolute inset-0">
      {PROPS.map((p, i) => (
        <span
          key={i}
          className="chase-prop absolute"
          style={{
            left: `${p.x}%`,
            top: 0,
            ["--dur" as string]: `${p.dur}s`,
            ["--delay" as string]: `${p.delay}s`,
            ["--s" as string]: p.scale,
          }}
        >
          <Prop kind={terrain.prop} colour={terrain.propColour} />
        </span>
      ))}
    </div>
  );
}

/**
 * Fixed positions, durations and delays.
 *
 * Seeded rather than random so the server and the browser lay out the same
 * roadside, and so a re-render never teleports a tree.
 */
const PROPS = [
  { x: 4, dur: 3.6, delay: 0, scale: 1 },
  { x: 12, dur: 4.4, delay: 1.3, scale: 0.8 },
  { x: 2, dur: 3.1, delay: 2.4, scale: 1.15 },
  { x: 14, dur: 5, delay: 3.4, scale: 0.7 },
  { x: 7, dur: 4, delay: 4.6, scale: 0.95 },
  { x: 84, dur: 3.4, delay: 0.7, scale: 1.05 },
  { x: 93, dur: 4.6, delay: 1.9, scale: 0.85 },
  { x: 88, dur: 3.9, delay: 3, scale: 1.2 },
  { x: 96, dur: 5.2, delay: 4.2, scale: 0.75 },
  { x: 82, dur: 4.2, delay: 5.1, scale: 0.9 },
];

function Prop({ kind, colour }: { kind: ChaseTerrain["prop"]; colour: [string, string] }) {
  const [light, dark] = colour;
  // Seen from above, so every one of these is a canopy with a trunk under it.
  return (
    <svg viewBox="0 0 40 40" className="size-12 drop-shadow-lg sm:size-16" aria-hidden>
      {kind === "block" ? (
        <>
          <rect x="6" y="6" width="28" height="28" rx="3" fill={dark} stroke="var(--ink)" strokeWidth="2" />
          <rect x="11" y="11" width="8" height="8" rx="1" fill={light} opacity="0.7" />
          <rect x="22" y="20" width="7" height="7" rx="1" fill={light} opacity="0.5" />
        </>
      ) : kind === "rock" ? (
        <path d="M8 30 L14 12 L26 9 L33 24 L27 32 Z" fill={dark} stroke="var(--ink)" strokeWidth="2" />
      ) : kind === "cactus" ? (
        <>
          <rect x="16" y="8" width="8" height="24" rx="4" fill={light} stroke="var(--ink)" strokeWidth="2" />
          <rect x="6" y="14" width="12" height="7" rx="3.5" fill={dark} stroke="var(--ink)" strokeWidth="2" />
          <rect x="22" y="19" width="12" height="7" rx="3.5" fill={dark} stroke="var(--ink)" strokeWidth="2" />
        </>
      ) : kind === "pine" ? (
        <>
          <circle cx="20" cy="20" r="14" fill={dark} stroke="var(--ink)" strokeWidth="2" />
          <path d="M20 8 L26 20 L20 32 L14 20 Z" fill={light} />
        </>
      ) : kind === "palm" ? (
        <>
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <ellipse
              key={deg}
              cx="20"
              cy="10"
              rx="5"
              ry="10"
              fill={light}
              stroke="var(--ink)"
              strokeWidth="1.6"
              transform={`rotate(${deg} 20 20)`}
            />
          ))}
          <circle cx="20" cy="20" r="4" fill={dark} stroke="var(--ink)" strokeWidth="2" />
        </>
      ) : (
        <>
          <circle cx="20" cy="20" r="15" fill={light} stroke="var(--ink)" strokeWidth="2" />
          <circle cx="16" cy="16" r="6" fill="#fff" opacity="0.18" />
          <circle cx="20" cy="20" r="4" fill={dark} />
        </>
      )}
    </svg>
  );
}

/** Speed lines over the road. */
function Streaks() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {STREAKS.map((s, i) => (
        <span
          key={i}
          className="chase-streak absolute w-[2px] rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            height: `${s.h}px`,
            ["--dur" as string]: `${s.dur}s`,
            ["--delay" as string]: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

const STREAKS = [
  { x: 26, h: 44, dur: 0.62, delay: 0 },
  { x: 34, h: 30, dur: 0.78, delay: 0.2 },
  { x: 44, h: 52, dur: 0.55, delay: 0.45 },
  { x: 56, h: 34, dur: 0.7, delay: 0.1 },
  { x: 64, h: 46, dur: 0.6, delay: 0.55 },
  { x: 72, h: 28, dur: 0.82, delay: 0.32 },
];

// ---------------------------------------------------------------------------
// The safe
// ---------------------------------------------------------------------------

/**
 * The runaway, from above: a strongbox on wheels with the lid facing you.
 *
 * The damage is the point. Ten crack paths are drawn into the lid, revealed one
 * per ten points of best score, each drawing itself in rather than appearing —
 * a crack that fades up is a texture, a crack that *travels* is something that
 * just happened to it.
 */
function Safe({
  design,
  cracks,
  open,
  onTap,
}: {
  design: Design;
  cracks: number;
  open?: boolean;
  onTap?: () => void;
}) {
  const spec = DESIGN_SPECS[design];

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      aria-label="What is in this safe"
      className="chase-safe absolute left-1/2 top-[15%] w-[26%] max-w-[9rem] disabled:cursor-default sm:w-[16%]"
    >
      <svg viewBox="0 0 100 120" className="w-full drop-shadow-2xl" aria-hidden>
        <defs>
          <linearGradient id="cs-lid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={spec.body[0]} />
            <stop offset="1" stopColor={spec.body[1]} />
          </linearGradient>
        </defs>

        {/* Wheels, poking out either side — the joke the whole scene rests on
            is that a safe should not be able to do this. */}
        {[18, 92].map((y) => (
          <g key={y}>
            <rect x="-2" y={y - 8} width="14" height="16" rx="5" fill="#1d1636" stroke="var(--ink)" strokeWidth="3" />
            <rect x="88" y={y - 8} width="14" height="16" rx="5" fill="#1d1636" stroke="var(--ink)" strokeWidth="3" />
          </g>
        ))}

        {/* The body. */}
        <rect x="6" y="8" width="88" height="104" rx="14" fill={spec.frame} stroke="var(--ink)" strokeWidth="4" />
        <rect x="12" y="14" width="76" height="92" rx="10" fill="url(#cs-lid)" stroke="var(--ink)" strokeWidth="3" />

        {/* Gloss along the top-left, so it reads as metal from above. */}
        <path d="M18 20 h58 a6 6 0 0 1 6 6 v8 H18 z" fill="#fff" opacity="0.25" />

        {/* Rivets. */}
        {[[22, 24], [78, 24], [22, 96], [78, 96]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" fill={spec.metal} stroke="var(--ink)" strokeWidth="2" />
        ))}

        {/* The dial, dead centre. */}
        <circle cx="50" cy="60" r="17" fill={spec.metal} stroke="var(--ink)" strokeWidth="3.5" />
        <circle cx="50" cy="60" r="7" fill={spec.accent} stroke="var(--ink)" strokeWidth="2.5" />
        {[0, 45, 90, 135].map((deg) => (
          <rect
            key={deg}
            x="48.5"
            y="44"
            width="3"
            height="8"
            rx="1.5"
            fill="var(--ink)"
            transform={`rotate(${deg} 50 60)`}
          />
        ))}

        {/* Damage. */}
        {CRACK_PATHS.slice(0, cracks).map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="60"
            style={{ animation: `crack-in 0.5s ease-out ${i * 0.04}s both` }}
          />
        ))}
        {/* A second, lighter pass just off the first, so a crack has a lip. */}
        {CRACK_PATHS.slice(0, cracks).map((d, i) => (
          <path
            key={`h${i}`}
            d={d}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.45"
            strokeWidth="1"
            transform="translate(1.2 1.2)"
            style={{ animation: `crack-in 0.5s ease-out ${i * 0.04}s both` }}
          />
        ))}

        {open && (
          <>
            <rect x="12" y="14" width="76" height="92" rx="10" fill="#fff6d5" opacity="0.85" />
            <circle cx="50" cy="60" r="34" fill="var(--brass)" opacity="0.5" />
          </>
        )}
      </svg>
    </button>
  );
}

/** Ten cracks, in the order they arrive. Fixed, so damage is never re-rolled. */
const CRACK_PATHS = [
  "M50 43 L44 28 L48 18",
  "M50 77 L58 92 L54 104",
  "M33 60 L18 55 L14 44",
  "M67 60 L84 66 L88 78",
  "M40 48 L26 34 L18 30",
  "M62 72 L78 88 L84 92",
  "M40 72 L24 84 L16 88",
  "M62 48 L76 32 L84 26",
  "M50 43 L38 20 L30 14",
  "M50 77 L64 100 L70 108",
];

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

/**
 * Six lanes across the road, and four rows back.
 *
 * The arrangement is the leaderboard: first place takes the middle of the front
 * row, and everybody else fills outward and backward. Nobody overlaps anybody,
 * which is the only reason a field of ten is readable at all — and the closer
 * you are to cracking it, the closer to the safe you are drawn.
 */
const GRID: { x: number; y: number }[] = [
  // Front row: the leader in the middle, second and third either side.
  { x: 50, y: 54 },
  { x: 33, y: 56 },
  { x: 67, y: 56 },
  // Second row, offset so it shows through the gaps in the first.
  { x: 41, y: 66 },
  { x: 59, y: 66 },
  { x: 28, y: 68 },
  // Third.
  { x: 50, y: 77 },
  { x: 34, y: 78 },
  { x: 66, y: 78 },
  // And the back marker.
  { x: 42, y: 87 },
];

function laneOf(index: number): { x: number; y: number } {
  return GRID[Math.max(0, index) % GRID.length];
}

function Field({
  rivals,
  night,
  onRival,
}: {
  rivals: Rival[];
  night: boolean;
  onRival?: (rival: Rival) => void;
}) {
  // Nobody on the board yet: one unbadged car, so the screen is never empty.
  if (rivals.length === 0) {
    return <Car night={night} at={laneOf(0)} scale={1} />;
  }

  return (
    <>
      {rivals.map((rival, i) => {
        const at = laneOf(i);
        return (
          <button
            key={`${rival.player}-${i}`}
            type="button"
            onClick={() => onRival?.(rival)}
            disabled={!onRival}
            aria-label={`${rival.player}, ${rival.percent.toFixed(1)}% in`}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2 disabled:cursor-default"
            style={{
              left: `${at.x}%`,
              top: `${at.y}%`,
              // Further back is further away.
              width: `${12.5 - Math.floor(i / 3) * 1.1}%`,
            }}
          >
            <Car night={night} mine={rival.you} inline />
            {rival.you && (
              <span className="mt-0.5 block rounded-full border border-brass/60 bg-background/85 px-1 text-[9px] font-black leading-tight text-brass">
                you
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------

/** The pursuit vehicle, from above, with the gun on the roof. */
function Car({
  night,
  mine,
  at,
  scale = 1,
  inline = false,
}: {
  night: boolean;
  /** Yours. Painted gold rather than grape, so you can find yourself. */
  mine?: boolean;
  at?: { x: number; y: number };
  scale?: number;
  /** Positioned by the caller rather than by itself. */
  inline?: boolean;
}) {
  const body: [string, string] = mine ? ["#ffd76e", "#b8750f"] : ["#b57bff", "#6b2fc4"];

  if (inline) {
    return <CarArt night={night} body={body} className="chase-car w-full" />;
  }

  return (
    <div
      className="chase-car absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${at?.x ?? 50}%`, top: `${at?.y ?? 58}%`, width: `${13 * scale}%` }}
    >
      <CarArt night={night} body={body} className="w-full" />
    </div>
  );
}

/**
 * One car.
 *
 * Small on purpose. It was a third of the screen wide, which is a car you are
 * sitting in rather than one you are watching — and there was no room for a
 * second. At this size ten of them fit the road with a lane between each.
 */
function CarArt({
  night,
  body,
  className = "",
}: {
  night: boolean;
  body: [string, string];
  className?: string;
}) {
  const uid = body[0].slice(1);
  return (
    <div className={`relative ${className}`}>
      {night && (
        // Headlights: two cones up the road, which is the whole of what night
        // costs and most of what it buys.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[-70%] bottom-[70%] h-[210%]"
          style={{
            background:
              "conic-gradient(from 200deg at 50% 100%, transparent 0deg, rgb(255 240 190 / 0.22) 25deg, transparent 50deg)",
            filter: "blur(5px)",
          }}
        />
      )}

      <svg viewBox="0 0 90 130" className="w-full drop-shadow-xl" aria-hidden>
        <defs>
          <linearGradient id={`cc-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={body[0]} />
            <stop offset="1" stopColor={body[1]} />
          </linearGradient>
        </defs>

        {/* Wheels first, so the body's outline covers where they meet it. */}
        {[32, 100].map((y) => (
          <g key={y}>
            <rect x="0" y={y - 12} width="14" height="24" rx="6" fill="#160f2c" stroke="var(--ink)" strokeWidth="3" />
            <rect x="76" y={y - 12} width="14" height="24" rx="6" fill="#160f2c" stroke="var(--ink)" strokeWidth="3" />
          </g>
        ))}

        <rect x="9" y="10" width="72" height="112" rx="24" fill={`url(#cc-${uid})`} stroke="var(--ink)" strokeWidth="4" />

        {/* Two stripes down the bonnet, which is most of what makes a top-down
            rectangle read as a car rather than a lozenge. */}
        <rect x="34" y="14" width="7" height="104" rx="3.5" fill="#fff" opacity="0.28" />
        <rect x="49" y="14" width="7" height="104" rx="3.5" fill="#fff" opacity="0.28" />

        {/* Windscreen and rear glass. */}
        <rect x="19" y="30" width="52" height="26" rx="11" fill="#160f2c" stroke="var(--ink)" strokeWidth="3" />
        <rect x="21" y="82" width="48" height="20" rx="9" fill="#211741" stroke="var(--ink)" strokeWidth="3" />
        <path d="M23 33 h44 v6 H23 z" fill="#fff" opacity="0.25" />

        {/* The gun, on the roof, pointing where the safe is. */}
        <circle cx="45" cy="66" r="11" fill="#d9cbf5" stroke="var(--ink)" strokeWidth="3" />
        <rect x="40" y="-6" width="10" height="66" rx="5" fill="#e6dcff" stroke="var(--ink)" strokeWidth="3" />
        <rect x="37" y="-8" width="16" height="9" rx="4" fill="#b9a6e8" stroke="var(--ink)" strokeWidth="3" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gunfire
// ---------------------------------------------------------------------------

/**
 * One shot, keyed on the guess count so it mounts fresh every time.
 *
 * A hit travels the gap and bursts on the lid; a miss travels the same distance
 * at the same speed and drifts wide past it. Same timing on purpose — a miss
 * that is visibly slower would be telling you the answer before it lands.
 */
function Gunfire({
  shot,
  lane,
  /** Somebody else's shot: same event, less of it. */
  quiet = false,
}: {
  shot: Shot;
  lane: { x: number; y: number };
  quiet?: boolean;
}) {
  const reach = `${-(lane.y - 20)}vh`;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {/* The muzzle: a hard flash, a ring of blast, and smoke left behind. */}
      <span
        className="absolute size-10 rounded-full bg-brass-bright blur-[3px]"
        style={{ left: `${lane.x}%`, top: `${lane.y - 6}%`, animation: "blast 0.3s ease-out both" }}
      />
      {!quiet && (
        <span
          className="absolute size-16 rounded-full bg-white/25 blur-md"
          style={{
            left: `${lane.x}%`,
            top: `${lane.y - 6}%`,
            animation: "smoke 0.9s ease-out 0.1s both",
          }}
        />
      )}

      {/* The round. */}
      <span
        className="absolute h-7 w-1.5 rounded-full bg-gradient-to-t from-transparent via-brass to-white shadow-[0_0_10px_var(--brass)]"
        style={{
          left: `${lane.x}%`,
          top: `${lane.y - 7}%`,
          ["--reach" as string]: reach,
          ["--wide" as string]: "18vw",
          animation:
            shot === "hit"
              ? "shot-hit 0.26s cubic-bezier(0.4,0,1,1) both"
              : "shot-miss 0.4s cubic-bezier(0.3,0,0.8,1) both",
        }}
      />

      {shot === "hit" && (
        <>
          {/* The impact: a white core, a ring going out, and chips off the
              lid. Three things, because one flash is a light switch. */}
          <span
            className="absolute size-12 rounded-full bg-white"
            style={{ left: "50%", top: "22%", animation: "blast 0.42s ease-out 0.22s both" }}
          />
          <span
            className="absolute size-20 rounded-full border-4 border-brass"
            style={{ left: "50%", top: "22%", animation: "impact 0.6s ease-out 0.24s both" }}
          />
          {CHIPS.map((c, i) => (
            <span
              key={i}
              className="absolute size-1.5 rounded-[1px] bg-brass-bright"
              style={{
                left: "50%",
                top: "22%",
                ["--dx" as string]: `${c.dx}px`,
                ["--dy" as string]: `${c.dy}px`,
                ["--dr" as string]: `${c.dr}deg`,
                animation: `chip 0.7s ease-out ${0.22 + i * 0.01}s both`,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

/** Debris off an impact. Fixed, so it never re-rolls mid-animation. */
const CHIPS = [
  { dx: -46, dy: -30, dr: 220 },
  { dx: 40, dy: -36, dr: -180 },
  { dx: -54, dy: 18, dr: 140 },
  { dx: 52, dy: 24, dr: -240 },
  { dx: -18, dy: -52, dr: 300 },
  { dx: 22, dy: 48, dr: -140 },
  { dx: 64, dy: -8, dr: 200 },
  { dx: -66, dy: -6, dr: -260 },
];

/** The safe finally gives, and what was in it comes out. */
function Payday() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-[22%] size-4 rounded-full border-2 border-brass-deep bg-brass"
            style={{
              ["--cx" as string]: `${Math.cos(angle) * (120 + (i % 5) * 26)}px`,
              ["--cy" as string]: `${Math.sin(angle) * (110 + (i % 4) * 24)}px`,
              ["--cr" as string]: `${(i % 2 ? 1 : -1) * 320}deg`,
              animation: `coin-burst ${1.4 + (i % 5) * 0.16}s ease-out ${(i % 7) * 0.08}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The hour
// ---------------------------------------------------------------------------

const LIGHT: Record<Daypart, string> = {
  dawn: "linear-gradient(180deg, rgb(255 176 110 / 0.22), rgb(80 40 110 / 0.28))",
  day: "linear-gradient(180deg, rgb(255 250 220 / 0.06), rgb(90 140 190 / 0.06))",
  dusk: "linear-gradient(180deg, rgb(230 100 90 / 0.24), rgb(50 30 90 / 0.34))",
  night: "linear-gradient(180deg, rgb(20 14 45 / 0.62), rgb(8 5 20 / 0.72))",
};

function Daylight({ daypart }: { daypart: Daypart }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
      style={{ background: LIGHT[daypart] }}
    />
  );
}
