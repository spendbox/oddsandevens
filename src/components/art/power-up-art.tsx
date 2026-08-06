// The shelf, drawn.
//
// These were lucide line icons — a ruler, a stack, a clock, a palette, an eye —
// and they were fine in the way a settings screen is fine. They are the only
// things in the game anybody pays money for, and they looked like toolbar
// buttons.
//
// So each one is now an *object*: a thing with weight, a gloss, an outline and
// a colour of its own, sitting on a coloured badge. The colour is not
// decoration — it is how you tell them apart at a glance on a shelf you visit
// forty times, and each is the accent that owns that idea elsewhere in the
// app.
//
//   Length Lock  sky      a measure
//   Second Wind  mint     time and freedom
//   Colour Read  berry    the colours behind a score
//   X-Ray        gold     seeing inside, the most valuable of them
//
// The seven counters share one drawing — a card with a beam under it — and
// differ only by the glyph on the card and the colour of the badge. That is on
// purpose: they are one idea sold seven times, and seven unrelated pictures
// for seven identical products is how a shelf becomes unreadable.
//
// All of them are drawn in one 64-unit box so they line up at any size, and
// every gradient id is prefixed with the kind so a dozen on one page don't
// collide.

import type { PowerUpKind } from "@/lib/game/power-ups";
import { Gloss, Grad, Halo, INK, Sparkle, STROKE } from "./ink";

export const POWER_UP_COLOURS: Record<PowerUpKind, { from: string; to: string }> = {
  length_lock: { from: "#7ddcf7", to: "#16759f" },
  second_wind: { from: "#7ff0bb", to: "#11855a" },
  breakdown: { from: "#ff9ab8", to: "#b8214c" },
  x_ray: { from: "#ffe08a", to: "#b8750f" },
  upper_case: { from: "#cfa4ff", to: "#6b2fc4" },
  lower_case: { from: "#c9b2ff", to: "#5326a8" },
  symbol_count: { from: "#ffc082", to: "#c05a12" },
  digit_count: { from: "#9df0a6", to: "#1a8a40" },
  space_count: { from: "#a8e6ff", to: "#1a6e9c" },
  vowel_scan: { from: "#ffa8d8", to: "#a81d6d" },
  consonant_scan: { from: "#aebcff", to: "#3843b5" },
  // Gold, alone among them. The pack is the only thing on the shelf that is
  // not one idea — it is all of them — so it does not belong to any accent.
  power_pack: { from: "#ffe08a", to: "#b8750f" },
};

/** The glyph on each counter's card — the class it counts, in two characters. */
const SCAN_GLYPHS: Record<string, string> = {
  upper_case: "AB",
  lower_case: "ab",
  symbol_count: "#$",
  digit_count: "42",
  space_count: "␣␣",
  vowel_scan: "AE",
  consonant_scan: "BC",
};

export function PowerUpArt({
  kind,
  className = "",
}: {
  kind: PowerUpKind;
  className?: string;
}) {
  const uid = `pu-${kind}`;
  const c = POWER_UP_COLOURS[kind];

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <Grad id={`${uid}-badge`} from={c.from} to={c.to} />
        <Halo id={`${uid}-halo`} color={c.from} />
        <Grad id={`${uid}-metal`} from="#fdf7ff" to="#b9aed6" />
        <Grad id={`${uid}-gold`} from="#ffe08a" to="#d18a1a" />
      </defs>

      {/* The badge every one of them sits on: same shape, different colour. */}
      <rect x="3" y="3" width="58" height="58" rx="18" fill={INK} opacity="0.5" />
      <rect
        x="2"
        y="1"
        width="60"
        height="60"
        rx="18"
        fill={`url(#${uid}-badge)`}
        stroke={INK}
        strokeWidth={STROKE}
      />
      <Gloss cx={32} cy={13} rx={20} ry={6} opacity={0.3} />
      <circle cx="32" cy="34" r="22" fill={`url(#${uid}-halo)`} />

      {kind === "length_lock" && <LengthLock />}
      {kind === "second_wind" && <SecondWind uid={uid} />}
      {kind === "breakdown" && <ColourRead uid={uid} />}
      {kind === "x_ray" && <XRay uid={uid} />}
      {kind === "power_pack" && <PowerPack uid={uid} />}
      {kind in SCAN_GLYPHS && <Scan glyph={SCAN_GLYPHS[kind]} tint={c.to} />}
    </svg>
  );
}

/**
 * The pack: three cards fanned out of a crate, and a spark over the lot.
 *
 * Deliberately made of the *other* pictures rather than a new symbol. What is
 * being sold is the shelf, so the shelf is what should be in the box, and three
 * overlapping cards read as "several of these" at 20px where three distinct
 * glyphs would read as noise.
 */
function PowerPack({ uid }: { uid: string }) {
  return (
    <g>
      {/* The cards, fanned. Back to front, so the nearest one is whole. */}
      {[
        { x: 12, y: 16, r: -14, fill: "#7ddcf7" },
        { x: 22, y: 13, r: 0, fill: "#cfa4ff" },
        { x: 32, y: 16, r: 14, fill: "#7ff0bb" },
      ].map((card) => (
        <rect
          key={card.r}
          x={card.x}
          y={card.y}
          width="20"
          height="26"
          rx="5"
          fill={card.fill}
          stroke={INK}
          strokeWidth={STROKE - 1}
          transform={`rotate(${card.r} ${card.x + 10} ${card.y + 13})`}
        />
      ))}

      {/* The crate they are coming out of. */}
      <rect x="12" y="36" width="40" height="18" rx="6" fill={`url(#${uid}-badge)`} stroke={INK} strokeWidth={STROKE} />
      <rect x="12" y="36" width="40" height="6" rx="3" fill="#fff" opacity="0.25" />
      <path d="M 32 36 L 32 54" stroke={INK} strokeWidth={STROKE - 1} opacity="0.5" />

      <Sparkle x={49} y={16} size={7} color="#fff3d1" index={0} />
      <Sparkle x={15} y={11} size={5} color="#fff3d1" index={2} />
    </g>
  );
}

/**
 * A scan: a card with two characters on it and a beam sweeping across.
 *
 * The counter along the bottom is the product, not decoration — what you buy
 * is a number, and the picture should say so before the price does.
 */
function Scan({ glyph, tint }: { glyph: string; tint: string }) {
  return (
    <g>
      <rect
        x="9"
        y="11"
        width="46"
        height="36"
        rx="9"
        fill="#fdf7ff"
        stroke={INK}
        strokeWidth={STROKE}
      />
      <text
        x="32"
        y="32"
        textAnchor="middle"
        fontSize="18"
        fontWeight="900"
        fontFamily="ui-monospace, monospace"
        fill={INK}
        letterSpacing="1"
      >
        {glyph}
      </text>

      {/* The beam, below the glyph rather than across it — a scan line through
          the middle of two characters turns both of them to mush at the size
          this is actually looked at, which is 12px on a shelf. */}
      <rect x="9" y="37" width="46" height="7" fill={tint} opacity="0.24" />
      <rect x="7" y="39" width="50" height="3" rx="1.5" fill={tint} stroke={INK} strokeWidth="1.2" />

      {/* Three tallies: the answer is always a count. */}
      {[24, 32, 40].map((x) => (
        <rect key={x} x={x} y="50" width="3" height="8" rx="1.5" fill="#fff" opacity="0.85" />
      ))}
      <Gloss cx={32} cy={16} rx={15} ry={3} opacity={0.5} />
    </g>
  );
}

/** A tape measure pulled out — the length, made a physical thing. */
function LengthLock() {
  return (
    <g>
      <rect
        x="9"
        y="24"
        width="46"
        height="22"
        rx="7"
        fill="#fff8e6"
        stroke={INK}
        strokeWidth={STROKE}
      />
      {/* Graduations, long and short, the way a rule actually reads. */}
      {[16, 22, 28, 34, 40, 46].map((x, i) => (
        <rect
          key={x}
          x={x}
          y="24"
          width="3"
          height={i % 2 === 0 ? 11 : 7}
          rx="1.5"
          fill={INK}
          opacity="0.75"
        />
      ))}
      <Gloss cx={32} cy={42} rx={19} ry={2.6} opacity={0.5} />
      {/* Two clamped ends, so it reads as *locked* rather than merely measured. */}
      <rect x="4" y="18" width="9" height="34" rx="4" fill="#ffe08a" stroke={INK} strokeWidth={STROKE} />
      <rect x="51" y="18" width="9" height="34" rx="4" fill="#ffe08a" stroke={INK} strokeWidth={STROKE} />
    </g>
  );
}

/**
 * A vault of hearts: the ceiling on the pool, raised.
 *
 * Exported on its own badge because Life Bank is no longer on the power-up
 * shelf — it is sold beside lives, where the rest of the pool economy lives.
 */
export function LifeBankArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <Grad id="lb-badge" from="#ff9db5" to="#b8214c" />
        <Halo id="lb-halo" color="#ff9db5" />
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="18" fill={INK} opacity="0.5" />
      <rect x="2" y="1" width="60" height="60" rx="18" fill="url(#lb-badge)" stroke={INK} strokeWidth={STROKE} />
      <Gloss cx={32} cy={13} rx={20} ry={6} opacity={0.3} />
      <circle cx="32" cy="34" r="22" fill="url(#lb-halo)" />
      <LifeBank />
    </svg>
  );
}

function LifeBank() {
  const heart = (cx: number, cy: number, s: number) =>
    `M ${cx} ${cy + 4 * s} C ${cx - 7 * s} ${cy - 3 * s}, ${cx - 4 * s} ${cy - 8 * s}, ${cx} ${cy - 3.5 * s} C ${cx + 4 * s} ${cy - 8 * s}, ${cx + 7 * s} ${cy - 3 * s}, ${cx} ${cy + 4 * s} Z`;
  return (
    <g>
      {/* The bank itself: a strongbox, because that is what this buys. */}
      <rect x="9" y="20" width="46" height="32" rx="8" fill="#fdf7ff" stroke={INK} strokeWidth={STROKE} />
      <rect x="14" y="25" width="36" height="22" rx="5" fill="#3a2b70" stroke={INK} strokeWidth={STROKE - 1} />

      {/* Three inside, one going in over the top — the ceiling rising. */}
      <path d={heart(23, 36, 1.1)} fill="#ff5c8a" stroke={INK} strokeWidth={STROKE - 1.2} />
      <path d={heart(32, 36, 1.1)} fill="#ff5c8a" stroke={INK} strokeWidth={STROKE - 1.2} />
      <path d={heart(41, 36, 1.1)} fill="#ff5c8a" stroke={INK} strokeWidth={STROKE - 1.2} />
      <path d={heart(32, 13, 1.3)} fill="#ffb3c8" stroke={INK} strokeWidth={STROKE - 1} />

      <Gloss cx={32} cy={23} rx={16} ry={2.6} opacity={0.6} />
      <Sparkle x={51} y={14} size={5} color="#fff" index={0} />
    </g>
  );
}

/** A winged stopwatch: more time, and no limit on it. */
function SecondWind({ uid }: { uid: string }) {
  return (
    <g>
      {/* Wings first, so the watch overlaps them. */}
      {[-1, 1].map((dir) => (
        <path
          key={dir}
          d={`M ${32 + dir * 12} 32 q ${dir * 16} -10 ${dir * 20} 2 q ${-dir * 8} 6 ${-dir * 20} -2 Z`}
          fill="#eafff5"
          stroke={INK}
          strokeWidth={STROKE}
          strokeLinejoin="round"
        />
      ))}
      <rect x="27" y="8" width="10" height="6" rx="3" fill={`url(#${uid}-metal)`} stroke={INK} strokeWidth={STROKE - 1} />
      <circle cx="32" cy="35" r="18" fill="#fff" stroke={INK} strokeWidth={STROKE} />
      <circle cx="32" cy="35" r="12" fill="none" stroke={INK} strokeOpacity="0.25" strokeWidth="1.5" />
      {/* Hands at ten-past, which is what a clock does when it's happy. */}
      <path
        d="M 32 35 L 32 25 M 32 35 L 40 39"
        stroke={INK}
        strokeWidth={STROKE - 0.5}
        strokeLinecap="round"
      />
      <circle cx="32" cy="35" r="2.6" fill={INK} />
      <Gloss cx={26} cy={27} rx={7} ry={4} opacity={0.55} />
    </g>
  );
}

/** A prism splitting one beam into three — a score, into its parts. */
function ColourRead({ uid }: { uid: string }) {
  return (
    <g>
      {/* A dark field behind the beams, or three saturated lines on a pink
          badge turn to mush. */}
      <circle cx="32" cy="34" r="27" fill={INK} opacity="0.42" />

      {/* One white beam in… */}
      <path d="M 3 26 L 24 34" stroke="#fff" strokeWidth={STROKE + 1} strokeLinecap="round" />
      {/* …and the three that come out, in the colours the attempt log uses for
          exactly these three components. */}
      <path d="M 40 34 L 61 22" stroke="#4ade9b" strokeWidth={STROKE + 1} strokeLinecap="round" />
      <path d="M 41 39 L 61 38" stroke="#ffa23d" strokeWidth={STROKE + 1} strokeLinecap="round" />
      <path d="M 40 43 L 60 54" stroke="#4cc9f0" strokeWidth={STROKE + 1} strokeLinecap="round" />

      <path
        d="M 32 9 L 52 46 L 12 46 Z"
        fill="#fdf7ff"
        fillOpacity="0.95"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path d="M 32 17 L 44 42 L 20 42 Z" fill="#ff9ab8" opacity="0.5" />
      <g opacity="0">
        <rect x="0" y="0" width="1" height="1" fill={`url(#${uid}-metal)`} />
      </g>
    </g>
  );
}

/** Goggles with a lens flare — seeing what's inside. */
function XRay({ uid }: { uid: string }) {
  return (
    <g>
      {/* The strap. */}
      <path
        d="M 6 30 Q 32 20 58 30"
        fill="none"
        stroke={INK}
        strokeWidth={STROKE + 3}
        strokeLinecap="round"
      />
      <path
        d="M 6 30 Q 32 20 58 30"
        fill="none"
        stroke="#fdf7ff"
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity="0.8"
      />

      {[20, 44].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="37" r="15" fill="#fff" stroke={INK} strokeWidth={STROKE} />
          <circle cx={cx} cy="37" r="9.5" fill="#39d0f5" stroke={INK} strokeWidth={STROKE - 1} />
          <circle cx={cx - 3} cy="33.5" r="3.2" fill="#fff" opacity="0.9" />
        </g>
      ))}
      {/* The bridge between them. */}
      <rect x="29" y="34" width="6" height="6" rx="3" fill={INK} opacity="0.7" />
      <g opacity="0">
        <rect x="0" y="0" width="1" height="1" fill={`url(#${uid}-gold)`} />
      </g>

      <Sparkle x={54} y={16} size={6} color="#fff" index={0} />
      <Sparkle x={11} y={19} size={4.5} color="#fff" index={1} />
    </g>
  );
}
