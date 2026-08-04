// Boxy.
//
// The mascot is a safe with a face, and that choice is the whole of the
// character design: the thing standing between you and the money is also the
// thing keeping you company while you try to get it. He is not a burglar or a
// detective, because a game where you are stealing from someone is a different
// game from this one — everybody here is on the same side of the door, Boxy
// included, and he is delighted when you finally beat him.
//
// Six moods, and each one is doing a job on a specific screen:
//
//   happy     the default. Landing, empty states, anywhere at rest.
//   thinking  a guess is in flight, or you're mid-hunt.
//   cheer     you cracked it. Arms up, door swung, confetti.
//   sad       out of lives, or nothing found.
//   sly       he knows something you don't — the FAQ, the shelf.
//   dizzy     something went wrong on our side.
//
// Everything is drawn, so he scales from a 32px header lockup to a hero
// without a second asset, and the pieces are shared with `SafeArt` so the
// mascot and the boxes look related rather than merely adjacent.

import { Gloss, GroundShadow, Grad, INK, Sparkle, STROKE } from "./ink";

export type BoxyMood = "happy" | "thinking" | "cheer" | "sad" | "sly" | "dizzy";

export function Boxy({
  mood = "happy",
  className = "",
  /** Set when he's decorative — which is most of the time. */
  label,
  /** Turns off the idle bob, for a lockup that shouldn't move. */
  still = false,
}: {
  mood?: BoxyMood;
  className?: string;
  label?: string;
  still?: boolean;
}) {
  const uid = `boxy-${mood}`;
  const cheering = mood === "cheer";

  return (
    <svg
      viewBox="0 0 160 160"
      className={className}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <Grad id={`${uid}-body`} from="#ffd76e" to="#e59a1c" />
        <Grad id={`${uid}-face`} from="#3a2b70" to="#211741" />
        <Grad id={`${uid}-dial`} from="#fff3d1" to="#e0a83c" />
        <Grad id={`${uid}-arm`} from="#ffcf5c" to="#d1891a" />
      </defs>

      <GroundShadow cx={80} cy={148} rx={44} ry={7} />

      <g className={still ? undefined : "bob"}>
        {/* Feet, tucked under the body so he reads as standing rather than
            floating. Drawn first so the body's outline covers their tops. */}
        <rect x="42" y="118" width="26" height="22" rx="11" fill="#c07d10" stroke={INK} strokeWidth={STROKE} />
        <rect x="92" y="118" width="26" height="22" rx="11" fill="#c07d10" stroke={INK} strokeWidth={STROKE} />

        {/* Arms. Down at his sides, or thrown up when he's cheering. */}
        <Arm uid={uid} side="left" mood={mood} />
        <Arm uid={uid} side="right" mood={mood} />

        {/* Body */}
        <rect
          x="26"
          y="20"
          width="108"
          height="106"
          rx="26"
          fill={`url(#${uid}-body)`}
          stroke={INK}
          strokeWidth={STROKE + 1}
        />
        <Gloss cx={80} cy={40} rx={38} ry={12} opacity={0.42} />

        {/* Bolts — four rivets that say "safe" before the face does. */}
        {[
          [42, 36],
          [118, 36],
          [42, 110],
          [118, 110],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#b8750f" opacity="0.75" />
        ))}

        {/* The face plate: a recessed dark panel, so the eyes have somewhere
            to be rather than floating on gold. */}
        <rect
          x="42"
          y="44"
          width="76"
          height="60"
          rx="20"
          fill={`url(#${uid}-face)`}
          stroke={INK}
          strokeWidth={STROKE}
        />

        <Face mood={mood} />

        {/* The dial, doubling as a nose. */}
        <circle cx="80" cy="113" r="11" fill={`url(#${uid}-dial)`} stroke={INK} strokeWidth={STROKE} />
        <circle cx="80" cy="113" r="3.5" fill={INK} opacity="0.7" />
        <rect
          x="78.6"
          y="104"
          width="2.8"
          height="7"
          rx="1.4"
          fill={INK}
          opacity="0.7"
          transform={mood === "thinking" ? "rotate(38 80 113)" : undefined}
        />
      </g>

      {/* Confetti, only when there's something to celebrate. */}
      {cheering && (
        <g>
          <Sparkle x={24} y={40} size={9} color="#4ade9b" index={0} />
          <Sparkle x={138} y={54} size={11} color="#b57bff" index={1} />
          <Sparkle x={132} y={112} size={8} color="#4cc9f0" index={2} />
          <Sparkle x={20} y={100} size={7} color="#ff5c8a" index={3} />
        </g>
      )}
    </svg>
  );
}

/**
 * One arm.
 *
 * Two states only — down, or up. A mascot with a full range of gestures needs
 * a rig; a mascot with two poses needs two paths and reads just as well at the
 * size anybody actually sees him.
 */
function Arm({
  uid,
  side,
  mood,
}: {
  uid: string;
  side: "left" | "right";
  mood: BoxyMood;
}) {
  const up = mood === "cheer";
  const flip = side === "right";

  // Both paths start *inside* the body (x=26) and finish well outside it. The
  // body is drawn after these, so only the outside half is ever visible —
  // anchoring at the edge instead would leave a stub that looks detached.
  const d = up
    ? "M 34 74 C 16 64 8 44 10 26"
    : "M 34 92 C 18 98 10 108 8 122";
  const hand = up ? { cx: 10, cy: 22 } : { cx: 8, cy: 126 };

  return (
    <g transform={flip ? "translate(160 0) scale(-1 1)" : undefined}>
      <path
        d={d}
        fill="none"
        stroke={INK}
        strokeWidth={STROKE + 11}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={`url(#${uid}-arm)`}
        strokeWidth={STROKE + 5}
        strokeLinecap="round"
      />
      <circle
        cx={hand.cx}
        cy={hand.cy}
        r="11"
        fill={`url(#${uid}-arm)`}
        stroke={INK}
        strokeWidth={STROKE}
      />
      <circle cx={hand.cx - 3} cy={hand.cy - 3.5} r="3" fill="#fff" opacity="0.45" />
    </g>
  );
}

/**
 * The face.
 *
 * Eyes carry almost all of it. The mouth is a single stroke and the brows are
 * two, which is the whole vocabulary — resisting the urge to add cheeks, a
 * tongue and eyelashes is what keeps him readable at 32px.
 */
function Face({ mood }: { mood: BoxyMood }) {
  const eyeWhite = "#fdf7ff";

  if (mood === "dizzy") {
    return (
      <g stroke={INK} strokeWidth={STROKE} strokeLinecap="round" fill="none">
        <path d="M 58 62 L 70 74 M 70 68 L 58 74" />
        <path d="M 90 62 L 102 74 M 102 68 L 90 74" />
        <path d="M 66 90 Q 74 84 80 96 Q 86 96 94 96" />
      </g>
    );
  }

  if (mood === "cheer") {
    return (
      <g>
        {/* Squeezed-shut happy eyes. */}
        <path
          d="M 56 70 Q 64 58 72 76"
          fill="none"
          stroke={eyeWhite}
          strokeWidth={STROKE + 1}
          strokeLinecap="round"
        />
        <path
          d="M 88 70 Q 96 58 104 76"
          fill="none"
          stroke={eyeWhite}
          strokeWidth={STROKE + 1}
          strokeLinecap="round"
        />
        {/* An open, shouting mouth. */}
        <path d="M 66 82 Q 80 102 94 88 Z" fill="#ff5c8a" stroke={INK} strokeWidth={STROKE - 1} />
      </g>
    );
  }

  const looking = mood === "thinking" ? 4 : 0;
  const sly = mood === "sly";
  const sad = mood === "sad";

  return (
    <g>
      {/* Brows. Angle is the whole difference between moods. */}
      <path
        d={
          sly
            ? "M 54 54 L 72 57"
            : sad
              ? "M 54 56 L 72 52"
              : mood === "thinking"
                ? "M 54 54 L 72 51"
                : "M 54 53 L 72 53"
        }
        stroke={eyeWhite}
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d={
          sly
            ? "M 88 57 L 106 54"
            : sad
              ? "M 88 52 L 106 56"
              : mood === "thinking"
                ? "M 88 51 L 106 54"
                : "M 88 53 L 106 53"
        }
        stroke={eyeWhite}
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity="0.85"
      />

      <g className="blink">
        <Eye cx={64} cy={72} look={looking} half={sly} white={eyeWhite} />
        <Eye cx={96} cy={72} look={looking} half={sly} white={eyeWhite} />
      </g>

      {/* Mouth */}
      <path
        d={
          sad
            ? "M 68 94 Q 80 86 92 94"
            : sly
              ? "M 68 90 Q 80 98 94 88"
              : mood === "thinking"
                ? "M 70 92 L 90 92"
                : "M 68 88 Q 80 98 92 88"
        }
        fill="none"
        stroke={eyeWhite}
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* One idea bubble while he's working something out. */}
      {mood === "thinking" && (
        <g fill="#fdf7ff" stroke={INK} strokeWidth={STROKE - 1}>
          <circle className="twinkle" cx="126" cy="38" r="5" />
          <circle
            className="twinkle"
            style={{ "--i": 1 } as React.CSSProperties}
            cx="139"
            cy="24"
            r="8"
          />
          <text
            x="139"
            y="29"
            textAnchor="middle"
            fontSize="11"
            fontWeight="900"
            fill={INK}
            stroke="none"
          >
            ?
          </text>
        </g>
      )}
    </g>
  );
}

function Eye({
  cx,
  cy,
  look,
  half,
  white,
}: {
  cx: number;
  cy: number;
  /** Pupil offset. Looking away reads as thinking. */
  look: number;
  /** Half-lidded, for the sly face. */
  half: boolean;
  white: string;
}) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="9" ry={half ? 6 : 10} fill={white} />
      <circle cx={cx + look} cy={cy + (half ? 1 : 0)} r="4.6" fill={INK} />
      {/* The catchlight. Two pixels of white, and the difference between an
          eye and a hole. */}
      <circle cx={cx + look + 1.8} cy={cy - 2.4} r="1.7" fill="#fff" />
    </g>
  );
}
