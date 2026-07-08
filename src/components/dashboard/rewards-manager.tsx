"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Gift, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  REWARD_EXPIRY_DAYS_DEFAULT,
  REWARD_EXPIRY_DAYS_MAX,
  REWARD_EXPIRY_DAYS_MIN,
  REWARD_ICON_SLUGS,
} from "@/lib/constants";
import { REWARD_ICON_COMPONENTS, rewardIcon } from "@/lib/reward-icons";
import type { RewardTemplate } from "@/lib/types";

interface DraftState {
  id: string | null; // null = creating
  description: string;
  details: string;
  icon: string;
  defaultExpiryDays: number;
}

const EMPTY: DraftState = {
  id: null,
  description: "",
  details: "",
  icon: "gift",
  defaultExpiryDays: REWARD_EXPIRY_DAYS_DEFAULT,
};

// Build → Rewards: the merchant's reusable reward catalogue. Rewards are
// created here first, then picked when building a grid.
export function RewardsManager({ onChanged }: { onChanged?: () => void }) {
  const [rewards, setRewards] = useState<RewardTemplate[] | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRewards = useCallback(async (): Promise<RewardTemplate[]> => {
    const res = await fetch("/api/merchant/reward-templates");
    const body = res.ok ? await res.json() : { rewards: [] };
    return (body?.rewards as RewardTemplate[]) ?? [];
  }, []);

  const reload = useCallback(async () => {
    setRewards(await fetchRewards());
  }, [fetchRewards]);

  useEffect(() => {
    let ignore = false;
    fetchRewards().then((r) => {
      if (!ignore) setRewards(r);
    });
    return () => {
      ignore = true;
    };
  }, [fetchRewards]);

  async function save() {
    if (!draft) return;
    // Validate client-side so a filled-in form never trips the generic error.
    if (!draft.description.trim()) {
      setError("Give your reward a name.");
      return;
    }
    if (
      !Number.isInteger(draft.defaultExpiryDays) ||
      draft.defaultExpiryDays < REWARD_EXPIRY_DAYS_MIN ||
      draft.defaultExpiryDays > REWARD_EXPIRY_DAYS_MAX
    ) {
      setError(
        `Validity must be a whole number of days between ${REWARD_EXPIRY_DAYS_MIN} and ${REWARD_EXPIRY_DAYS_MAX}.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/reward-templates", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draft.id ?? undefined,
        description: draft.description,
        details: draft.details,
        icon: draft.icon,
        defaultExpiryDays: draft.defaultExpiryDays,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // A 500 here almost always means the reward_templates table is missing —
      // i.e. the latest DB migrations haven't been applied yet.
      setError(
        res.status >= 500 || body?.error === "internal"
          ? "Couldn't save — your database is missing the rewards table. Apply the latest migrations (supabase/migrations, incl. 0009), then try again."
          : "Every reward needs a description and a validity of 1–60 days."
      );
      return;
    }
    setDraft(null);
    await reload();
    onChanged?.();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this reward from your catalogue?")) return;
    await fetch("/api/merchant/reward-templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await reload();
    onChanged?.();
  }

  return (
    <div className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
            <Gift className="size-5 text-emerald-600" aria-hidden />
            Rewards
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Create your rewards here, then assign them when you build a grid.
          </p>
        </div>
        {draft === null && (
          <button
            onClick={() => setDraft({ ...EMPTY })}
            className="btn-primary px-4 py-2 text-sm"
          >
            <Plus className="size-4" aria-hidden />
            New reward
          </button>
        )}
      </div>

      {draft !== null && (
        <div className="mt-4 rounded-xl border border-zinc-200 p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block grow">
              <span className="field-label">Reward</span>
              <input
                autoFocus
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Free plate of jollof rice"
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="field-label">Valid for (days)</span>
              <input
                type="number"
                min={REWARD_EXPIRY_DAYS_MIN}
                max={REWARD_EXPIRY_DAYS_MAX}
                value={Number.isNaN(draft.defaultExpiryDays) ? "" : draft.defaultExpiryDays}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    defaultExpiryDays:
                      e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
                className="input-field w-24"
              />
            </label>
          </div>
          <label className="mt-2 block">
            <span className="field-label">Description (optional)</span>
            <input
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              maxLength={300}
              placeholder="Any details customers should know — size, terms, how to claim…"
              className="input-field"
            />
          </label>
          <div className="mt-3">
            <span className="field-label">Icon</span>
            <p className="text-xs text-zinc-500">
              Customers see this next to the reward on your board.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REWARD_ICON_SLUGS.map((slug) => {
                const Icon = REWARD_ICON_COMPONENTS[slug];
                const selected = draft.icon === slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    title={slug}
                    aria-label={`Icon: ${slug}`}
                    aria-pressed={selected}
                    onClick={() => setDraft({ ...draft, icon: slug })}
                    className={
                      "flex size-9 items-center justify-center rounded-lg border transition " +
                      (selected
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600")
                    }
                  >
                    <Icon className="size-4.5" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="alert-error mt-3">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={busy} className="btn-primary px-4 py-2 text-sm">
              {busy ? (
                "Saving…"
              ) : (
                <>
                  <Check className="size-4" aria-hidden />
                  {draft.id ? "Save reward" : "Add reward"}
                </>
              )}
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="btn-secondary px-4 py-2 text-sm"
            >
              <X className="size-4" aria-hidden />
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {rewards === null ? (
          <p className="animate-pulse text-sm text-zinc-400">Loading rewards…</p>
        ) : rewards.length === 0 ? (
          draft === null && (
            <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center">
              <Gift className="mx-auto size-8 text-zinc-300" aria-hidden />
              <p className="mt-3 text-sm text-zinc-500">
                No rewards yet. Create one to start building grids.
              </p>
            </div>
          )
        ) : (
          <ul className="space-y-2">
            {rewards.map((r) => {
              const Icon = rewardIcon(r.icon);
              return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-zinc-200 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">
                      {r.description}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Valid {r.default_expiry_days} day
                      {r.default_expiry_days === 1 ? "" : "s"}
                      {r.details ? ` · ${r.details}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setDraft({
                        id: r.id,
                        description: r.description,
                        details: r.details ?? "",
                        icon: r.icon ?? "gift",
                        defaultExpiryDays: r.default_expiry_days,
                      })
                    }
                    className="btn-ghost"
                    aria-label={`Edit ${r.description}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="btn-ghost text-rose-600 hover:bg-rose-50"
                    aria-label={`Delete ${r.description}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
