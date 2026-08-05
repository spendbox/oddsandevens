"use client";

// What just happened, said out loud.
//
// A guess used to land silently: the number in the log changed, a lock or two
// moved, and that was the entire feedback for the thing the whole game is
// about. On a screen you look at for an hour that is not enough — the moment a
// guess resolves is the only moment in this game with any drama in it, and it
// was being spent on a re-render.
//
// So it announces itself. The score counts up rather than appearing, because a
// number that climbs to 61 feels like a result and a number that is simply 61
// feels like a field. Boxy reacts. Locks that opened on this guess pop in after
// the ones that were already open. Beating your own best is called out, because
// it is the only progress there is on a box that takes two thousand attempts.
//
// The one thing it must never become is an obstacle, and the first version was:
// a full-screen dialog behind a dimmed backdrop, once per guess, on a game
// whose hardest box takes two thousand of them. So there are two of these, and
// which one you get depends on how often it can possibly happen.
//
//   The card   every ordinary guess. It sits above the field, dims nothing,
//              covers nothing you were looking at, and takes itself away after
//              a couple of seconds. Tap it to dismiss it early.
//   The dialog exactly once per box, when you win. That one has earned the
//              whole screen.
//
// Both can be switched off, which is remembered.

import { useCallback, useEffect, useRef, useState } from "react";
import { MoveDown, MoveUp, Target, TrendingUp, X } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { Boxy, type BoxyMood } from "@/components/art/boxy";
import { CRACKS, cracksFor } from "@/lib/game/chase";
import { formatScore, scoreBand } from "@/lib/game/feedback";
import type { AttemptRecord } from "@/lib/types";

/** Where the "stop showing me this" preference lives. */
const MUTE_KEY = "spendbox.quiet-results";

export function resultsMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Private mode, or storage disabled. Showing the dialog is the safe
    // default — it is the feature, and a lost preference is a small cost.
    return false;
  }
}

function mute() {
  try {
    window.localStorage.setItem(MUTE_KEY, "1");
  } catch {
    /* nothing to do, and nothing worth telling anybody about */
  }
}

const LENGTH = {
  shorter: { icon: MoveUp, title: "Too short", body: "Add characters." },
  longer: { icon: MoveDown, title: "Too long", body: "Take characters away." },
  exact: { icon: Target, title: "Right length", body: "That is exactly how long it is." },
} as const;

/** What Boxy makes of it. */
function moodFor(percent: number, won: boolean): BoxyMood {
  if (won) return "cheer";
  if (percent >= 80) return "cheer";
  if (percent >= 45) return "sly";
  if (percent >= 15) return "thinking";
  return "sad";
}

/** One line, chosen by how well it went. Never more than one. */
function headline(percent: number, won: boolean, personalBest: boolean): string {
  if (won) return "The safe is open!";
  if (personalBest && percent >= 80) return "So close.";
  if (personalBest) return "Your best yet.";
  if (percent >= 80) return "Nearly.";
  if (percent >= 45) return "Getting warm.";
  if (percent >= 15) return "Something in there.";
  return "Not this one.";
}

/**
 * The ordinary result: a card above the field.
 *
 * No backdrop, no portal, no dimming — it is laid over the bottom of the scene
 * by the caller, which means the safe and the bolts you have just moved stay
 * visible behind it. That matters: the card and the bolts are saying the same
 * thing, and hiding one to show the other wastes the moment.
 */
export function ResultCard({
  attempt,
  previousBest,
  onClose,
}: {
  attempt: AttemptRecord;
  previousBest: number;
  onClose: () => void;
}) {
  const percent = attempt.scorePercent;
  const personalBest = percent > previousBest;
  const shown = useCountUp(percent);
  const length = LENGTH[attempt.lengthHint];
  const LengthIcon = length.icon;

  /*
   * Takes itself away. Long enough to read a two-digit number and a hint,
   * short enough that somebody firing off guesses never waits for it.
   *
   * The callback goes through a ref rather than into the dependency list, and
   * that is not tidiness. Callers pass an inline arrow, so its identity changes
   * on every render of the parent — and the parent re-renders once a second for
   * as long as any countdown is running, which is exactly the case where a
   * discount or a free run is on. Depending on `onClose` meant the timer was
   * cleared and re-armed every second and so never fired at all: the card
   * simply stayed, on the one screen where something else was already
   * competing for the space.
   */
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const id = window.setTimeout(() => close.current(), 2600);
    return () => window.clearTimeout(id);
  }, [attempt.ordinal]);

  return (
    <div
      onClick={onClose}
      role="status"
      aria-live="polite"
      className="animate-fade-up sheet flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
    >
      <Boxy mood={moodFor(percent, false)} still className="size-11 shrink-0" />

      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span
            className={
              "text-2xl font-black leading-none tracking-tight tabular-nums " +
              (percent >= 80
                ? "text-brass"
                : percent >= 45
                  ? "text-mint"
                  : "text-sky")
            }
          >
            {formatScore(shown)}
          </span>
          {personalBest && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-brass">
              <TrendingUp className="size-3" aria-hidden />
              best yet
            </span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
          <LengthIcon
            className={
              "size-3.5 shrink-0 " +
              (attempt.lengthHint === "exact" ? "text-mark-green" : "text-sky")
            }
            aria-hidden
          />
          <span className="font-bold text-zinc-300">{length.title}</span>
          <span className="truncate">{length.body}</span>
        </p>
      </div>

      {/* The only real control on the card. Everything else about it is an
          announcement, and an announcement you have to dismiss with a button
          is the thing this card exists to stop being. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          mute();
          onClose();
        }}
        aria-label="Stop showing guess results"
        className="shrink-0 self-start rounded-lg p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The win, which happens once per box and gets the whole screen for it.
 */
export function ResultDialog({
  attempt,
  /** Their best *before* this guess, so an improvement can be called out. */
  previousBest,
  won,
  onClose,
}: {
  attempt: AttemptRecord;
  previousBest: number;
  won: boolean;
  onClose: () => void;
}) {
  const percent = attempt.scorePercent;
  const personalBest = percent > previousBest;
  const opened = won ? CRACKS : cracksFor(percent);
  const previouslyOpen = cracksFor(previousBest);
  const shown = useCountUp(percent);
  const length = LENGTH[attempt.lengthHint];
  const LengthIcon = length.icon;

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <Portal>
      {/*
        The whole backdrop is the dismiss target. Hunting is a rhythm — type,
        submit, read, type — and anything that makes a player aim for a button
        between guesses breaks it.
      */}
      <div
        onClick={close}
        role="dialog"
        aria-modal="true"
        aria-label="Guess result"
        className="fixed inset-0 z-50 flex items-center justify-center bg-background-deep/80 p-4 backdrop-blur-sm"
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className="animate-pop-in sheet relative w-full max-w-sm overflow-hidden rounded-3xl px-5 pb-5 pt-6 text-center"
        >
          <Burst band={scoreBand(percent)} />

          <Boxy mood={moodFor(percent, won)} className="mx-auto size-24 drop-shadow-2xl" />

          <p className="mt-1 text-xl font-black tracking-tight">
            {headline(percent, won, personalBest)}
          </p>

          <p
            className={
              "mt-2 font-black leading-none tracking-tight tabular-nums " +
              (won || percent >= 80
                ? "brass-text text-6xl"
                : percent >= 45
                  ? "text-6xl text-mint"
                  : "text-6xl text-sky")
            }
          >
            {formatScore(shown)}
          </p>

          {personalBest && !won && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 border-brass/40 bg-brass/12 px-3 py-1 text-xs font-bold text-brass">
              <TrendingUp className="size-3.5" aria-hidden />
              up {formatScore(percent - previousBest)} on your best
            </p>
          )}

          {/* The damage, restated small: the same ten cracks that are on the
              safe, so the number above has a shape as well as a value. */}
          <div className="mt-4 flex justify-center gap-1.5">
            {Array.from({ length: CRACKS }, (_, i) => (
              <span
                key={i}
                className={
                  "size-2.5 rounded-full transition-colors " +
                  (i < opened ? "bg-mint" : "bg-white/15")
                }
                style={
                  // Locks this guess opened arrive after the ones that were
                  // already open, so the new ground is visible as new.
                  i < opened && i >= previouslyOpen
                    ? {
                        animation: `pin-open 0.4s cubic-bezier(0.34,1.56,0.64,1) ${
                          0.25 + (i - previouslyOpen) * 0.08
                        }s both`,
                      }
                    : undefined
                }
              />
            ))}
          </div>

          {!won && (
            <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-black/25 px-3 py-2.5 text-sm">
              <LengthIcon
                className={
                  "size-4 " +
                  (attempt.lengthHint === "exact" ? "text-mark-green" : "text-sky")
                }
                aria-hidden
              />
              <span className="font-bold">{length.title}</span>
              <span className="text-zinc-400">{length.body}</span>
            </p>
          )}

          <button
            type="button"
            onClick={close}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky mt-5 w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
          >
            {won ? "Collect it" : "Keep going"}
          </button>


        </div>
      </div>
    </Portal>
  );
}

/**
 * Counts from zero to the score over about half a second.
 *
 * Stepped on a timer rather than a CSS transition because the thing being
 * animated is the *text*, and there is no interpolating a text node. 24 frames
 * is enough that it reads as a climb and short enough that nobody waiting to
 * type again resents it.
 */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    frame.current = 0;
    const id = window.setInterval(() => {
      frame.current += 1;
      const t = frame.current / 24;
      if (t >= 1) {
        window.clearInterval(id);
        setValue(target);
        return;
      }
      // Ease out, so it decelerates onto the number instead of stopping dead.
      setValue(target * (1 - Math.pow(1 - t, 3)));
    }, 22);
    return () => window.clearInterval(id);
  }, [target]);

  return value;
}

/**
 * A ring of sparks behind Boxy, thrown outward once.
 *
 * Only on a score worth celebrating: a burst behind every 4% guess is
 * confetti for turning up, which is worth nothing the second time.
 */
function Burst({ band }: { band: ReturnType<typeof scoreBand> }) {
  if (band !== "solved" && band !== "hot") return null;
  const colour = band === "solved" ? "var(--brass)" : "var(--mint)";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-4 h-32">
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 size-1.5 rounded-full"
            style={{
              background: colour,
              ["--fly-x" as string]: `${Math.cos(angle) * 110}px`,
              ["--fly-y" as string]: `${Math.sin(angle) * 90}px`,
              animation: `spark-fly 0.9s cubic-bezier(0.2, 0.8, 0.3, 1) ${i * 0.02}s both`,
            }}
          />
        );
      })}
    </div>
  );
}
