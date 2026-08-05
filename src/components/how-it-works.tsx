"use client";

// The explainer, behind a button.
//
// It used to be three cards at the bottom of the landing page, which is the
// problem every three-card explainer has: it is the most important text on the
// site and it is where nobody looks. It is a dialog now, reachable from the
// landing page and from inside any box, and it is the *only* place that
// explains the game at length — every screen is terse precisely because this
// exists.
//
// What it never does is explain how a score is calculated. It says that
// characters, positions and case all contribute and that the formula is
// deliberately hidden, which is true, useful, and stops well short of anything
// a spreadsheet could use.

import { useState } from "react";
import { ArrowRight, HelpCircle, MoveDown, MoveUp, Target } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { PowerUpArt } from "@/components/art/power-up-art";
import { HeartArt } from "@/components/player/lives-badge";
import { LIVES_MAX, MIN_LENGTH } from "@/lib/constants";
import { formatNaira, minFundingKobo, splitFunding } from "@/lib/game/rewards";

export function HowItWorksButton({
  className = "",
  label = "How it works",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-2 rounded-2xl border-2 border-white/15 bg-white/6 px-5 py-3.5 font-bold transition hover:border-brass/50 hover:bg-white/10 active:translate-y-0.5"
        }
      >
        <HelpCircle className="size-4" aria-hidden />
        {label}
      </button>
      {open && <HowItWorksDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function HowItWorksDialog({ onClose }: { onClose: () => void }) {
  const floor = minFundingKobo(MIN_LENGTH);

  return (
    <Modal
      // The old title was a sentence — "Guess blind. One life = one guess." —
      // which wrapped onto two lines on a phone and pushed the content down
      // before anybody had read a word of it. It's the subtitle now, where a
      // sentence belongs.
      title="How it works"
      subtitle="Guess blind. One life = one guess."
      icon={<Boxy mood="sly" still />}
      onClose={onClose}
      /*
        The way out is *into the game*, not into the dashboard. This sheet is
        opened almost entirely by people deciding whether to play — from the
        landing page and from the question mark on the play screen — and
        sending them off to build a box of their own was answering a question
        nobody in it had asked. Putting one up is a link in the footer of the
        site, where it belongs.
      */
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Start guessing
          <ArrowRight className="size-4" aria-hidden />
        </button>
      }
    >
      <div className="space-y-4 pb-1 text-sm leading-relaxed text-zinc-300 sm:space-y-5">
        <div className="rounded-2xl border border-brass/20 bg-brass/10 px-4 py-3">
          <p className="font-bold text-brass-bright">
            Every Spendbox protects real money behind a unique password.
          </p>
          <p className="mt-1">
            Playing is free: you start with {LIVES_MAX} lives and regain 1 life
            every hour. With each guess, you’ll receive a single score from
            0 to 100, showing exactly how close you are to cracking the code.
          </p>
        </div>

        <Section title="Guess blind">
          <p>
            A password locks every Spendbox and your goal is to crack it.
          </p>
          <p>
            You don’t know its length, the types of characters it contains,
            or where anything belongs. It could contain uppercase and lowercase
            letters, numbers, symbols — or any combination of them.
          </p>
          <p>
            <strong className="text-zinc-100">A space counts as a character.</strong>{" "}
            A password can be a phrase, so “open sesame” is as valid as
            “opensesame” and the two are different passwords. Wherever a guess
            is read back to you a space is drawn as{" "}
            <span className="font-mono text-brass">␣</span>, so you can always
            see whether one is there.
          </p>
          <p>
            Every guess costs one life. In return, you receive only a few clues.
          </p>
        </Section>

        <Section title="Length indicators">
          <Clue
            icon={<MoveUp className="size-4 text-sky" aria-hidden />}
            title="Too short"
            body="Your guess contains fewer characters than the password."
          />
          <Clue
            icon={<MoveDown className="size-4 text-sky" aria-hidden />}
            title="Too long"
            body="Your guess contains more characters than the password."
          />
          <Clue
            icon={<Target className="size-4 text-mark-green" aria-hidden />}
            title="Exact length"
            body="Your guess is the same length as the password. The actual length remains hidden — you only know when you've matched it."
          />
        </Section>

        <Section title="Your score">
          <p>
            Every guess receives a score from 0 to 100, showing how close you
            are to the correct password. A score of 100 means you’ve
            cracked the Spendbox.
          </p>
          <p>
            The score is calculated from how closely your guess matches the
            password. Correct characters, character positions, and case all
            contribute to the result — but the exact formula is deliberately
            hidden.
          </p>
          <p>
            That means two completely different guesses can receive the same
            score. Figuring out why a score increased or decreased is part of
            the challenge.
          </p>
        </Section>

        <Section title="Case matters">
          <p>
            Uppercase and lowercase characters are treated as different
            characters.
          </p>
          <p className="text-center font-mono text-lg font-black text-foreground">
            K is not k
          </p>
        </Section>

        <Section title="Lives" icon={<HeartArt className="size-6" />}>
          <p>You begin with {LIVES_MAX} lives.</p>
          <p>
            One life is restored automatically every hour, up to the maximum.
            You can always keep playing over time, even if you never spend
            money.
          </p>
        </Section>

        <Section
          title="Power-ups"
          icon={<PowerUpArt kind="x_ray" className="size-7" />}
        >
          <p>
            Power-ups reveal information that the game intentionally keeps
            hidden. Each one unlocks a different piece of the puzzle, helping
            you narrow down the password more quickly.
          </p>
          <p>
            When you purchase a power-up on someone’s Spendbox, 70% of what
            you spend goes directly to the creator of that box.
          </p>
        </Section>

        <Section title="Attempt history">
          <p>Every guess is saved in your attempt log.</p>
          <p>
            Tap any previous attempt to view it in full and compare it against
            your newer guesses as you work toward the solution.
          </p>
        </Section>

        <Section title="Or put one up yourself" icon={<Boxy mood="cheer" still className="size-8" />}>
          <p>
            Anyone can create a Spendbox — no application, no approval process.
            Choose a name, set a password, and decide on a reward. From{" "}
            {formatNaira(floor)}, of which 70% becomes the reward —{" "}
            {formatNaira(splitFunding(floor).rewardKobo)} at the floor.
          </p>
          <p>
            You keep 70% of everything hunters spend trying to crack it, and the
            person who unlocks it wins the reward inside.
          </p>
        </Section>
      </div>
    </Modal>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-white/10 pt-4">
      <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Clue({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl bg-black/25 px-3 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="font-bold text-foreground">{title}</p>
        <p className="mt-0.5">{body}</p>
      </div>
    </div>
  );
}
