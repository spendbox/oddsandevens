// The badge beside a game's name, playing the game.
//
// It used to be a lucide icon — a sword for Slice Ninja, a hammer for
// Whack-a-Mole. That tells you the theme and nothing about the game, which is
// the wrong answer to the only question a business is asking when it picks
// one: what does my customer actually *do*?
//
// So each badge runs a two-and-a-bit-second loop of the thing itself. Fruit
// gets cut in half. A mole comes up and gets hit. A jewel gets swiped into a
// row and the row goes. It's four SVG shapes and a keyframe each — no video
// file, no GIF, nothing to download, and it stays sharp at any size.
//
// Anyone who has asked their system for less movement gets the plain icon
// back; that swap is in CSS, so it needs no JavaScript and no hydration.

import { GameIcon } from "./icons";

const WHITE = "rgb(255 255 255 / 0.95)";
const SHADE = "rgb(0 0 0 / 0.28)";

/** Fruit rises, blade crosses, halves fall apart. */
function SliceLoop() {
  return (
    <>
      {/* Cut on the diagonal, so the halves part along the blade's line. */}
      <path
        className="gl-a-slice-a"
        d="M13.6 15.6 A9 9 0 0 0 26.4 28.4 Z"
        fill={WHITE}
      />
      <path
        className="gl-a-slice-b"
        d="M13.6 15.6 A9 9 0 0 1 26.4 28.4 Z"
        fill="rgb(255 255 255 / 0.72)"
      />
      <line
        className="gl-a-blade"
        x1="8"
        y1="10"
        x2="32"
        y2="34"
        stroke={WHITE}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="36"
      />
    </>
  );
}

/** Mole up, hammer down, mole gone. */
function WhackLoop() {
  return (
    <>
      <defs>
        {/* So the mole rises out of the ground rather than over it. */}
        <clipPath id="gl-hole">
          <rect x="0" y="0" width="40" height="31" />
        </clipPath>
      </defs>
      <ellipse cx="20" cy="32" rx="14" ry="4.6" fill="rgb(255 255 255 / 0.3)" />
      <g clipPath="url(#gl-hole)">
        <g className="gl-a-mole">
          <circle cx="20" cy="25" r="7" fill={WHITE} />
          <circle cx="17.4" cy="23.6" r="1.15" fill={SHADE} />
          <circle cx="22.6" cy="23.6" r="1.15" fill={SHADE} />
        </g>
      </g>
      <ellipse cx="20" cy="31" rx="8.5" ry="3" fill={SHADE} />
      <g className="gl-a-hammer">
        <rect x="29.6" y="17" width="2.8" height="16" rx="1.4" fill={WHITE} />
        <rect x="25" y="11.5" width="12" height="7" rx="2" fill={WHITE} />
      </g>
    </>
  );
}

/** One jewel swiped up into the row, and the three go. */
function MatchLoop() {
  const gem = (x: number, y: number, fill: string) => (
    <rect x={x} y={y} width="11" height="11" rx="3.2" fill={fill} />
  );
  return (
    <>
      {/* The two already in place. */}
      <g className="gl-a-pop">{gem(2.5, 9, WHITE)}</g>
      <g className="gl-a-pop">{gem(14.5, 9, WHITE)}</g>
      {/* The wrong one, swapped down out of the way. */}
      <g className="gl-a-swap-down">{gem(26.5, 9, SHADE)}</g>
      {/* The right one, swiped up to finish the row. */}
      <g className="gl-a-swap-up">
        <g className="gl-a-pop">{gem(26.5, 22, WHITE)}</g>
      </g>
      <circle className="gl-a-swipe" cx="32" cy="30" r="2.6" fill={WHITE} />
    </>
  );
}

/** The bird holds its line while the pipes come at it. */
function FlappyLoop() {
  return (
    <>
      <g className="gl-a-pipes">
        <rect x="24" y="0" width="9" height="12" rx="1.5" fill={WHITE} />
        <rect x="24" y="26" width="9" height="14" rx="1.5" fill={WHITE} />
      </g>
      <g className="gl-a-bird" style={{ transformOrigin: "13px 20px" }}>
        <circle cx="13" cy="20" r="5.5" fill={WHITE} />
        <circle cx="15" cy="18.4" r="1.1" fill={SHADE} />
        <path d="M18 20.4 L22 22 L18 23 Z" fill="rgb(255 255 255 / 0.8)" />
      </g>
    </>
  );
}

/** Two matching tiles find each other and clear. */
function MahjongLoop() {
  return (
    <>
      <g className="gl-a-tile-l">
        <rect x="5" y="12" width="13" height="16" rx="2.5" fill={WHITE} />
        <circle cx="11.5" cy="20" r="3" fill={SHADE} />
      </g>
      <g className="gl-a-tile-r">
        <rect x="22" y="12" width="13" height="16" rx="2.5" fill={WHITE} />
        <circle cx="28.5" cy="20" r="3" fill={SHADE} />
      </g>
    </>
  );
}

const LOOPS: Record<string, () => React.ReactElement> = {
  "slice-ninja": SliceLoop,
  "whack-a-mole": WhackLoop,
  "match-3": MatchLoop,
  flappy: FlappyLoop,
  "mahjong-3d": MahjongLoop,
};

/**
 * The gradient badge for a game, with its loop inside. Falls back to the
 * catalogue icon for anything without a loop, and for reduced motion.
 */
export function GameLoop({
  type,
  icon,
  swatch,
  className = "size-11 rounded-xl",
}: {
  type: string;
  icon: string;
  swatch?: [string, string];
  /** Carries the size and the corner radius, so a badge can be any shape. */
  className?: string;
}) {
  const Loop = LOOPS[type];
  const background = swatch
    ? `linear-gradient(140deg, ${swatch[0]}, ${swatch[1]})`
    : "var(--brand)";

  return (
    <span
      className={
        "flex shrink-0 items-center justify-center overflow-hidden text-white " +
        className
      }
      style={{ background }}
      aria-hidden
    >
      {Loop ? (
        <>
          <svg viewBox="0 0 40 40" className="gl gl-motion size-full">
            <Loop />
          </svg>
          <GameIcon icon={icon} className="gl-static size-[45%]" />
        </>
      ) : (
        <GameIcon icon={icon} className="size-[45%]" />
      )}
    </span>
  );
}
