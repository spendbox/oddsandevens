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
import { visible } from "@/lib/constants";
import { ChevronLeft, Coins, HelpCircle, Sparkles, Swords, Trophy, Users } from "lucide-react";
import { compact } from "@/lib/plural";
import { rewardLabel } from "@/lib/game/rewards";
import type { PublicBox } from "@/lib/types";

/** Which stat a player has asked about. */
export type StatKind = "hunters" | "attempts";

/**
 * The rail, across the top of the chase.
 *
 * Row one is the box: the prize, and the two ways out. Row two is your own best
 * guess with the score it earned. Row three is the crowd.
 *
 * There were two trophies up here — a percentage on the stat row and the same
 * percentage on a floating pill — and a player reasonably read them as two
 * different numbers and went looking for the difference. There is one now, and
 * it sits on the string it describes, where it needs no label at all.
 *
 * The difficulty has gone the other way, into the vault sheet. It is a fact
 * about the box you read once when you arrive, not a reading you check while
 * you play, and it was taking rail width from things that are.
 *
 * Nothing here is captioned. Every figure opens a sheet that says what it is,
 * which is the only moment anybody wants the sentence.
 */
export function SceneRail({
  box,
  bestGuess,
  yourBest,
  onExplain,
  onBack,
  onReward,
  onStat,
  onBestGuess,
}: {
  box: PublicBox;
  /** The player's own best guess so far, or null before there is one. */
  bestGuess: string | null;
  /** Their own best score. The one they navigate by. */
  yourBest: number | null;
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
        Your best guess, in full, with what it scored on the end of it. It is
        the one thing on this screen you would otherwise have to open a sheet
        to re-read, and re-reading it is what every next guess is built on —
        you are editing this string, not writing a new one. The percentage
        belongs against it for the same reason: it is that string's score.
      */}
      {bestGuess && (
        <button
          type="button"
          onClick={onBestGuess}
          aria-label={`Your best guess, ${(yourBest ?? 0).toFixed(1)}%`}
          className="flex w-full items-center gap-2 rounded-full border-2 border-white/15 bg-background/85 py-1.5 pl-3 pr-1.5 text-left transition hover:border-brass/60"
        >
          <Trophy className="size-3.5 shrink-0 text-brass" aria-hidden />
          <code className="min-w-0 flex-1 truncate font-mono text-sm font-bold tracking-wide text-foreground">
            {visible(bestGuess)}
          </code>
          <span className="shrink-0 rounded-full bg-brass/20 px-2 py-0.5 font-mono text-xs font-black tabular-nums text-brass">
            {(yourBest ?? 0).toFixed(1)}%
          </span>
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
      </div>
    </div>
  );
}

function Stat({
  onClick,
  icon,
  value,
  label,
}: {
  onClick: () => void;
  icon: ReactNode;
  value: string;
  /** Read out by a screen reader, and the reason the visible label is gone. */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-full border-2 border-white/18 bg-background/85 px-2.5 py-1 font-mono text-sm font-black leading-none tabular-nums text-zinc-200 transition hover:border-white/40"
    >
      {icon}
      {value}
    </button>
  );
}

/**
 * The dock: the two subtabs under the Crack the safe button.
 *
 * They were unlabelled squares floating beside the button, which made the
 * primary action share its row with them. They sit under it now, full width,
 * and they are *labelled* — an icon alone is a rebus, and one of these is the
 * shelf where the money is.
 *
 * Active boosters used to be a third one here and has gone to the rail,
 * opposite the lives: it is a reading rather than a control, and it belongs
 * with the other readings.
 *
 * Positioned by the caller against the scene rather than the window. `fixed`
 * would be the obvious choice and is the wrong one on a phone: a keyboard
 * covers the bottom of the viewport, so a window-fixed dock is behind it from
 * the moment somebody starts typing.
 */
export function SceneDock({
  className = "",
  powerUps,
  onAttempts,
  onPowerUps,
}: {
  /** How many power-ups are still buyable. Drives the dot. */
  powerUps: number;
  onAttempts: () => void;
  onPowerUps: () => void;
  className?: string;
}) {
  return (
    <div className={`z-20 grid grid-cols-2 gap-2 ${className}`}>
      <DockButton
        onClick={onAttempts}
        label="Attempts"
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
      style={{ "--btn-lip": lip } as React.CSSProperties}
      className={`btn-chunky relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-ink ${face}`}
    >
      {icon}
      <span className="w-full truncate text-center text-[11px] font-black leading-none">
        {label}
      </span>
      {dot && (
        <span className="absolute -right-1 -top-1 size-3.5 rounded-full border-2 border-background bg-foreground" />
      )}
    </button>
  );
}
