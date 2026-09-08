/**
 * The Spendbox mark: an S built out of a hexagon.
 *
 * Two identical strokes, the second one the first rotated 180° about the
 * centre. Each starts at a side vertex, runs over the near apex to the opposite
 * side vertex, continues a little way down that vertical side and then cuts
 * back inward on a line parallel to the top edges. The two gaps that leaves are
 * what read as the letter.
 *
 * That symmetry is the whole design, and it is why the numbers below are worth
 * keeping rather than replacing with a hand-drawn path: change one and the
 * other half follows, and the mark stays a hexagon rather than drifting into an
 * approximate blob. Everything derives from four measurements:
 *
 *   HALF_WIDTH   half the flat-to-flat width, so the vertical sides sit at
 *                32 ± this
 *   APEX_RISE    how far the top and bottom points rise above the side vertices
 *   HALF_SIDE    half the length of the vertical sides
 *   WEIGHT       the stroke, round-capped and round-joined
 *
 * The slanted edges all share one slope, HALF_WIDTH / APEX_RISE, including the
 * inward cut — which is a translated copy of the top edge. Nothing here is a
 * curve; the softness is entirely the round caps and joins.
 */
const HALF_WIDTH = 17.2
const APEX_RISE = 9.8
const HALF_SIDE = 14.5
const WEIGHT = 9.4

/** How far down the vertical side the stroke runs before it cuts back inward. */
const RUN_DOWN = 12.3

const C = 32 // the centre of the 64-unit box, on both axes

const TOP = [C, C - HALF_SIDE - APEX_RISE]
const RIGHT_TOP = [C + HALF_WIDTH, C - HALF_SIDE]
const LEFT_TOP = [C - HALF_WIDTH, C - HALF_SIDE]
const TURN = [C - HALF_WIDTH, C - HALF_SIDE + RUN_DOWN]
const INWARD = [C, TURN[1] + APEX_RISE]

const draw = (points: number[][]) =>
  'M' + points.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join(' ')

const turned = (points: number[][]) => points.map(([x, y]) => [2 * C - x, 2 * C - y])

const FIRST = [RIGHT_TOP, TOP, LEFT_TOP, TURN, INWARD]
const SECOND = turned(FIRST)

/**
 * Cyan at the top point, through blue and violet down the left, into rose at
 * the bottom right — the site's own three accents, in the order the eye reads
 * the letter. One gradient per stroke because the two travel in opposite
 * directions; a single one across the whole mark puts the wrong end of the ramp
 * on the lower-left arm.
 *
 * The ids are fixed rather than generated. Two of these on a page (the header
 * and the footer both have one) means the same id twice, which is fine here
 * precisely because both definitions are identical — whichever the browser
 * picks paints the same thing. Give them per-instance ids only if the gradients
 * ever stop matching.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
    >
      <defs>
        <linearGradient
          id="spendbox-mark-top"
          gradientUnits="userSpaceOnUse"
          x1={RIGHT_TOP[0]}
          y1={TOP[1]}
          x2={LEFT_TOP[0]}
          y2={INWARD[1]}
        >
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset=".3" stopColor="#2ac7ee" />
          <stop offset=".68" stopColor="#6a8bec" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient
          id="spendbox-mark-bottom"
          gradientUnits="userSpaceOnUse"
          x1={LEFT_TOP[0]}
          y1="30"
          x2={RIGHT_TOP[0]}
          y2="50"
        >
          <stop offset="0" stopColor="#a855f7" />
          <stop offset=".24" stopColor="#ab57f2" />
          <stop offset=".7" stopColor="#d067b0" />
          <stop offset="1" stopColor="#fb5c7d" />
        </linearGradient>
      </defs>

      <g
        fill="none"
        strokeWidth={WEIGHT}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path stroke="url(#spendbox-mark-top)" d={draw(FIRST)} />
        <path stroke="url(#spendbox-mark-bottom)" d={draw(SECOND)} />
      </g>
    </svg>
  )
}
