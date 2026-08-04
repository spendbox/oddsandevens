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
import Link from "next/link";
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

function HowItWorksDialog({ onClose }: { onClose: () => void }) {
  const floor = minFundingKobo(MIN_LENGTH);

  return (
    <Modal
      title="Guess blind. One life = one guess."
      subtitle="Everything the game screens deliberately don't say."
      icon={<Boxy mood="sly" still className="size-9" />}
      onClose={onClose}
      footer={
        <Link
          href="/dashboard"
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Put up a box of your own
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <div className="space-y-5 pb-1 text-sm leading-relaxed text-zinc-600">
        <div className="rounded-2xl bg-zinc-100 px-4 py-3">
          <p className="font-semibold text-zinc-900">
            Every Spendbox protects real money behind a unique password.
          </p>
          <p className="mt-1">
            Playing is free: you start with {LIVES_MAX} lives and regain 1 life
            every hour. With each guess, you&apos;ll receive a single score from
            0 to 100, showing exactly how close you are to cracking the code.
          </p>
        </div>

        <Section title="Guess blind">
          <p>
            A password locks every Spendbox and your goal is to crack it.
          </p>
          <p>
            You don&apos;t know its length, the types of characters it contains,
            or where anything belongs. It could contain uppercase and lowercase
            letters, numbers, symbols — or any combination of them.
          </p>
          <p>
            Every guess costs one life. In return, you receive only a few clues.
          </p>
        </Section>

        <Section title="Length indicators">
          <Clue
            icon={<MoveUp className="size-4 text-sky-600" aria-hidden />}
            title="Too short"
            body="Your guess contains fewer characters than the password."
          />
          <Clue
            icon={<MoveDown className="size-4 text-sky-600" aria-hidden />}
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
            are to the correct password. A score of 100 means you&apos;ve
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
          <p className="text-center font-mono text-lg font-black text-zinc-900">
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
            When you purchase a power-up on someone&apos;s Spendbox, 70% of what
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
    <section className="space-y-2 border-t border-zinc-100 pt-4">
      <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-zinc-900">
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
    <div className="flex gap-3 rounded-xl bg-zinc-50 px-3 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5">{body}</p>
      </div>
    </div>
  );
}
