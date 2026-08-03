"use client";

// What a box is likely to earn, and why.
//
// A contributor putting ₦1,000,000 behind a password wants to know what comes
// back. The honest answer is a range with its workings visible, not a single
// confident number — so both ends are shown and the arithmetic sits right
// underneath, collapsed but one tap away. A projection you can't check is
// worth less than no projection at all.

import { useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";
import { revenueRange, SPENDING_SHARE } from "@/lib/game/revenue";
import { plural } from "@/lib/plural";

export function RevenueEstimate({
  hunters,
  earnedKobo,
  /** Live boxes quote real hunters; an unfunded one has to quote per hundred. */
  launched,
}: {
  hunters: number;
  earnedKobo: number;
  launched: boolean;
}) {
  const [open, setOpen] = useState(false);
  const basis = launched && hunters > 0 ? hunters : 100;
  const range = revenueRange(basis);

  return (
    <div className="mt-3 rounded-xl bg-white/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
          <TrendingUp className="size-3.5" aria-hidden />
          {launched && hunters > 0
            ? `Likely from ${plural(hunters, "hunter")}`
            : "Likely per 100 hunters"}
        </span>
        <span className="font-mono text-sm font-bold text-brass">
          {formatNaira(range.lowKobo)} – {formatNaira(range.highKobo)}
        </span>
      </div>

      {earnedKobo > 0 && (
        <p className="mt-1 text-[11px] text-zinc-500">
          {formatNaira(earnedKobo)} of it earned so far.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500 transition hover:text-zinc-300"
      >
        <ChevronDown
          className={"size-3 transition " + (open ? "rotate-180" : "")}
          aria-hidden
        />
        How this is worked out
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 border-t border-white/5 pt-2 text-[11px] leading-relaxed text-zinc-500">
          <p>
            Power-ups are a box&apos;s only income. You keep{" "}
            <strong className="text-zinc-300">{range.sharePercent}%</strong> of every
            one bought while somebody is attacking it; Spendbox keeps the rest.
          </p>
          <p>
            Most people try a box, get nowhere and wander off. We assume{" "}
            <strong className="text-zinc-300">
              {Math.round(SPENDING_SHARE * 100)}%
            </strong>{" "}
            of hunters buy anything at all — {plural(range.spenders, "spender")} out
            of {plural(range.hunters, "hunter")}.
          </p>
          <p>
            <strong className="text-zinc-300">Low end:</strong> each of them buys one
            Sweep at {formatNaira(range.cheapestKobo)}.{" "}
            <strong className="text-zinc-300">High end:</strong> each buys the whole
            shelf at {formatNaira(range.fullShelfKobo)}.
          </p>
          <p className="text-zinc-600">
            It&apos;s an estimate, and the spending share is a guess rather than a
            measurement. A harder box keeps people hunting longer, which pushes
            towards the top of the range. What you funded isn&apos;t in here —
            that&apos;s the reward, and it leaves.
          </p>
        </div>
      )}
    </div>
  );
}
