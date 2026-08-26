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
import { PushNudge } from "@/components/player/push-nudge";
import { Boxy, type BoxyMood } from "@/components/art/boxy";
import { CRACKS, cracksFor } from "@/lib/game/chase";
import { formatScore, scoreBand } from "@/lib/game/feedback";
import { visible } from "@/lib/constants";
import type { AttemptRecord } from "@/lib/types";

/*
 * There is no "stop showing me this" any more, and its absence is the fix.
 *
 * The X on this card used to write a permanent preference into localStorage —
 * one click, in one browser, and the answer to every future guess silently
 * stopped appearing, with nothing anywhere to turn it back on. An X on a card
 * means "close this card" to everybody who has ever used a computer, so that
 * is what it does now.
 *
 * Nothing reads the old key, so a browser that set it is unstuck by this
 * change alone; the value can sit there harmlessly until localStorage is next
 * cleared. And the card is hardly imposing to begin with: it takes itself away
 * after 2.6 seconds, and tapping anywhere on it closes it early.
 */

const LENGTH = {
  shorter: { icon: MoveUp, title: "Too short", body: "Add characters." },
  longer: { icon: MoveDown, title: "Too long", body: "Take characters away." },
  exact: { icon: Target, title: "Right length", body: "That is exactly how long it is." },
} as const;

/*
 * What Boxy says about the guess you just made.
 *
 * This used to be seven lines keyed off the score alone, and four of the seven
 * were some flavour of "no". On a safe that takes two thousand attempts that is
 * two thousand small refusals, and the mascot was wearing his sad face for most
 * of them — which is exactly backwards. Boxy is not the obstacle. He is the one
 * standing next to you while you work, and he is delighted when you win.
 *
 * So the reaction is read off the *movement* rather than the number. A score
 * that went up is worth cheering even at 12%, and a score that went down is not
 * a failure at all: it means the thing you changed was carrying weight, which
 * is the single most useful sentence this game can say to somebody who has just
 * lost three points. A flat zero is the same story told loudest — none of those
 * characters are in the password, and crossing off a whole handful at once is a
 * better afternoon than nudging a percentage.
 *
 * Nothing here is congratulation for turning up. Every line names what the
 * guess actually told them; the warmth is in the framing, not in adjectives.
 */
type Reaction = { line: string; mood: BoxyMood };

const WON = "The safe is open!";

const NEARLY = [
  "So close you can taste it.",
  "That is nearly the whole thing.",
  "One more idea and it's yours.",
];

const BEST = [
  "Your best yet!",
  "New best — keep pulling that thread.",
  "Top of your own table. Go again.",
];

const WARMER = [
  "Warmer! That change was worth making.",
  "Up on the last one — keep whatever you just did.",
  "That moved the right way.",
];

const COOLER = [
  "Cooler — so the last one had something this one doesn't.",
  "Down a little, and that is a real clue about what you swapped.",
  "That change cost you, which means it mattered. Put it back.",
];

const ZERO = [
  "A clean zero — not one of those characters is in it. Cross them all off.",
  "Nothing in there at all, and that rules out a whole handful at once.",
  "Zero is a result. You just eliminated every character in that guess.",
];

const STEADY = [
  "Same score, different guess — that's worth knowing too.",
  "No movement. Try changing something else.",
  "Held level. Something in there is carrying its weight.",
];

/** One of a pool, fixed per attempt so a re-render never changes it. */
function pick(pool: string[], seed: number): string {
  return pool[Math.abs(seed) % pool.length];
}

function reaction(
  percent: number,
  /** The score of the guess before this one. Null on the first of a hunt. */
  previous: number | null,
  previousBest: number,
  won: boolean,
  seed: number
): Reaction {
  if (won) return { line: WON, mood: "cheer" };

  if (percent > previousBest) {
    return {
      line: pick(percent >= 80 ? NEARLY : BEST, seed),
      mood: "cheer",
    };
  }

  // Warm scores keep the sly face whatever the movement: at 60% he knows
  // something, and looking worried about it would be a lie.
  const settled: BoxyMood = percent >= 45 ? "sly" : "thinking";

  if (percent === 0) return { line: pick(ZERO, seed), mood: "thinking" };
  if (previous === null) return { line: pick(STEADY, seed), mood: settled };
  if (percent > previous) {
    return { line: pick(WARMER, seed), mood: percent >= 45 ? "cheer" : "sly" };
  }
  if (percent < previous) return { line: pick(COOLER, seed), mood: settled };
  return { line: pick(STEADY, seed), mood: settled };
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
  previousScore,
  onClose,
}: {
  attempt: AttemptRecord;
  previousBest: number;
  /** The guess before this one. Null on the first of a hunt. */
  previousScore: number | null;
  onClose: () => void;
}) {
  /*
   * It stays until it is replaced or dismissed.
   *
   * There used to be a 2.6-second timer on this, which is a reasonable length
   * for a toast and the wrong idea for a *result*. The number and the line
   * beside it are the answer to the thing the player just spent a life on, and
   * on a phone — where the card sits above the button and below the scene —
   * two and a half seconds is easily less than the time it takes to look down,
   * read a percentage, and work out what it means about the guess before it.
   * Miss it and the only way back was the attempt log.
   *
   * So there is no clock. The next guess replaces it, because the parent sets a
   * new result per attempt, and the X or a tap on the card clears it early.
   * Nothing here is in anybody's way: it covers no control and dims nothing.
   */
  return (
    <div
      onClick={onClose}
      role="status"
      aria-live="polite"
      className="animate-fade-up sheet flex w-full cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 text-left"
    >
      <AttemptSummary
        attempt={attempt}
        previousBest={previousBest}
        previousScore={previousScore}
        live
      />

      {/* Closes this card, and only this card. Everything else about it is an
          announcement, and an announcement you have to dismiss with a button
          is the thing this card exists to stop being. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="shrink-0 self-start rounded-lg p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * One guess, said out loud: the face, the number, the line and the length.
 *
 * Shared between the card that appears the moment a guess lands and the list of
 * every earlier guess in the attempt dialog, because they are the same thing
 * seen at different times — and a player scrolling back through a hunt should
 * find the sentence they half-read at the time, not a different summary of the
 * same row. Extracting it is what makes "keep the pop-ups" possible at all.
 *
 * `live` is the only difference: the score counts up when the guess has just
 * been made, and is simply printed in a list of forty of them.
 */
export function AttemptSummary({
  attempt,
  previousBest,
  previousScore,
  live = false,
}: {
  attempt: AttemptRecord;
  previousBest: number;
  previousScore: number | null;
  live?: boolean;
}) {
  const percent = attempt.scorePercent;
  const personalBest = percent > previousBest;
  const counted = useCountUp(live ? percent : 0);
  const shown = live ? counted : percent;
  const length = LENGTH[attempt.lengthHint];
  const LengthIcon = length.icon;
  const said = reaction(percent, previousScore, previousBest, false, attempt.ordinal);

  return (
    <>
      {/* Not `still`: he reacts to every guess, and the one place a mascot
          earns his keep is the moment a result lands. */}
      <Boxy mood={said.mood} className="size-11 shrink-0" />

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
          <code className="min-w-0 truncate font-mono text-xs text-zinc-500">
            {visible(attempt.value)}
          </code>
          {personalBest && (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-bold text-brass">
              <TrendingUp className="size-3" aria-hidden />
              best yet
            </span>
          )}
        </p>

        {/* What he makes of it. The card used to show only the number and the
            length, which are both facts about the guess and neither of which is
            company. */}
        <p className="mt-0.5 text-xs font-bold leading-snug text-zinc-200">{said.line}</p>

        <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
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
    </>
  );
}

/**
 * The win, which happens once per box and gets the whole screen for it.
 */
export function ResultDialog({
  attempt,
  /** Their best *before* this guess, so an improvement can be called out. */
  previousBest,
  /** The guess before this one. Null on the first of a hunt. */
  previousScore,
  won,
  onClose,
}: {
  attempt: AttemptRecord;
  previousBest: number;
  previousScore: number | null;
  won: boolean;
  onClose: () => void;
}) {
  const percent = attempt.scorePercent;
  const personalBest = percent > previousBest;
  const said = reaction(percent, previousScore, previousBest, won, attempt.ordinal);
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

          <Boxy mood={said.mood} className="mx-auto size-24 drop-shadow-2xl" />

          <p className="mt-1 text-balance text-xl font-black tracking-tight">{said.line}</p>

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

          {/* Below the button, never above it: collecting the money is the only
              thing this screen is for, and a permission prompt must not stand
              between somebody and the thing they just won. */}
          {won && (
            <PushNudge reason="Want to know when a new safe this size goes up?" />
          )}


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
