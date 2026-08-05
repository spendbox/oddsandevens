"use client";

// The first five minutes, in seven cards.
//
// Everything a new player needs to know is already written down — it is in the
// FAQ, in How it works, and on the shelf — and none of that is read by somebody
// who has just verified an email address and wants to guess a password. A
// reference is for the question you already have; this is for the questions you
// don't know to ask yet.
//
// So it is short, it is once, and it ends somewhere useful: on the bank details
// screen. That is the last step for a reason. Somebody who cracks a safe before
// adding an account has won money we cannot send, and the moment to ask for it
// is while nothing is at stake — not in the thirty seconds after a win, when
// the honest answer to "why do you need my bank details" is "because you just
// won ₦700,000" and that is exactly what a phishing screen would say.
//
// Nothing here is a gate. Every step has a way past it and the whole thing has
// a Skip, because a tutorial you cannot leave is an advertisement.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Landmark } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { PowerUpArt } from "@/components/art/power-up-art";
import { HeartArt } from "@/components/player/lives-badge";
import { SafeArt } from "@/components/safe/safe-art";
import { LIVES_MAX, SPECIALS } from "@/lib/constants";
import { secondWindLabel } from "@/lib/game/power-ups";

/** Where "they've seen it" lives. Per device, which is the honest scope. */
const SEEN_KEY = "spendbox.tutorial";

export function tutorialSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "done";
  } catch {
    // Private mode, or storage disabled. Treat it as seen rather than showing
    // the same seven cards on every single page load forever.
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
  body: ReactNode;
  art: ReactNode;
}

function steps(): Step[] {
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
      title: "You are guessing blind",
      art: <Boxy mood="thinking" className="size-24" />,
      body: (
        <>
          You are never told how long the password is. Every guess answers two
          things: whether it was too short, too long or exactly right, and how
          close you were as a score out of 100.
          <Tiles />
        </>
      ),
    },
    {
      title: "The score is the whole puzzle",
      art: <PowerUpArt kind="breakdown" className="size-20" />,
      body: (
        <>
          One number, and what it is made of is never explained. Two very
          different guesses can score the same, and working out which
          explanation fits is the game.
          <Bar />
          <strong className="text-brass-bright">100% means solved.</strong>{" "}
          Nothing else does.
        </>
      ),
    },
    {
      title: `${LIVES_MAX} lives, one back every hour`,
      art: <HeartArt className="size-20" />,
      body: (
        <>
          One life buys one guess, win or lose. They refill on their own,
          forever, so playing costs nothing but patience.
          <Pips />
          If you are out and don&apos;t want to wait, you can buy more — or take
          Second Wind, which is {secondWindLabel()}{" "}
          of unlimited guesses <em>on one safe</em>.
        </>
      ),
    },
    {
      title: "Power-ups buy back what's hidden",
      art: <PowerUpArt kind="x_ray" className="size-20" />,
      body: (
        <>
          Each one answers exactly one question the game is keeping from you:
          how long it is, how many capitals, how many symbols, or half the
          characters outright. All optional — a safe can be cracked without
          spending anything.
        </>
      ),
    },
    {
      title: "Anything you can type",
      art: <Alphabet />,
      body: (
        <>
          Letters in either case, digits, spaces and every symbol — including a
          few you will have to paste. <strong>Case matters:</strong>{" "}
          <code className="rounded bg-white/10 px-1 font-mono text-brass">k</code> and{" "}
          <code className="rounded bg-white/10 px-1 font-mono text-brass">K</code> are
          different characters, which is most of why a safe takes hundreds of
          attempts rather than a dozen.
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
  const all = steps();
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
            <button
              type="button"
              onClick={() => setAt((n) => n + 1)}
              style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
              className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink"
            >
              Next
              <ArrowRight className="size-4" aria-hidden />
            </button>
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

            {/* Where you are, and a way to jump. Seven cards is short enough
                that a dot row is a map rather than a progress bar. */}
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
      <div key={at} className="animate-fade-up space-y-3 pb-1 text-center">
        <div className="flex h-24 items-center justify-center">{step.art}</div>
        <p className="text-sm leading-relaxed text-zinc-300">{step.body}</p>
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

/** One number, and the fact that it is opaque. */
function Bar() {
  return (
    <span className="mx-auto mt-3 flex max-w-[15rem] items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full w-[62%] rounded-full bg-gradient-to-r from-mint to-brass" />
      </span>
      <span className="font-mono text-sm font-black text-brass">62%</span>
    </span>
  );
}

/** The pool, as a row you can count. */
function Pips() {
  return (
    <span className="mt-3 flex justify-center gap-1.5">
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
