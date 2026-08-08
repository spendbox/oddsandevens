"use client";

// Putting a prize in one of our own boxes, after it is already on the board.
//
// The create form asks the same question, and for a while it was the only
// place that ever did: a box authored without a figure was a pure challenge
// for the rest of its life, and a headline agreed the week after the safe went
// up meant deleting the box and building it again — taking its hunters, its
// attempts and its slug with it. That is a very expensive way to type a
// number.
//
// The two rules the route enforces are printed here rather than discovered by
// being refused. Ours only, because a contributor's reward is their funding
// minus our cut and nothing else. And upwards only, because somebody is
// spending a fortnight of lives against the figure on that card.

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { KOBO, MAX_FUNDING_KOBO } from "@/lib/constants";
import { capNaira, formatNaira, rewardLabel } from "@/lib/game/rewards";

const INPUT = "field px-4 py-3";

export function PrizeDialog({
  boxId,
  boxTitle,
  rewardKobo,
  onClose,
  onSaved,
}: {
  boxId: string;
  boxTitle: string;
  /** What is in it now. Zero is a pure challenge, which is a real answer. */
  rewardKobo: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Pre-filled with what the box already holds: the common edit is "make it a
  // bit more than it is", and retyping the current figure from scratch to do
  // that is a good way to fat-finger a zero off the end of it.
  const [naira, setNaira] = useState(rewardKobo > 0 ? String(Math.round(rewardKobo / KOBO)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = Math.round(Number(naira || 0) * KOBO);
  const lowers = next < rewardKobo;
  const unchanged = next === rewardKobo;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/boxes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boxId, rewardKobo: next }),
    });
    setBusy(false);

    if (res.ok) {
      onSaved();
      onClose();
      return;
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(
      body.error === "would_lower"
        ? "A prize can only go up. Close the box instead if it is wrong."
        : body.error === "not_ours"
          ? "That box belongs to a contributor. Its reward is their funding."
          : body.error === "box_not_open"
            ? "That box is finished. Its prize is settled."
            : "Couldn't save that. Try again in a moment."
    );
  }

  return (
    <Modal
      title="The prize"
      subtitle={boxTitle}
      icon={<Wallet className="size-6 text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || lowers || unchanged}
          onClick={() => void save()}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          {busy
            ? "Saving…"
            : lowers
              ? "A prize can only go up"
              : unchanged
                ? "Already worth that"
                : `Put ${formatNaira(next)} in it`}
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-zinc-400">
            ₦
          </span>
          <input
            inputMode="numeric"
            autoFocus
            value={naira}
            onChange={(e) => setNaira(capNaira(e.target.value))}
            placeholder="Leave blank for a pure challenge"
            className={`${INPUT} pl-8 font-mono`}
          />
        </div>

        <p className="text-sm text-zinc-500">
          Currently{" "}
          <strong className="text-zinc-300">{rewardLabel(rewardKobo)}</strong>.
          Ours to fund, so there is no floor and no split — whatever goes in
          here is what the winner is paid. It can go up and never down, because
          people are spending lives against the figure on the card.{" "}
          {formatNaira(MAX_FUNDING_KOBO)} is the ceiling.
        </p>

        {error && (
          <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
