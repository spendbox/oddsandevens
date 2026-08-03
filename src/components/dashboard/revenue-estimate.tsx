"use client";

// What a box is likely to earn, and why.
//
// A contributor putting ₦1,000,000 behind a password wants to know what comes
// back. The honest answer is a range with its workings visible, not a single
// confident number — so both ends are shown and the arithmetic sits right
// underneath, collapsed but one tap away. A projection you can't check is
// worth less than no projection at all.
//
// It is always quoted per thousand hunters. Quoting a live box's real player
// count looked more precise and was useless — a box with four hunters
// projected four hunters' worth of income, which says nothing about whether
// the box is worth running. A rate is the thing a contributor can multiply by
// their own expectations. What the box has *actually* made sits beside it, so
// the projection is never confused with the takings.
//
// The range moves with the reward, because the shelf does: every power-up is
// priced as a share of what's behind the password. A bigger box sells dearer
// hints, and this is where a contributor sees that before they commit.

import { useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";
import { BASIS, revenueRange, SPENDING_SHARE } from "@/lib/game/revenue";
import { plural } from "@/lib/plural";

export function RevenueEstimate({
  rewardKobo,
  hunters,
  earnedKobo,
}: {
  /** What's behind the password. The whole shelf is priced off it. */
  rewardKobo: number;
  /** Real hunters so far. Shown as fact, never used as the projection basis. */
  hunters: number;
  earnedKobo: number;
}) {
  const [open, setOpen] = useState(false);
  const range = revenueRange(rewardKobo);

  return (
    <div className="mt-3 rounded-xl bg-white/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
          <TrendingUp className="size-3.5" aria-hidden />
          Likely per {BASIS.toLocaleString("en-NG")} hunters
        </span>
        <span className="font-mono text-sm font-bold text-brass">
          {formatNaira(range.lowKobo)} – {formatNaira(range.highKobo)}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-zinc-500">
        {earnedKobo > 0
          ? `${formatNaira(earnedKobo)} earned so far from ${plural(hunters, "hunter")}.`
          : hunters > 0
            ? `${plural(hunters, "hunter")} so far, nothing bought yet.`
            : "Nobody hunting yet."}
      </p>

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
            You keep <strong className="text-zinc-300">{range.sharePercent}%</strong> of
            everything a hunter spends on your box — power-ups and lives alike.
            Spendbox keeps the rest.
          </p>
          <p>
            Power-ups are priced as a share of your reward, so this range moves
            with it. On {formatNaira(range.rewardKobo)} the shelf runs from{" "}
            <strong className="text-zinc-300">{formatNaira(range.cheapestKobo)}</strong>{" "}
            to{" "}
            <strong className="text-zinc-300">{formatNaira(range.fullShelfKobo)}</strong>{" "}
            for all of it.
          </p>
          <p>
            Most people try a box, get nowhere and wander off. We assume{" "}
            <strong className="text-zinc-300">
              {Math.round(SPENDING_SHARE * 100)}%
            </strong>{" "}
            of hunters buy anything at all — {plural(range.spenders, "spender")} per{" "}
            {range.hunters.toLocaleString("en-NG")}.
          </p>
          <p>
            <strong className="text-zinc-300">Low end:</strong> each spender buys the
            cheapest power-up, {formatNaira(range.cheapestKobo)}, and never pays for a
            life. <strong className="text-zinc-300">High end:</strong> each buys the
            whole shelf plus {plural(range.livesPerSpender, "life", "lives")} —{" "}
            {formatNaira(range.livesKobo)} of lives on top.
          </p>
          <p className="text-zinc-600">
            It&apos;s a rate, not a forecast — multiply it by however many people you
            think your link will reach. The spending share and the twenty lives are
            guesses rather than measurements, and a harder box keeps people hunting
            longer, which pushes towards the top of the range. What you funded
            isn&apos;t in here — that&apos;s the reward, and it leaves.
          </p>
        </div>
      )}
    </div>
  );
}
