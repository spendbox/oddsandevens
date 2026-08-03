// The house style, in four pieces.
//
// Every illustration in Spendbox is built from these so the whole set looks
// like it came from one hand. The rules are the ones any chunky casual game
// follows, and they are worth stating because breaking one is what makes an
// icon set look "designed by three people":
//
//   1. **Everything is outlined**, in one ink colour, at a weight that scales
//      with the shape rather than staying hairline. A 2px stroke on a 48px icon
//      is what separates an illustration from a diagram.
//   2. **Light comes from above.** A top-left highlight and a bottom shadow on
//      every solid, always the same way round.
//   3. **A gloss on top.** One soft white shape across the upper third. It is
//      most of what makes a flat colour look like an object.
//   4. **No pure black and no pure white.** The ink is violet-black and the
//      highlights are warm, so nothing punches a hole in the page.
//
// These are plain SVG fragments rather than components with logic, because
// they are always drawn inside somebody else's `<svg>` viewBox.

export const INK = "#150e2b";

/** Stroke width that reads the same at 40px as at 200px. */
export const STROKE = 3;

/**
 * A vertical two-stop gradient, the workhorse.
 *
 * `id` has to be unique per document, so every caller prefixes with something
 * that identifies the icon — two icons on one page sharing a gradient id means
 * the first one wins for both.
 */
export function Grad({
  id,
  from,
  to,
  vertical = true,
}: {
  id: string;
  from: string;
  to: string;
  vertical?: boolean;
}) {
  return (
    <linearGradient
      id={id}
      x1="0"
      y1="0"
      x2={vertical ? "0" : "1"}
      y2={vertical ? "1" : "1"}
    >
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  );
}

/** A soft radial halo, for the thing an icon is about. */
export function Halo({ id, color }: { id: string; color: string }) {
  return (
    <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stopColor={color} stopOpacity="0.55" />
      <stop offset="100%" stopColor={color} stopOpacity="0" />
    </radialGradient>
  );
}

/**
 * The gloss: one soft shape across the upper third of a rounded body.
 *
 * Drawn as a wide, flat ellipse rather than a clipped rectangle because the
 * curve is what sells it — a straight-edged highlight reads as a reflection of
 * a window, and a curved one reads as the object being round.
 */
export function Gloss({
  cx,
  cy,
  rx,
  ry,
  opacity = 0.4,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity?: number;
}) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={opacity} />;
}

/** The shadow an object casts on whatever it's sitting on. */
export function GroundShadow({
  cx,
  cy,
  rx,
  ry = 5,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
}) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={INK} opacity="0.3" />;
}

/**
 * A four-pointed sparkle — the one decorative mark the set allows itself.
 *
 * Four points rather than five: a five-pointed star is a rating, and this is
 * meant to read as *shine*.
 */
export function Sparkle({
  x,
  y,
  size,
  color = "#fff",
  index = 0,
}: {
  x: number;
  y: number;
  size: number;
  color?: string;
  index?: number;
}) {
  const s = size;
  return (
    <path
      className="twinkle"
      style={{ "--i": index } as React.CSSProperties}
      d={`M ${x} ${y - s} Q ${x + s * 0.22} ${y - s * 0.22} ${x + s} ${y}
          Q ${x + s * 0.22} ${y + s * 0.22} ${x} ${y + s}
          Q ${x - s * 0.22} ${y + s * 0.22} ${x - s} ${y}
          Q ${x - s * 0.22} ${y - s * 0.22} ${x} ${y - s} Z`}
      fill={color}
    />
  );
}
