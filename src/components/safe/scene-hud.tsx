"use client";

// The instruments around the scene.
//
// A game screen carries a lot of state — difficulty, the prize, the crowd, your
// best, the score to beat, what you've bought — and the old play screen showed
// all of it as prose stacked down the page, which pushed the safe below the
// fold on a phone. None of it is prose here.
//
// Two groups, and the split is by *when you look at it*:
//
//   The rail  runs across the top and is always visible: what this box is
//             worth, how hard it is, how many people are on it, and the number
//             to beat. Glanceable, never read.
//   The dock  floats over the bottom-right and is only touched deliberately:
//             your attempt log, the power-up shelf, your best guess. Each one
//             opens as a sheet, so the scene is never navigated away from.
//
// Everything here is a target of at least 44px, and the dock sits above the
// input bar rather than over it — a floating button that covers the thing you
// are typing into is a worse arrangement than no floating button.

import type { ReactNode } from "react";
import { HelpCircle, Sparkles, Swords, Trophy, Users } from "lucide-react";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { compact } from "@/lib/plural";
import { rewardLabel } from "@/lib/game/rewards";
import type { PublicBox } from "@/lib/types";

export function SceneRail({
  box,
  onExplain,
}: {
  box: PublicBox;
  onExplain: () => void;
}) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <DifficultyBadge difficulty={box.difficulty} />
        <button
          type="button"
          onClick={onExplain}
          aria-label="How it works"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white/12 bg-white/6 text-zinc-300 transition hover:border-brass/50 hover:text-brass"
        >
          <HelpCircle className="size-4" aria-hidden />
        </button>
      </div>

      <div className="text-center">
        <h1 className="truncate text-sm font-bold tracking-tight text-zinc-400">
          {box.title}
        </h1>
        <p
          className={
            "mt-1.5 font-black leading-none tabular-nums " +
            (box.isChallenge
              ? "text-2xl text-grape"
              : "brass-text text-4xl min-[360px]:text-5xl")
          }
        >
          {rewardLabel(box.rewardKobo)}
        </p>
      </div>

      <div className="flex items-stretch justify-center gap-2 pt-0.5">
        <Stat icon={<Users className="size-3.5" aria-hidden />} value={compact(box.playersCount)} label="hunters" />
        <Stat icon={<Swords className="size-3.5" aria-hidden />} value={compact(box.attemptsCount)} label="attempts" />
        {/*
          The number to beat. Nobody's name is on it and no date — one stranger
          got this close, which is all a leaderboard can honestly be on a game
          with exactly one winner.
        */}
        <Stat
          icon={<Trophy className="size-3.5 text-brass" aria-hidden />}
          value={`${Math.round(box.bestPercent)}%`}
          label="best yet"
          accent
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  accent,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={
        "flex min-w-[4.75rem] flex-col items-center rounded-xl border px-2.5 py-1.5 " +
        (accent ? "border-brass/35 bg-brass/10" : "border-white/10 bg-black/25")
      }
    >
      <span className="flex items-center gap-1 font-mono text-sm font-black leading-tight tabular-nums">
        {icon}
        {value}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
    </span>
  );
}

/**
 * Your best score, floating in the scene's top corner.
 *
 * It used to sit directly above the two dock buttons, which stacked three
 * floating things into one corner and put all of them across the safe. Opposite
 * corners: the reading in one, the controls in the other, and the safe visible
 * between them.
 */
export function BestPill({
  className = "",
  best,
  onClick,
}: {
  className?: string;
  best: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Your best guess"
      className={
        "flex items-center gap-1.5 rounded-full border-2 border-brass/40 bg-background/80 py-1 pl-2.5 pr-3 font-mono text-xs font-black tabular-nums text-brass shadow-lg backdrop-blur transition hover:border-brass " +
        className
      }
    >
      <Trophy className="size-3.5" aria-hidden />
      {best.toFixed(1)}%
    </button>
  );
}

/**
 * The dock: the two floating buttons over the corner of the scene.
 *
 * Positioned by the caller against the scene rather than the window. `fixed`
 * would be the obvious choice and is the wrong one on a phone — a phone
 * keyboard covers the bottom of the viewport, so a window-fixed dock is behind
 * it from the moment somebody starts typing, which is exactly when they reach
 * for the shelf. Floating over the scene, it scrolls with the safe and is
 * always where it was left.
 */
export function SceneDock({
  className = "",
  powerUps,
  onAttempts,
  onPowerUps,
}: {
  powerUps: number;
  onAttempts: () => void;
  onPowerUps: () => void;
  className?: string;
}) {
  return (
    <div className={`z-20 flex flex-col items-end gap-2 ${className}`}>
      <div className="flex gap-2">
        <DockButton
          onClick={onAttempts}
          label="Your attempts"
          tone="sky"
          icon={<Swords className="size-5" aria-hidden />}
        />
        {/* The shelf keeps its dot — "there is something here you can buy" is
            news. A running total of your own guesses is not. */}
        <DockButton
          onClick={onPowerUps}
          label="Power-ups"
          dot={powerUps > 0}
          tone="grape"
          icon={<Sparkles className="size-5" aria-hidden />}
        />
      </div>
    </div>
  );
}

const TONES = {
  sky: { face: "bg-sky", lip: "var(--sky-deep)" },
  grape: { face: "bg-grape", lip: "var(--grape-deep)" },
} as const;

function DockButton({
  onClick,
  label,
  dot,
  icon,
  tone,
}: {
  onClick: () => void;
  label: string;
  dot?: boolean;
  icon: ReactNode;
  tone: keyof typeof TONES;
}) {
  const { face, lip } = TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ "--btn-lip": lip } as React.CSSProperties}
      className={`btn-chunky relative flex size-14 items-center justify-center rounded-2xl text-ink ${face}`}
    >
      {icon}
      {dot && (
        <span className="absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-background bg-foreground" />
      )}
    </button>
  );
}
