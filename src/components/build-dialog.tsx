"use client";

// "Build your own Spendbox", as a dialog.
//
// It was a card on the landing page with two paragraphs, two buttons and three
// safes — a lot of front page for something most visitors are not there to do.
// The pitch is unchanged; it just waits behind a tap, which is the right trade
// for a page whose job is getting somebody onto a box.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { SafeArt } from "@/components/safe/safe-art";
import { MIN_LENGTH, PLATFORM_SHARE_PERCENT } from "@/lib/constants";
import { formatNaira, minFundingKobo, splitFunding } from "@/lib/game/rewards";

export function BuildDialog({ onClose }: { onClose: () => void }) {
  const floor = minFundingKobo(MIN_LENGTH);
  const share = 100 - PLATFORM_SHARE_PERCENT;

  return (
    <Modal
      title="Build your own Spendbox"
      subtitle="Same account you play with."
      icon={<Boxy mood="cheer" still className="size-9" />}
      width="sm"
      onClose={onClose}
      footer={
        <Link
          href="/dashboard"
          style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
          className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-grape px-4 py-3.5 text-ink"
        >
          Build and earn
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
    >
      <div className="space-y-4 pb-1 text-sm leading-relaxed text-zinc-600">
        <div className="flex justify-center gap-1">
          <SafeArt design="crimson" className="size-16" />
          <SafeArt design="emerald" className="size-16" />
          <SafeArt design="midnight" className="size-16" />
        </div>

        <p>
          Anyone can create a Spendbox — no application, no approval process.
          Just choose a name, set a password, and decide on a reward.
        </p>
        <p>
          Fund your Spendbox with as little as {formatNaira(floor)} and publish
          it for the world to challenge. You keep {share}% of everything hunters
          spend attempting to crack it, while the person who successfully
          unlocks it wins the reward inside.
        </p>
        <p className="rounded-2xl bg-zinc-100 px-3 py-2.5 text-zinc-700">
          {share}% of what you put in becomes the reward —{" "}
          <strong>{formatNaira(splitFunding(floor).rewardKobo)}</strong> at the
          floor. Spendbox keeps {PLATFORM_SHARE_PERCENT}% for running the box.
        </p>
      </div>
    </Modal>
  );
}
