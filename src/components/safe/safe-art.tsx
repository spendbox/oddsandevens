// The safe itself, drawn rather than downloaded.
//
// A GIF would have been the obvious way to do this and the wrong one: fixed
// size, fixed palette, fixed frame rate, a few hundred kilobytes, and six of
// them because a contributor picks their design. This is one SVG that takes a
// palette, scales from a 40px card thumbnail to a hero, weighs nothing, and
// reacts — the dial turns while a guess is in flight and the door swings when
// somebody cracks it.
//
// It is drawn to the same rules as everything else in `components/art`: one
// ink outline, light from the top-left, a gloss across the upper third, and no
// pure black. That is what makes a box on the lobby and Boxy in the header look
// like they came from the same place rather than merely sharing a page.
//
// Built in layers, back to front: cabinet, cavity, contents, door. The cavity
// and its contents are always drawn and the closed door simply covers them,
// which is what makes opening one a matter of moving a single group.
//
// The open state is the one that has to be right, because it is what a lobby
// card shows forever after somebody wins. The door swings past edge-on and out
// of the way, and what you're then looking at is a lit interior with gold still
// in it. Nothing of the door's face is drawn once it's open — you'd be looking
// at its back, so it's drawn as a back.

import { Gloss, GroundShadow, INK, Sparkle, STROKE } from "@/components/art/ink";
import { DESIGN_SPECS, type Design } from "@/lib/game/designs";

export type SafeMood =
  /** Sitting there. The dial rocks and the sheen drifts. */
  | "idle"
  /** A guess is in flight: the dial spins. */
  | "working"
  /** Somebody got it. The door swings open. */
  | "open";

export function SafeArt({
  design,
  mood = "idle",
  className = "",
  /** Decorative by default; give it a label where it carries meaning. */
  label,
}: {
  design: Design;
  mood?: SafeMood;
  className?: string;
  label?: string;
}) {
  const spec = DESIGN_SPECS[design];
  const open = mood === "open";

  // Gradient ids have to be unique per design or the first one on the page
  // wins for every safe after it — two designs in one list is the normal case.
  const uid = `safe-${design}`;

  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-cabinet`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={spec.frame} />
          <stop offset="100%" stopColor={INK} />
        </linearGradient>
        <linearGradient id={`${uid}-door`} x1="0.1" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={spec.body[0]} />
          <stop offset="100%" stopColor={spec.body[1]} />
        </linearGradient>
        <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={spec.frame} />
          <stop offset="100%" stopColor={INK} />
        </linearGradient>
        <linearGradient id={`${uid}-dial`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={spec.metal} />
          <stop offset="100%" stopColor={spec.body[1]} />
        </linearGradient>
        <radialGradient id={`${uid}-spill`} cx="0.5" cy="0.8" r="0.8">
          <stop offset="0%" stopColor="#ffe08a" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#ffc247" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffc247" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="30%" stopColor={spec.body[0]} stopOpacity="0.35" />
          <stop offset="100%" stopColor={spec.body[0]} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-cavityclip`}>
          <rect x="26" y="26" width="76" height="72" rx="12" />
        </clipPath>
        <clipPath id={`${uid}-doorclip`}>
          <rect x="24" y="24" width="80" height="76" rx="14" />
        </clipPath>
      </defs>

      {open && <circle cx="64" cy="64" r="62" fill={`url(#${uid}-halo)`} />}

      <GroundShadow cx={64} cy={116} rx={40} ry={6} />

      {/* ---- Cabinet ---------------------------------------------------- */}
      <rect
        x="10"
        y="10"
        width="108"
        height="100"
        rx="22"
        fill={`url(#${uid}-cabinet)`}
        stroke={INK}
        strokeWidth={STROKE + 1}
      />
      {/* Feet, so it stands rather than floats. */}
      <rect x="24" y="106" width="18" height="10" rx="5" fill={spec.frame} stroke={INK} strokeWidth={STROKE - 1} />
      <rect x="86" y="106" width="18" height="10" rx="5" fill={spec.frame} stroke={INK} strokeWidth={STROKE - 1} />

      {/* ---- Cavity, and what's in it ----------------------------------- */}
      <g clipPath={`url(#${uid}-cavityclip)`}>
        <rect x="26" y="26" width="76" height="72" fill="#0d0819" />
        {open && (
          <g className="safe-inside">
            <rect x="26" y="26" width="76" height="72" fill={`url(#${uid}-spill)`} />
            {/* Gold on the floor of it, stacked the way it would fall. */}
            <Bar x={32} y={80} w={34} />
            <Bar x={60} y={80} w={30} />
            <Bar x={44} y={66} w={32} />
          </g>
        )}
      </g>
      {/* The lip of the opening, so the cavity reads as a hole rather than a
          dark sticker. */}
      <rect
        x="26"
        y="26"
        width="76"
        height="72"
        rx="12"
        fill="none"
        stroke={INK}
        strokeWidth={STROKE}
      />

      {/* ---- The door --------------------------------------------------- */}
      {open ? (
        // Swung past edge-on: you're looking at its back, so draw a back.
        <g
          className="safe-door-open"
          style={{ transformBox: "fill-box", transformOrigin: "0% 50%" }}
        >
          <rect
            x="24"
            y="24"
            width="80"
            height="76"
            rx="14"
            fill={`url(#${uid}-back)`}
            stroke={INK}
            strokeWidth={STROKE}
          />
          {[38, 62, 86].map((cy) => (
            <rect key={cy} x="92" y={cy - 2} width="16" height="5" rx="2.5" fill={spec.metal} opacity="0.8" />
          ))}
        </g>
      ) : (
        <g>
          <rect
            x="24"
            y="24"
            width="80"
            height="76"
            rx="14"
            fill={`url(#${uid}-door)`}
            stroke={INK}
            strokeWidth={STROKE}
          />
          <Gloss cx={64} cy={36} rx={30} ry={8} opacity={0.35} />

          <g clipPath={`url(#${uid}-doorclip)`}>
            <rect
              className="safe-sheen"
              x="-46"
              y="16"
              width="22"
              height="112"
              fill="#fff"
              opacity="0.22"
              transform="skewX(-18)"
            />
          </g>

          {/* Bolts. */}
          {[
            [36, 36],
            [92, 36],
            [36, 88],
            [92, 88],
          ].map(([cx, cy]) => (
            <g key={`${cx}-${cy}`}>
              <circle cx={cx} cy={cy} r="4.5" fill={spec.frame} stroke={INK} strokeWidth={STROKE - 1.4} />
              <circle cx={cx - 1} cy={cy - 1.2} r="1.5" fill="#fff" opacity="0.6" />
            </g>
          ))}

          {/* ---- The dial ------------------------------------------------ */}
          <circle cx="64" cy="62" r="24" fill={spec.frame} stroke={INK} strokeWidth={STROKE - 0.5} />
          {[0, 90, 180, 270].map((deg) => (
            <rect
              key={deg}
              x="63"
              y="40"
              width="2"
              height="5"
              rx="1"
              fill={spec.metal}
              opacity="0.9"
              transform={`rotate(${deg} 64 62)`}
            />
          ))}

          <g
            className={mood === "working" ? "safe-dial-spin" : "safe-dial-idle"}
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          >
            <circle
              cx="64"
              cy="62"
              r="18"
              fill={`url(#${uid}-dial)`}
              stroke={INK}
              strokeWidth={STROKE}
            />
            {/* Knurling: eight chunky notches, not twenty-four fine ones —
                at thumbnail size fine ones turn to mud. */}
            {Array.from({ length: 8 }, (_, i) => (
              <rect
                key={i}
                x="62.6"
                y="45"
                width="2.8"
                height="5"
                rx="1.4"
                fill={INK}
                opacity="0.45"
                transform={`rotate(${i * 45} 64 62)`}
              />
            ))}
            <rect x="62.4" y="48" width="3.2" height="11" rx="1.6" fill={INK} opacity="0.75" />
            <circle cx="64" cy="62" r="5.5" fill={INK} opacity="0.8" />
            <circle cx="64" cy="62" r="2.4" fill={spec.accent} />
            <Gloss cx={57} cy={54} rx={6} ry={3.4} opacity={0.55} />
          </g>

          {/* The handle, on the swinging edge. */}
          <rect
            x="96"
            y="52"
            width="7"
            height="22"
            rx="3.5"
            fill={spec.metal}
            stroke={INK}
            strokeWidth={STROKE - 1.4}
          />
        </g>
      )}

      {open && (
        <g>
          <Sparkle x={20} y={30} size={7} color="#ffe08a" index={0} />
          <Sparkle x={112} y={44} size={6} color="#fff" index={1} />
        </g>
      )}
    </svg>
  );
}

/** One gold bar on the floor of an opened safe. */
function Bar({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="13" rx="3" fill="#e5a52a" stroke={INK} strokeWidth={STROKE - 1.4} />
      <rect x={x + 3} y={y + 2} width={w - 6} height="3.4" rx="1.7" fill="#ffe9a8" />
    </g>
  );
}
