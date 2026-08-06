"use client";

// The first five minutes.
//
// It used to be seven cards that *described* the game: here is a score, here is
// a length hint, here is what case sensitivity means. All true, all read in
// about nine seconds, and none of it survived contact with a real safe — because
// what a new player is missing is not a list of the rules. It is the loop. They
// do not know what to type second, or what a number going down is worth, or
// that a guess scoring zero is one of the best things that can happen to them.
//
// Nobody learns a deduction puzzle from a description of deduction. So the
// middle of this is a real safe with a real password (`B0x!`), and the player
// cracks it themselves in nineteen guesses, with the reasoning said out loud
// between each one. Everything on either side is framing: two cards before it so
// the first guess makes sense, three after it so they know what they are
// carrying into a box that hasn't been solved for them.
//
// It ends on the bank details screen, and that is the last step for a reason.
// Somebody who cracks a safe before adding an account has won money we cannot
// send, and the moment to ask for it is while nothing is at stake — not in the
// thirty seconds after a win, when the honest answer to "why do you need my
// bank details" is "because you just won ₦700,000" and that is exactly what a
// phishing screen would say.
//
// Nothing here is a gate. Every step has a way past it, the practice safe will
// type its own guesses for anybody who would rather watch, and the whole thing
// has a Skip — because a tutorial you cannot leave is an advertisement. It is
// also replayable from the front page, which the first version was not: it
// showed itself once per device, forever, and a player who skipped it on a bus
// had no way back to it.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Landmark, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { PowerUpArt } from "@/components/art/power-up-art";
import { HeartArt } from "@/components/player/lives-badge";
import { SafeArt } from "@/components/safe/safe-art";
import { LIVES_MAX, SPECIALS } from "@/lib/constants";
import { secondWindLabel } from "@/lib/game/power-ups";
import { TutorialCrack, TutorialPrize } from "./tutorial-crack";

/** Where "they've seen it" lives. Per device, which is the honest scope. */
const SEEN_KEY = "spendbox.tutorial";

export function tutorialSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "done";
  } catch {
    // Private mode, or storage disabled. Treat it as seen rather than showing
    // the same cards on every single page load forever.
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "done");
  } catch {
    // Nothing to do. The worst case is being offered it again.
  }
}

interface Step {
  title: string;
  /** Omitted by the practice safe, which is its own picture. */
  art?: ReactNode;
  body: ReactNode;
  /**
   * Full width, left-aligned, and no Next button of its own — the step drives
   * its own progress and says when it is finished.
   */
  drives?: boolean;
}

function steps(onSolved: () => void): Step[] {
  return [
    {
      title: "A password with money behind it",
      art: <SafeArt design="brass" className="size-24" />,
      body: (
        <>
          Somebody hides a password and puts real money behind it. Anyone who
          guesses the password takes the money. That is the whole game — there
          is nothing else to it and nothing else to learn.
        </>
      ),
    },
    {
      title: "Every guess answers two things",
      art: <Boxy mood="thinking" className="size-24" />,
      body: (
        <>
          You are never told how long the password is, or what is in it. What
          you get back is whether the guess was too short, too long or exactly
          right — and one score out of 100.
          <Tiles />
          <strong className="text-brass-bright">100% means solved.</strong>{" "}
          Nothing else does. How the rest of the number is arrived at is never
          explained, and working it out is the game.
        </>
      ),
    },
    {
      title: "Crack this one with me",
      drives: true,
      body: <TutorialCrack onSolved={onSolved} />,
    },
    {
      title: "That's a safe cracked",
      art: null,
      body: <TutorialPrize />,
    },
    {
      title: "Anything you can type",
      art: <Alphabet />,
      body: (
        <>
          That one was four characters and kind to you. A real password can use
          letters in either case, digits, spaces, and every symbol — including a
          few you will have to paste.
          <br />
          <br />
          You already felt why that matters:{" "}
          <code className="rounded bg-white/10 px-1 font-mono text-brass">x</code>{" "}
          and{" "}
          <code className="rounded bg-white/10 px-1 font-mono text-brass">X</code>{" "}
          scored two and a half times apart. Pay attention to the Case.
        </>
      ),
    },
    {
      title: "Now find your own way in",
      art: <Sparkles className="size-16 text-brass" aria-hidden />,
      body: (
        <>
          That was one route, not the route. Sweep for blanks first, or hunt the
          length, or open with words you think somebody would actually choose —
          players who win regularly all have a method, and none of them have the
          same one.
          <br />
          <br />
          <strong className="text-brass-bright">
            Some safes are genuinely hard.
          </strong>{" "}
          Hundreds of attempts hard. That is not you doing it wrong — and the
          harder a safe is, the more it is holding. A guess that scores nothing
          still crossed characters off. You are never not making progress.
        </>
      ),
    },
    {
      title: `${LIVES_MAX} lives, one back every hour`,
      art: <HeartArt className="size-20" />,
      body: (
        <>
          One life buys one guess, win or lose. You hold {LIVES_MAX} at a time
          and they refill on their own, forever, so playing costs nothing but
          patience.
          <Pips />
          Out and impatient? Buy more, or take Second Wind —{" "}
          {secondWindLabel()} of unlimited guesses on one safe. And when you are
          properly stuck, the power-ups buy back exactly one hidden thing each:
          how long it is, how many capitals, how many symbols, or half the
          characters outright.
          <span className="mt-3 flex justify-center gap-2">
            <PowerUpArt kind="x_ray" className="size-10" />
            <PowerUpArt kind="length_lock" className="size-10" />
            <PowerUpArt kind="second_wind" className="size-10" />
            <PowerUpArt kind="breakdown" className="size-10" />
          </span>
          Every one of them is optional. Nothing on that shelf is needed to
          crack anything.
        </>
      ),
    },
    {
      title: "Add your bank account now",
      art: <Landmark className="size-16 text-brass" aria-hidden />,
      body: (
        <>
          Rewards are sent <strong className="text-brass-bright">within 24 hours</strong>{" "}
          of a safe being cracked — but only to an account we already have.
          <br />
          <br />
          Adding it now takes a minute and means a win pays out immediately
          instead of waiting on you. We check the number with your bank and show
          you the name on it before saving anything.
        </>
      ),
    },
  ];
}

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [at, setAt] = useState(0);
  const all = steps(() => setAt((n) => n + 1));
  const step = all[at];
  const last = at === all.length - 1;

  function done() {
    markTutorialSeen();
    onClose();
  }

  return (
    <Modal
      title={step.title}
      subtitle={`${at + 1} of ${all.length}`}
      width="sm"
      onClose={done}
      footer={
        <div className="space-y-2">
          {last ? (
            <Link
              href="/me?tab=account"
              onClick={done}
              style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
              className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink"
            >
              Add my bank account
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            /* The practice safe has its own buttons and its own idea of when
               it is finished, so it does not get a Next above them. */
            !step.drives && (
              <button
                type="button"
                onClick={() => setAt((n) => n + 1)}
                style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
                className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink"
              >
                Next
                <ArrowRight className="size-4" aria-hidden />
              </button>
            )
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={at === 0}
              onClick={() => setAt((n) => Math.max(0, n - 1))}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-zinc-500 transition hover:text-zinc-300 disabled:opacity-0"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              Back
            </button>

            {/* Where you are, and a way to jump. Short enough that a dot row is
                a map rather than a progress bar. */}
            <div className="flex gap-1.5">
              {all.map((one, i) => (
                <button
                  key={one.title}
                  type="button"
                  aria-label={one.title}
                  aria-current={i === at}
                  onClick={() => setAt(i)}
                  className={
                    "h-1.5 rounded-full transition-all " +
                    (i === at ? "w-5 bg-brass" : "w-1.5 bg-white/25 hover:bg-white/50")
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={done}
              className="rounded-lg px-2 py-1.5 text-xs font-bold text-zinc-500 transition hover:text-zinc-300"
            >
              {last ? "Later" : "Skip"}
            </button>
          </div>
        </div>
      }
    >
      {/* Keyed on the step so each card animates in rather than the text
          swapping under a static picture. */}
      <div
        key={at}
        className={
          "animate-fade-up space-y-3 pb-1 " + (step.drives ? "text-left" : "text-center")
        }
      >
        {step.art !== undefined && step.art !== null && (
          <div className="flex h-24 items-center justify-center">{step.art}</div>
        )}
        {step.drives ? (
          step.body
        ) : (
          <div className="text-sm leading-relaxed text-zinc-300">{step.body}</div>
        )}
      </div>
    </Modal>
  );
}

/** A guess, and the two things it comes back with. */
function Tiles() {
  return (
    <span className="mt-3 flex flex-col items-center gap-1.5">
      <span className="flex gap-1">
        {"Tr0ub4d".split("").map((ch, i) => (
          <span
            key={i}
            className="flex size-6 items-center justify-center rounded border-2 border-white/15 bg-white/8 font-mono text-xs font-black text-zinc-200"
          >
            {ch}
          </span>
        ))}
      </span>
      <span className="flex gap-2 text-[11px] font-bold">
        <span className="rounded-full bg-sky/20 px-2 py-0.5 text-sky">too short</span>
        <span className="rounded-full bg-brass/20 px-2 py-0.5 text-brass">41%</span>
      </span>
    </span>
  );
}

/** The pool, as a row you can count. */
function Pips() {
  return (
    <span className="my-3 flex justify-center gap-1.5">
      {Array.from({ length: LIVES_MAX }, (_, i) => (
        <span key={i} className="size-3 rounded-full bg-berry" />
      ))}
    </span>
  );
}

/** A handful of what a password can be built from. */
function Alphabet() {
  // The odd ones, because those are the ones nobody expects to be allowed.
  const sample = ["A", "a", "7", "␣", ...SPECIALS.slice(-6)];
  return (
    <span className="flex max-w-[16rem] flex-wrap justify-center gap-1">
      {sample.map((ch, i) => (
        <span
          key={i}
          className="flex size-7 items-center justify-center rounded-lg border-2 border-white/15 bg-white/8 font-mono text-sm font-black text-zinc-200"
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
