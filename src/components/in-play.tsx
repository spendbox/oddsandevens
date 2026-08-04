"use client";

// Where you were.
//
// A signed-in player arriving at the front page was shown exactly what a
// stranger was shown: a wall of boxes to choose from. But somebody four
// hundred guesses into a safe is not choosing — they are coming back, and the
// only thing they want is the one they were on.
//
// So this sits above the board and looks nothing like it. The board's cards
// are portrait, headed by a reward, and answer "is this worth starting". These
// are landscape, headed by a *progress bar*, and answer "how far in am I".
// Same boxes, opposite question, and the shape is the fastest way to say which
// one you're looking at.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Play } from "lucide-react";
import { SafeArt } from "@/components/safe/safe-art";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { rewardLabel } from "@/lib/game/rewards";
import { plural } from "@/lib/plural";
import type { InPlayHunt } from "@/lib/types";

export function InPlay({ enabled }: { enabled: boolean }) {
  const [hunts, setHunts] = useState<InPlayHunt[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/player/playing", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { hunts: InPlayHunt[] };
      if (!cancelled) setHunts(body.hunts);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // The `enabled` half of this is what hides a stale list after a sign-out
  // rather than clearing it in the effect, which is a cascading render for
  // something a render guard settles.
  if (!enabled || hunts.length === 0) return null;

  return (
    <section className="animate-fade-up mx-auto w-full max-w-5xl px-4 pb-2">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-mint">
        <Play className="size-4" aria-hidden />
        Still open
        <span className="rounded-md bg-mint/15 px-1.5 py-0.5 font-mono text-[11px] text-mint">
          {hunts.length}
        </span>
      </h2>

      {/*
        One column on a phone, two from `sm`. Not a carousel: these are things
        you already own and a list you can see all of beats a list you have to
        drag through.
      */}
      <div className="grid gap-2 sm:grid-cols-2">
        {hunts.map((hunt, i) => (
          <ResumeCard key={hunt.slug} hunt={hunt} index={i} />
        ))}
      </div>
    </section>
  );
}

/**
 * One safe you're mid-way through.
 *
 * The bar is the whole card. Your best score fills it and the best anybody has
 * managed is a notch on it — so the gap between the two is visible without a
 * single number being read, and the gap is the entire reason to open it again.
 */
function ResumeCard({ hunt, index }: { hunt: InPlayHunt; index: number }) {
  const yours = Math.max(0, Math.min(100, hunt.bestPercent));
  const theirs = Math.max(0, Math.min(100, hunt.boxBestPercent));
  const leading = yours >= theirs;

  return (
    <Link
      href={`/b/${hunt.slug}`}
      style={{ ["--i" as string]: index }}
      /*
        `min-w-0` is load-bearing. A grid item's min-width is `auto`, which
        means the column cannot size below the card's min-content — and a card
        whose min-content is a 48px safe, a title, a reward and a chevron in a
        row is about 390px wide. On a 320px phone the column simply stayed
        390px and the right-hand third of every card was clipped away by the
        page's `overflow-x: clip`, silently, with no scrollbar to explain it.
      */
      className="panel panel-lift animate-fade-up stagger group flex min-w-0 items-center gap-3 rounded-2xl border-mint/25 p-3"
    >
      <SafeArt
        design={hunt.design}
        className="size-12 shrink-0 transition group-hover:-rotate-6"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-black tracking-tight">{hunt.title}</p>
          <p
            className={
              "shrink-0 font-mono text-xs font-black tabular-nums " +
              (hunt.isChallenge ? "text-grape" : "text-brass")
            }
          >
            {rewardLabel(hunt.rewardKobo)}
          </p>
        </div>

        {/* Your best, and the mark to beat. */}
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-mint to-brass transition-[width] duration-700"
            style={{ width: `${yours}%` }}
          />
          {!leading && (
            <span
              aria-hidden
              className="absolute inset-y-0 w-0.5 bg-white/70"
              style={{ left: `${theirs}%` }}
            />
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-zinc-500">
            <span className="font-mono font-black text-mint">{yours.toFixed(1)}%</span>
            {" · "}
            {plural(hunt.attempts, "guess", "guesses")}
            {!leading && (
              <>
                {" · "}
                <span className="text-zinc-400">best {theirs.toFixed(1)}%</span>
              </>
            )}
          </p>
          <DifficultyBadge difficulty={hunt.difficulty} compact />
        </div>
      </div>

      <ChevronRight
        className="size-5 shrink-0 text-zinc-500 transition group-hover:translate-x-1 group-hover:text-mint"
        aria-hidden
      />
    </Link>
  );
}
