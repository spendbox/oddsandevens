"use client";

// The explainer, behind a button.
//
// It used to be three cards at the bottom of the landing page, and it had the
// problem every three-card explainer has: it is the most important text on the
// site and it is where nobody looks. Worse, it was the *only* place the rules
// were written, so a player who scrolled past it once never saw them again.
//
// Now it is a dialog, reachable from the landing page and from any box, and it
// is written as the answer to the four questions people actually ask in order:
// what is this, what does it cost, how do I win, and can I put one up.

import { useState } from "react";
import { ArrowRight, HelpCircle, Heart, Lock, Trophy, Wallet } from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
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
          "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold transition hover:border-brass/40"
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
      title="How Spendbox works"
      subtitle="A password, real money, and no clues you haven't earned."
      onClose={onClose}
      footer={
        <Link
          href="/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright"
        >
          Put up a box of your own
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <div className="space-y-4 pb-1">
        <Step
          icon={<Lock className="size-4 text-brass" aria-hidden />}
          title="Guess blind"
          body="Somebody has hidden a password and put money behind it. You aren't told how long it is or what it's made of. Anything on a keyboard can be in it — letters in either case, digits, and symbols like & $ # ) ( ; : ! ? *."
        />
        <Step
          icon={<Heart className="size-4 text-brass" aria-hidden />}
          title="One life, one guess"
          body={`Every attempt costs one life, win or lose. You hold ${LIVES_MAX}, shared across every box, and one comes back every hour — twenty-four a day, free, forever. Nobody has to buy anything: paying only buys speed.`}
        />
        <Step
          icon={<Trophy className="size-4 text-brass" aria-hidden />}
          title="A number, not a colour"
          body="A guess comes back with two things: whether it was too short, too long or exactly right, and a single score out of 100. What that score is made of is never published, so two very different guesses can score the same and working out which explanation fits is the whole game. 100% is the password, and nothing else reaches it."
        />
        <Step
          icon={<Wallet className="size-4 text-brass" aria-hidden />}
          title="Power-ups are the only paid part"
          body="Each one buys back exactly one thing the game withholds — the length, what it's made of, the parts behind a score, half its characters, or an hour with no life limit at all. They're priced as a share of the reward, so a bigger box costs more to get help on. On someone's box, 70% of what you spend goes to them."
        />

        <div className="border-t border-zinc-100 pt-3">
          <p className="text-sm font-semibold text-zinc-900">Or put one up yourself</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-500">
            Anyone can, and it isn&apos;t a business account or an application — a
            name and a password is the whole of it. A three-character box starts
            at {formatNaira(floor)} to fund; longer ones cost more, because they
            take longer to crack. 70% of what you put in becomes the reward —{" "}
            {formatNaira(splitFunding(floor).rewardKobo)} at the floor — and you
            keep 70% of everything hunters spend attacking it.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 border-t border-zinc-100 pt-3 first:border-0 first:pt-0">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brass/10">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{body}</p>
      </div>
    </div>
  );
}
