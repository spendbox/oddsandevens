// The safe itself, drawn rather than downloaded.
//
// A GIF would have been the obvious way to do this and the wrong one: it would
// be a fixed size, a fixed palette, a fixed frame rate and a few hundred
// kilobytes, and there would have to be six of them because a contributor picks
// their design. This is one SVG that takes a palette, scales to anything from a
// 40px card thumbnail to a hero, weighs nothing, and can react — the dial turns
// while a guess is in flight and the door swings when a box is cracked.
//
// It is built in layers, back to front: cabinet, cavity, contents, door. The
// cavity and its contents are always drawn and the closed door simply covers
// them, which is what makes opening one a matter of moving a single group.
//
// The open state is the one that has to be right, because it is what a lobby
// card shows forever after somebody wins. The door swings past edge-on and out
// of the way, and what you are then looking at is a lit interior with the
// reward still glinting in it — not a door mid-collapse over a flat disc.
// Nothing of the door's *face* is drawn once it's open: you'd be looking at its
// back, so it's drawn as a back.
//
// All of the motion is CSS on SVG elements, and all of it is off under
// `prefers-reduced-motion` via the global rule. Nothing here is load-bearing:
// with every animation stripped it is still a picture of a safe.

import { DESIGN_SPECS, type Design } from "@/lib/game/designs";

export type SafeMood =
  /** Sitting there. The dial breathes and the sheen drifts. */
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
  // wins for every safe after it — two boxes with different designs in the
  // same list is the normal case, not the edge case.
  const uid = `safe-${design}`;

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-cabinet`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={spec.frame} stopOpacity="1" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`${uid}-door`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor={spec.body[0]} />
          <stop offset="55%" stopColor={spec.body[0]} />
          <stop offset="100%" stopColor={spec.body[1]} />
        </linearGradient>
        {/* The back of the door, seen once it has swung past you. */}
        <linearGradient id={`${uid}-back`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={spec.metal} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={`${uid}-dial`} x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor={spec.accent} />
          <stop offset="55%" stopColor={spec.metal} />
          <stop offset="100%" stopColor={spec.frame} />
        </linearGradient>
        {/* The cavity: darkest at the top, where a real one is deepest. */}
        <linearGradient id={`${uid}-cavity`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        {/*
          Light coming out of an opened safe, pooled at the bottom.

          Bright, and deliberately so. On a 64px lobby thumbnail the bars and
          the door edge are both a pixel or two wide and neither survives; the
          only thing that reliably says "this one's been opened" at that size
          is that the middle of it is *lit*.
        */}
        <radialGradient id={`${uid}-spill`} cx="0.5" cy="0.82" r="0.8">
          <stop offset="0%" stopColor={spec.accent} stopOpacity="0.78" />
          <stop offset="55%" stopColor={spec.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={spec.accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="35%" stopColor={spec.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={spec.accent} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-doorclip`}>
          <rect x="20" y="20" width="80" height="80" rx="9" />
        </clipPath>
        <clipPath id={`${uid}-cavityclip`}>
          <rect x="20" y="20" width="80" height="80" rx="9" />
        </clipPath>
      </defs>

      {open && <circle cx="60" cy="62" r="58" fill={`url(#${uid}-halo)`} />}

      {/* ---- Cabinet ---------------------------------------------------- */}
      <rect x="6" y="6" width="108" height="108" rx="17" fill={`url(#${uid}-cabinet)`} />
      <rect
        x="6.75"
        y="6.75"
        width="106.5"
        height="106.5"
        rx="16.25"
        fill="none"
        stroke={spec.metal}
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      {/* A lit top edge. Without it a dark cabinet on a dark page is a hole. */}
      <path
        d={"M 23 7.5 H 97"}
        stroke={spec.accent}
        strokeOpacity="0.3"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ---- Cavity, and what's in it ----------------------------------- */}
      <g clipPath={`url(#${uid}-cavityclip)`}>
        <rect x="20" y="20" width="80" height="80" fill={spec.frame} />
        <rect x="20" y="20" width="80" height="80" fill={`url(#${uid}-cavity)`} />
        {open && (
          <g className="safe-inside">
            <rect x="20" y="20" width="80" height="80" fill={`url(#${uid}-spill)`} />
            {/* Three bars on the floor of it, stacked the way they'd fall. */}
            <Bar x={30} y={80} w={34} accent={spec.accent} metal={spec.metal} />
            <Bar x={56} y={80} w={30} accent={spec.accent} metal={spec.metal} />
            <Bar x={41} y={66} w={32} accent={spec.accent} metal={spec.metal} />
          </g>
        )}
      </g>
      {/*
        The lip of the opening. Two strokes rather than one: a dark line hard
        against the cavity and a lit one just outside it. That pair is the
        whole of what makes a hole look like a hole rather than a dark sticker.
      */}
      <rect
        x="20"
        y="20"
        width="80"
        height="80"
        rx="9"
        fill="none"
        stroke="#000"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      <rect
        x="18.75"
        y="18.75"
        width="82.5"
        height="82.5"
        rx="10"
        fill="none"
        stroke={spec.metal}
        strokeOpacity="0.45"
      />

      {/* ---- The door --------------------------------------------------- */}
      {open ? (
        // Swung past edge-on: you're looking at its back, so draw a back.
        // No dial, no handle — they're facing the wall now.
        <g
          className="safe-door-open"
          style={{ transformBox: "fill-box", transformOrigin: "0% 50%" }}
        >
          <rect
            x="20"
            y="20"
            width="80"
            height="80"
            rx="9"
            fill={`url(#${uid}-back)`}
            stroke={spec.metal}
            strokeOpacity="0.5"
          />
          {/* Bolt shafts, drawn on the back because that's where they live. */}
          {[34, 60, 86].map((cy) => (
            <rect
              key={cy}
              x="88"
              y={cy - 2}
              width="14"
              height="4"
              rx="2"
              fill={spec.metal}
              opacity="0.75"
            />
          ))}
        </g>
      ) : (
        <g>
          <rect
            x="20"
            y="20"
            width="80"
            height="80"
            rx="9"
            fill={`url(#${uid}-door)`}
            stroke={spec.metal}
            strokeOpacity="0.5"
          />

          <g clipPath={`url(#${uid}-doorclip)`}>
            <rect
              className="safe-sheen"
              x="-44"
              y="12"
              width="24"
              height="116"
              fill={spec.accent}
              opacity="0.16"
              transform="skewX(-18)"
            />
          </g>

          {/*
            The bevel. Lit along the top and left, shadowed along the bottom
            and right — one light source, stated twice. Without it the door and
            the cabinet are two dark rounded squares and the door disappears.
          */}
          <path
            d="M 24 96 V 29 A 5 5 0 0 1 29 24 H 96"
            fill="none"
            stroke={spec.accent}
            strokeOpacity="0.22"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 96 24 V 91 A 5 5 0 0 1 91 96 H 24"
            fill="none"
            stroke="#000"
            strokeOpacity="0.35"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Bolts, one at each corner. */}
          {[
            [30, 30],
            [90, 30],
            [30, 90],
            [90, 90],
          ].map(([cx, cy]) => (
            <g key={`${cx}-${cy}`}>
              <circle cx={cx} cy={cy} r="3.4" fill={spec.metal} opacity="0.85" />
              <circle cx={cx} cy={cy - 0.7} r="1.5" fill={spec.accent} opacity="0.5" />
            </g>
          ))}

          {/* ---- The dial ------------------------------------------------ */}
          {/* Fixed reference marks, so the spinner has something to turn against. */}
          <circle
            cx="60"
            cy="60"
            r="24"
            fill="none"
            stroke={spec.metal}
            strokeOpacity="0.35"
            strokeWidth="1.25"
          />
          {[0, 90, 180, 270].map((deg) => (
            <rect
              key={deg}
              x="59.5"
              y="33"
              width="1"
              height="4"
              rx="0.5"
              fill={spec.accent}
              opacity="0.7"
              transform={`rotate(${deg} 60 60)`}
            />
          ))}

          <g
            className={mood === "working" ? "safe-dial-spin" : "safe-dial-idle"}
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          >
            <circle cx="60" cy="60" r="19" fill={`url(#${uid}-dial)`} />
            {/* Knurling. Twenty-four notches reads as milled rather than toothed. */}
            {Array.from({ length: 24 }, (_, i) => (
              <rect
                key={i}
                x="59.6"
                y="42"
                width="0.8"
                height="3.4"
                fill={spec.frame}
                opacity="0.5"
                transform={`rotate(${i * 15} 60 60)`}
              />
            ))}
            <circle
              cx="60"
              cy="60"
              r="19"
              fill="none"
              stroke={spec.frame}
              strokeOpacity="0.55"
            />
            {/* The pointer, and a hub for it to turn on. */}
            <rect x="59" y="45" width="2" height="10" rx="1" fill={spec.frame} />
            <circle cx="60" cy="60" r="5.5" fill={spec.frame} opacity="0.85" />
            <circle cx="60" cy="60" r="2" fill={spec.accent} opacity="0.8" />
            {/* One specular arc. It is most of what makes metal look like metal. */}
            <path
              d="M 47 52 A 16 16 0 0 1 60 45"
              fill="none"
              stroke={spec.accent}
              strokeOpacity="0.55"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* The handle, on the swinging edge. */}
          <rect
            x="93.5"
            y="49"
            width="4.5"
            height="22"
            rx="2.25"
            fill={spec.metal}
            opacity="0.9"
          />
          <rect x="94.6" y="52" width="1.2" height="16" rx="0.6" fill={spec.accent} opacity="0.5" />
        </g>
      )}
    </svg>
  );
}

/** One bar on the floor of an opened safe: a lit top face and a body. */
function Bar({
  x,
  y,
  w,
  accent,
  metal,
}: {
  x: number;
  y: number;
  w: number;
  accent: string;
  metal: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={12} rx="2" fill={metal} />
      <rect x={x + 2} y={y + 1.2} width={w - 4} height="3.2" rx="1.6" fill={accent} />
      <rect x={x} y={y + 9} width={w} height="3" rx="1.5" fill="#000" opacity="0.28" />
    </g>
  );
}
