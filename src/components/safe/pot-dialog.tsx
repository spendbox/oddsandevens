"use client";

// What is in the vault, when you ask.
//
// The prize used to be the largest thing on the play screen, printed across the
// top in gold. It is nowhere on the screen now — it is the pile of bars in the
// chamber, and this is what happens when you tap them.
//
// That is not a smaller version of the same idea, it is a different one. A
// figure at the top of a screen is a label; a pile you have to look into is a
// thing you can want. And a player mid-hunt does not need the number — they
// need to know which bolts moved. The number is for the moment you arrive and
// the moment you are deciding whether to keep going, and both of those are
// moments you go looking.

import { Coins } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { formatNaira } from "@/lib/game/rewards";
import { SponsorChip, SponsorPrize } from "@/components/sponsor";
import type { Difficulty } from "@/lib/game/difficulty";
import type { Sponsor } from "@/lib/types";

export function PotDialog({
  rewardKobo,
  isChallenge,
  contributor,
  difficulty,
  title,
  blurb,
  sponsor,
  onClose,
}: {
  rewardKobo: number;
  isChallenge: boolean;
  contributor: string | null;
  /** How hard this one is. It lives here rather than on the rail now. */
  difficulty: Difficulty;
  /** What the box is called, and whatever its author said about it. */
  title: string;
  blurb: string | null;
  /**
   * The business behind it, and what they are adding to the money.
   *
   * This is the sheet that answers "what is in this box", so it is the sheet
   * where the whole of the answer belongs — the figure and the thing, in the
   * order they are worth, on one screen. Everywhere else in the game the
   * sponsor is a line; here it is the object.
   */
  sponsor: Sponsor | null;
  onClose: () => void;
}) {
  return (
    <Modal
      title="In the vault"
      subtitle={contributor ? `Put up by ${contributor}` : "Put up by Spendbox"}
      icon={<Coins className="size-6 text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Back to work
        </button>
      }
    >
      <div className="space-y-3 pb-1 text-center">
        {isChallenge ? (
          <>
            <p className="text-3xl font-black tracking-tight text-grape">No money</p>
            <p className="text-sm text-zinc-400">A pure challenge.</p>
          </>
        ) : (
          <>
            <p className="brass-text text-5xl font-black leading-none tracking-tight tabular-nums">
              {formatNaira(rewardKobo)}
            </p>
            <p className="text-sm text-zinc-400">
              Paid, within 24 hours, into the bank account of whoever cracks
              the code first.
            </p>
          </>
        )}

        {/*
          And what the sponsor is adding, if there is one.

          Under the money rather than above it, on a challenge box as much as on
          a funded one — this is the second thing in the vault, and on a box with
          no money in it, it is the only thing. `SponsorPrize` draws nothing when
          the sponsorship is a name without a reward behind it, which is why the
          lockup below is separate rather than folded into it.
        */}
        {sponsor?.prize && <SponsorPrize sponsor={sponsor} />}

        {sponsor && !sponsor.prize && (
          <div className="flex justify-center border-t border-white/10 pt-3">
            <SponsorChip sponsor={sponsor} />
          </div>
        )}

        {/* The other half of "is this worth my month": what it pays, and what
            it will take. They belong on the same sheet. */}
        <div className="flex justify-center border-t border-white/10 pt-3">
          <DifficultyBadge difficulty={difficulty} />
        </div>

        {/*
          And what the box actually is. Every card on the site truncates the
          description to keep the boards even — this is the one place it is
          shown in full, which is why it is worth having a button for.
        */}
        <div className="border-t border-white/10 pt-3 text-left">
          <p className="font-black tracking-tight">{title}</p>
          {blurb ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{blurb}</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-500">
              No description — just the password.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
