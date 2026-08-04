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
import { barsFor, fullness, VAULT_BARS, VAULT_CAPACITY_KOBO } from "@/lib/game/vault";

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
  const share = fullness(rewardKobo);
  const bars = barsFor(rewardKobo);

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
      <div className="space-y-4 pb-1 text-center">
        {isChallenge ? (
          <>
            <p className="text-3xl font-black tracking-tight text-grape">No money</p>
            <p className="text-sm text-zinc-400">
              This one is a pure challenge. Nothing to collect but the fact that
              you did it.
            </p>
          </>
        ) : (
          <>
            <p className="brass-text text-5xl font-black leading-none tracking-tight tabular-nums">
              {formatNaira(rewardKobo)}
            </p>

            {/* The same measure the chamber is drawn from, said in words. A
                vault that looks a third full is a third full of the same
                maximum as every other vault in the game — that is the whole
                reason the scale is fixed rather than per-box. */}
            <div>
              <div className="h-2.5 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brass-deep via-brass to-brass-bright transition-all duration-700"
                  style={{ width: `${Math.max(3, share * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                {bars} of {VAULT_BARS} bars · a full vault is{" "}
                {formatNaira(VAULT_CAPACITY_KOBO)}
              </p>
            </div>

            <p className="rounded-2xl border border-brass/20 bg-brass/10 px-3 py-2.5 text-sm text-zinc-300">
              It goes to whoever opens the door. All of it, in one payment, to a
              bank account you give us afterwards.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
