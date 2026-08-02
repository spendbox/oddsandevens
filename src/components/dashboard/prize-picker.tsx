"use client";

// The podium.
//
// A business already told us what it can give away — that list is the reward
// catalogue. Making them retype "Free plate of jollof" into a text box for
// every game was asking the same question twice and getting two slightly
// different answers, which is how a prize ends up spelled two ways on two
// screens.
//
// So a place on the podium is *chosen*, not typed: tap a place, tap a reward.
// Ten places are available, because a board with ten winners is a board ten
// people have a reason to chase, and a business giving away ten small things
// usually does better than one giving away one big thing.

import { useState } from "react";
import { Check, Gift, Plus, Trash2, X } from "lucide-react";
import { MAX_PODIUM_PLACES, RANK_MEDALS, rankLabel } from "@/lib/games/catalog";
import type { PrizeRow } from "@/lib/games/slots";
import type { RewardTemplate } from "@/lib/types";
import { rewardIcon } from "@/lib/reward-icons";
import { Modal } from "@/components/ui/modal";

/** A reward as it goes onto the podium. */
function fromTemplate(template: RewardTemplate, rank: number): PrizeRow {
  return {
    description: template.description,
    details: template.details ?? "",
    icon: template.icon ?? null,
    expiryDays: template.default_expiry_days,
    stock: 12,
    minScore: 0,
    awardRank: rank,
  };
}

export function PrizePicker({
  prizes,
  rewards,
  onChange,
  onCreateReward,
}: {
  prizes: PrizeRow[];
  rewards: RewardTemplate[];
  onChange: (next: PrizeRow[]) => void;
  /** Opens the rewards catalogue, for when there's nothing to pick. */
  onCreateReward?: () => void;
}) {
  // Which place is being filled, or null when nothing is open.
  const [choosing, setChoosing] = useState<number | null>(null);

  const setAt = (index: number, patch: Partial<PrizeRow>) =>
    onChange(prizes.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const choose = (template: RewardTemplate) => {
    if (choosing === null) return;
    const next = [...prizes];
    const rank = choosing + 1;
    const row = fromTemplate(template, rank);
    if (choosing < next.length) {
      // Keep how many weeks they'd already said they could cover.
      next[choosing] = { ...row, stock: next[choosing].stock };
    } else {
      next.push(row);
    }
    onChange(next);
    setChoosing(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {prizes.map((prize, index) => {
        const Icon = rewardIcon(prize.icon);
        return (
          <div
            key={index}
            className="rounded-2xl border border-zinc-200 bg-white p-3"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-center text-lg">
                {RANK_MEDALS[index] ?? index + 1}
              </span>
              <button
                type="button"
                onClick={() => setChoosing(index)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-zinc-50 px-3 py-2.5 text-left transition hover:bg-zinc-100"
              >
                <Icon className="size-4 shrink-0 text-zinc-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-800">
                    {prize.description || "Pick a reward…"}
                  </span>
                  {prize.details && (
                    <span className="block truncate text-xs text-zinc-500">
                      {prize.details}
                    </span>
                  )}
                </span>
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(prizes.filter((_, i) => i !== index))}
                  aria-label={`Remove ${rankLabel(index + 1)}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </div>

            <label className="mt-2 flex items-center gap-2 pl-10">
              <span className="text-xs text-zinc-500">Enough for</span>
              <input
                type="number"
                min={1}
                value={prize.stock}
                onChange={(e) =>
                  setAt(index, { stock: Math.max(1, Number(e.target.value)) })
                }
                className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-sm tabular-nums outline-none focus:border-zinc-400"
              />
              <span className="text-xs text-zinc-500">weeks</span>
            </label>
          </div>
        );
      })}

      {prizes.length < MAX_PODIUM_PLACES && (
        <button
          type="button"
          onClick={() => setChoosing(prizes.length)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 px-3 py-3 text-sm font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
        >
          <Plus className="size-4" aria-hidden />
          Add {rankLabel(prizes.length + 1).toLowerCase()}
        </button>
      )}

      {choosing !== null && (
        <Modal
          title={`What wins ${rankLabel(choosing + 1).toLowerCase()}?`}
          subtitle="From the rewards you've set up."
          icon={<Gift className="size-5 text-zinc-500" aria-hidden />}
          onClose={() => setChoosing(null)}
        >
          {rewards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center">
              <Gift className="mx-auto size-8 text-zinc-300" aria-hidden />
              <p className="mt-3 text-sm text-zinc-500">
                Nothing in your rewards yet. Add one — a free coffee, 10% off,
                anything — and it&apos;ll show up here.
              </p>
              {onCreateReward && (
                <button
                  onClick={() => {
                    setChoosing(null);
                    onCreateReward();
                  }}
                  className="btn-secondary mt-4"
                >
                  <Plus className="size-4" aria-hidden />
                  Add a reward
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {rewards.map((reward) => {
                const Icon = rewardIcon(reward.icon);
                const chosen =
                  prizes[choosing]?.description === reward.description;
                return (
                  <button
                    key={reward.id}
                    type="button"
                    onClick={() => choose(reward)}
                    className={
                      "flex items-start gap-3 rounded-2xl border p-3 text-left transition " +
                      (chosen
                        ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand),transparent_94%)]"
                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50")
                    }
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900">
                        {reward.description}
                      </span>
                      {reward.details && (
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {reward.details}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-zinc-400">
                        Valid {reward.default_expiry_days} days once won
                      </span>
                    </span>
                    {chosen && (
                      <Check
                        className="size-4 shrink-0 text-[var(--brand)]"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {prizes[choosing] && (
            <button
              type="button"
              onClick={() => {
                onChange(prizes.filter((_, i) => i !== choosing));
                setChoosing(null);
              }}
              className="btn-ghost mt-4 text-rose-600"
            >
              <X className="size-4" aria-hidden />
              Leave {rankLabel(choosing + 1).toLowerCase()} empty
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}
