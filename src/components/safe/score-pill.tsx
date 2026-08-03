// The score, coloured by how warm it is.
//
// A hunt is a list of numbers, and a list of numbers is unreadable at a
// glance. Banding them gives the log a shape — you can see the run where you
// were getting somewhere without reading a single digit — while stopping short
// of a gradient, which would imply more precision than one decimal place has.

import { formatScore, scoreBand } from "@/lib/game/feedback";

const BANDS = {
  solved: "bg-brass text-zinc-950",
  hot: "bg-mark-green/25 text-mark-green",
  warm: "bg-brass/20 text-brass",
  cool: "bg-sky-500/15 text-sky-300",
  cold: "bg-white/5 text-zinc-600",
} as const;

const SIZES = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-4 py-2 text-2xl",
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
      className={`inline-block rounded-md font-mono font-bold tabular-nums ${BANDS[scoreBand(percent)]} ${SIZES[size]}`}
    >
      {formatScore(percent)}
    </span>
  );
}
