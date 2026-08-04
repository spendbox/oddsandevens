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
import { formatNaira } from "@/lib/game/rewards";

export function PotDialog({
  rewardKobo,
  isChallenge,
  contributor,
  onClose,
}: {
  rewardKobo: number;
  isChallenge: boolean;
  contributor: string | null;
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
              Paid into the bank account of whoever cracks the code first.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
