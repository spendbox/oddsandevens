// The safe itself, drawn rather than downloaded.
//
// A GIF would have been the obvious way to do this and the wrong one: it would
// be a fixed size, a fixed palette, a fixed frame rate and a few hundred
// kilobytes, and there would have to be six of them because a contributor picks
// their design. This is one SVG that takes a palette, scales to anything from a
// 40px card thumbnail to a hero, weighs nothing, and can react — the dial turns
// while a guess is in flight and the door swings when a box is cracked.
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
  // Gradient ids have to be unique per design or the first one on the page
  // wins for every safe after it — two boxes with different designs on the
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
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={spec.body[0]} />
          <stop offset="100%" stopColor={spec.body[1]} />
        </linearGradient>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={spec.accent} />
          <stop offset="100%" stopColor={spec.metal} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={spec.accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={spec.accent} stopOpacity="0" />
        </radialGradient>
        {/* The sheen that travels across the door. Clipped to the door so it
            never spills onto the frame. */}
        <clipPath id={`${uid}-door`}>
          <rect x="18" y="18" width="84" height="84" rx="10" />
        </clipPath>
      </defs>

      {mood === "open" && <circle cx="60" cy="60" r="58" fill={`url(#${uid}-glow)`} />}

      {/* Cabinet. */}
      <rect x="8" y="8" width="104" height="104" rx="14" fill={spec.frame} />
      <rect
        x="8.5"
        y="8.5"
        width="103"
        height="103"
        rx="13.5"
        fill="none"
        stroke={spec.metal}
        strokeOpacity="0.35"
      />

      {/* The door, hinged on the left. When it opens it rotates about that
          hinge in 3D, which is why the transform-box/origin are set inline —
          Tailwind has no vocabulary for an SVG element's own box. */}
      <g
        className={mood === "open" ? "safe-door-open" : undefined}
        style={{ transformBox: "fill-box", transformOrigin: "0% 50%" }}
      >
        <rect
          x="18"
          y="18"
          width="84"
          height="84"
          rx="10"
          fill={`url(#${uid}-body)`}
          stroke={spec.metal}
          strokeOpacity="0.45"
        />

        <g clipPath={`url(#${uid}-door)`}>
          <rect
            className="safe-sheen"
            x="-40"
            y="10"
            width="26"
            height="110"
            fill={spec.accent}
            opacity="0.07"
            transform="skewX(-18)"
          />
        </g>

        {/* Bolts, one at each corner of the door. */}
        {[
          [28, 28],
          [92, 28],
          [28, 92],
          [92, 92],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" fill={spec.metal} opacity="0.7" />
        ))}

        {/* The dial. */}
        <circle cx="60" cy="60" r="22" fill="none" stroke={spec.metal} strokeOpacity="0.5" strokeWidth="1.5" />
        <g
          className={mood === "working" ? "safe-dial-spin" : "safe-dial-idle"}
          style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
        >
          <circle cx="60" cy="60" r="17" fill={`url(#${uid}-metal)`} />
          <circle cx="60" cy="60" r="17" fill="none" stroke={spec.frame} strokeOpacity="0.5" />
          {/* Notches around the rim, so the rotation is visible at all. */}
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x="59.4"
              y="45"
              width="1.2"
              height="4"
              fill={spec.frame}
              opacity="0.55"
              transform={`rotate(${i * 30} 60 60)`}
            />
          ))}
          <circle cx="60" cy="60" r="4.5" fill={spec.frame} opacity="0.75" />
          <rect x="59.2" y="47" width="1.6" height="9" rx="0.8" fill={spec.frame} />
        </g>

        {/* The handle. */}
        <rect x="86" y="52" width="5" height="16" rx="2.5" fill={spec.metal} opacity="0.8" />
      </g>

      {/* What's inside, revealed only once the door has swung. */}
      {mood === "open" && (
        <g className="safe-inside">
          <rect x="34" y="34" width="52" height="52" rx="6" fill={spec.frame} />
          <circle cx="60" cy="60" r="13" fill={spec.accent} opacity="0.9" />
          <circle cx="60" cy="60" r="20" fill="none" stroke={spec.accent} strokeOpacity="0.35" />
        </g>
      )}
    </svg>
  );
}
