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
import { ChevronLeft, Coins, HelpCircle, Sparkles, Swords, Trophy, Users } from "lucide-react";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { compact } from "@/lib/plural";
import { rewardLabel } from "@/lib/game/rewards";
import type { PublicBox } from "@/lib/types";

/** Which stat a player has asked about. */
export type StatKind = "hunters" | "attempts" | "best";

/**
 * The rail, across the top of the chase.
 *
 * Row one is the box: the prize, and the two ways out. Row two is your own best
 * guess, spelled out. Row three is the crowd, with the difficulty beside it.
 *
 * Nothing on it is captioned. Every figure opens a sheet that says what it is,
 * which is the only moment anybody wants the sentence.
 */
export function SceneRail({
  box,
  bestGuess,
  onExplain,
  onBack,
  onReward,
  onStat,
  onBestGuess,
}: {
  box: PublicBox;
  /** The player's own best guess so far, or null before there is one. */
  bestGuess: string | null;
  onExplain: () => void;
  onBack?: () => void;
  onReward: () => void;
  onStat: (stat: StatKind) => void;
  onBestGuess: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the board"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-background/85 text-zinc-200 transition hover:border-brass/60 hover:text-brass"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        )}

        <button
          type="button"
          onClick={onReward}
          aria-label="What is in this safe"
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-brass/45 bg-background/85 px-3 py-1.5 transition hover:border-brass"
        >
          <Coins className="size-4 shrink-0 text-brass" aria-hidden />
          <span
            className={
              "truncate font-black leading-none tracking-tight tabular-nums " +
              (box.isChallenge ? "text-sm text-grape" : "brass-text text-lg")
            }
          >
            {rewardLabel(box.rewardKobo)}
          </span>
        </button>

        <button
          type="button"
          onClick={onExplain}
          aria-label="How it works"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-background/85 text-zinc-200 transition hover:border-brass/60 hover:text-brass"
        >
          <HelpCircle className="size-4" aria-hidden />
        </button>
      </div>

      {/*
        Your best guess, in full. It is the one thing on this screen you would
        otherwise have to open a sheet to re-read, and re-reading it is what
        every next guess is built on — you are editing this string, not writing
        a new one.
      */}
      {bestGuess && (
        <button
          type="button"
          onClick={onBestGuess}
          aria-label="Your best guess so far"
          className="flex w-full items-center gap-2 rounded-full border-2 border-white/15 bg-background/85 px-3 py-1.5 text-left transition hover:border-brass/60"
        >
          <Trophy className="size-3.5 shrink-0 text-brass" aria-hidden />
          <code className="min-w-0 flex-1 truncate font-mono text-sm font-bold tracking-wide text-foreground">
            {bestGuess}
          </code>
        </button>
      )}

      <div className="flex items-center justify-center gap-1.5">
        <Stat
          onClick={() => onStat("hunters")}
          icon={<Users className="size-3.5" aria-hidden />}
          value={compact(box.playersCount)}
          label="Hunters on this safe"
        />
        <Stat
          onClick={() => onStat("attempts")}
          icon={<Swords className="size-3.5" aria-hidden />}
          value={compact(box.attemptsCount)}
          label="Guesses made at this safe"
        />
        <Stat
          onClick={() => onStat("best")}
          icon={<Trophy className="size-3.5 text-brass" aria-hidden />}
          value={`${Math.round(box.bestPercent)}%`}
          label="The closest anybody has come"
          accent
        />
        {/* Down here with the rest of the readings, where it belongs — it is a
            figure about the box, not a control. */}
        <DifficultyBadge difficulty={box.difficulty} compact />
      </div>
    </div>
  );
}

function Stat({
  onClick,
  icon,
  value,
  label,
  accent,
}: {
  onClick: () => void;
  icon: ReactNode;
  value: string;
  /** Read out by a screen reader, and the reason the visible label is gone. */
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        "flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 font-mono text-sm font-black leading-none tabular-nums transition " +
        (accent
          ? "border-brass/45 bg-background/85 text-brass hover:border-brass"
          : "border-white/18 bg-background/85 text-zinc-200 hover:border-white/40")
      }
    >
      {icon}
      {value}
    </button>
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
        "flex items-center gap-1.5 rounded-full border-2 border-brass/40 bg-background/85 py-1 pl-2.5 pr-3 font-mono text-xs font-black tabular-nums text-brass shadow-lg backdrop-blur transition hover:border-brass " +
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
      className={`btn-chunky relative flex size-[3.25rem] shrink-0 items-center justify-center rounded-2xl text-ink sm:size-14 ${face}`}
    >
      {icon}
      {dot && (
        <span className="absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-background bg-foreground" />
      )}
    </button>
  );
}
