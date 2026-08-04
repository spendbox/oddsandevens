// The score, as a token you could pick up.
//
// A hunt is a list of numbers, and a list of numbers is unreadable at a
// glance. Banding them by warmth gives the log a shape — you can see the run
// where you were getting somewhere without reading a digit — and giving each
// band a solid colour with a bottom lip makes the good ones look like a prize
// rather than a table cell.
//
// It stops short of a continuous gradient, which would imply more precision
// than two decimal places have.

import { formatScore, scoreBand } from "@/lib/game/feedback";

const BANDS = {
  solved: "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.5),0_3px_0_var(--brass-deep)]",
  hot: "bg-mint text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_3px_0_var(--mint-deep)]",
  warm: "bg-brass/25 text-brass-bright shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
  cool: "bg-sky/20 text-sky shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
  cold: "bg-white/10 text-zinc-400",
} as const;

const SIZES = {
  sm: "px-2 py-0.5 text-xs rounded-lg",
  md: "px-3 py-1 text-sm rounded-xl",
  lg: "px-5 py-2.5 text-3xl rounded-2xl",
} as const;

export function ScorePill({
  percent,
  size = "sm",
}: {
  percent: number;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      className={`inline-block font-mono font-black tabular-nums ${BANDS[scoreBand(percent)]} ${SIZES[size]}`}
    >
      {formatScore(percent)}
    </span>
  );
}
