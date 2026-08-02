"use client";

// The business knowledge base: a mostly-tappable questionnaire whose answers
// are what we build games out of.
//
// Nothing here is required and nothing is long-form. The progress bar moves as
// you tap — it's computed locally, not fetched — and each unanswered row says
// what answering it would buy, so filling it in never feels like paperwork.

import { useMemo, useState } from "react";
import { Check, ChevronDown, Gift, Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import {
  DAYS,
  GOALS,
  INDUSTRIES,
  TONES,
  completionItems,
  completionPercent,
  industryPack,
  type BusinessProfile,
} from "@/lib/business/profile";
import {
  REWARD_EXPIRY_DAYS_DEFAULT,
  REWARD_EXPIRY_DAYS_MAX,
  REWARD_EXPIRY_DAYS_MIN,
} from "@/lib/constants";
import { rewardIcon } from "@/lib/reward-icons";
import type { RewardTemplate } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import type { Merchant } from "./shared";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition " +
        (active
          ? "border-transparent text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50")
      }
      style={active ? { backgroundColor: "var(--brand)" } : undefined}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

/** Three short inputs with one-tap example fills. */
function ListField({
  label,
  help,
  values,
  examples,
  slots,
  placeholder,
  onChange,
}: {
  label: string;
  help: string;
  values: string[];
  examples: string[];
  slots: number;
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const rows = Array.from({ length: slots }, (_, i) => values[i] ?? "");
  const set = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next.filter((v, i) => v.trim().length > 0 || i < rows.length));
  };
  const addExample = (example: string) => {
    const firstEmpty = rows.findIndex((r) => r.trim().length === 0);
    if (firstEmpty < 0) return;
    set(firstEmpty, example);
  };
  const unused = examples.filter((e) => !rows.includes(e));

  return (
    <div>
      <span className="field-label">{label}</span>
      <p className="-mt-1 mb-2 text-xs text-zinc-500">{help}</p>
      <div className="flex flex-col gap-2">
        {rows.map((value, i) => (
          <input
            key={i}
            value={value}
            onChange={(e) => set(i, e.target.value)}
            placeholder={i === 0 ? placeholder : "…"}
            maxLength={80}
            className="input-field"
          />
        ))}
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unused.slice(0, 4).map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => addExample(example)}
              className="rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-xs text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
            >
              + {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "What could you give away?" — chosen from the reward catalogue, never typed.
 *
 * A giveaway typed in here used to become a prize on a published game while
 * existing only as a sentence in a profile: no expiry, no stock, nothing at the
 * counter to redeem against. Picking from the catalogue means every prize a
 * game hands out is a reward the business has actually defined — and if the
 * catalogue is empty, one gets created right here rather than sending them off
 * to another tab.
 */
function OfferPicker({
  rewards,
  chosen,
  onChange,
  onCreated,
}: {
  rewards: RewardTemplate[];
  chosen: string[];
  onChange: (next: string[]) => void;
  onCreated: () => void | Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [expiry, setExpiry] = useState(REWARD_EXPIRY_DAYS_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (value: string) => {
    onChange(
      chosen.includes(value)
        ? chosen.filter((v) => v !== value)
        : [...chosen, value]
    );
  };

  const create = async () => {
    const value = description.trim();
    if (value.length < 1) {
      setError("Give the reward a name customers will recognise.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/reward-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: value,
        details: details.trim(),
        icon: "gift",
        defaultExpiryDays: expiry,
      }),
    });
    if (!res.ok) {
      setBusy(false);
      setError("We couldn't save that reward. Try again.");
      return;
    }
    setBusy(false);
    setCreating(false);
    setDescription("");
    setDetails("");
    // Chosen straight away — creating it here means they want to give it away.
    onChange([...chosen.filter((c) => c !== value), value]);
    await onCreated();
  };

  return (
    <div>
      <span className="field-label">What could you give away?</span>
      <p className="-mt-1 mb-2 text-xs text-zinc-500">
        Pick from your reward catalogue — these become the prizes, already
        filled in when you publish a game.
      </p>

      {rewards.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center">
          <Gift className="mx-auto size-5 text-zinc-400" aria-hidden />
          <p className="mt-2 text-sm text-zinc-600">
            Your catalogue is empty. Add one reward and we can fill in the
            prizes on every game we write for you.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-secondary mt-3 text-sm"
          >
            <Plus className="size-4" aria-hidden />
            Create a reward
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rewards.map((reward) => {
            const active = chosen.includes(reward.description);
            const Icon = rewardIcon(reward.icon);
            return (
              <button
                key={reward.id}
                type="button"
                onClick={() => toggle(reward.description)}
                aria-pressed={active}
                className={
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition " +
                  (active
                    ? "border-transparent text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50")
                }
                style={active ? { backgroundColor: "var(--brand)" } : undefined}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="max-w-48 truncate">{reward.description}</span>
                {active && <Check className="size-3.5 shrink-0" aria-hidden />}
              </button>
            );
          })}
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
            >
              <Plus className="size-4" aria-hidden />
              New reward
            </button>
          )}
        </div>
      )}

      {/* The popup: the whole reward, without leaving the page. */}
      {creating && (
        <Modal
          title="New reward"
          subtitle="It goes in your catalogue, so you can use it on any game."
          width="sm"
          onClose={() => setCreating(false)}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={create}
                disabled={busy}
                className="btn-primary flex-1"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Add to catalogue"
                )}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          }
        >
          <label className="block">
            <span className="field-label">What the customer gets</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              placeholder="Free coffee with any pastry"
              className="input-field"
            />
          </label>

          <label className="mt-3 block">
            <span className="field-label">Any conditions (optional)</span>
            <input
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={300}
              placeholder="One per customer, dine-in only"
              className="input-field"
            />
          </label>

          <label className="mt-3 block">
            <span className="field-label">Valid for (days)</span>
            <input
              type="number"
              value={expiry}
              min={REWARD_EXPIRY_DAYS_MIN}
              max={REWARD_EXPIRY_DAYS_MAX}
              onChange={(event) => setExpiry(Number(event.target.value))}
              className="input-field"
            />
          </label>

          {error && <p className="alert-error mt-3">{error}</p>}
        </Modal>
      )}
    </div>
  );
}

export function BusinessProfileCard({
  merchant,
  profile,
  rewards,
  hasReward,
  hasGame,
  onRewardsChanged,
  onSaved,
}: {
  merchant: Merchant;
  profile: BusinessProfile;
  /** The reward catalogue — the only source of giveaways. */
  rewards: RewardTemplate[];
  hasReward: boolean;
  hasGame: boolean;
  /** Reload the catalogue after one is created here. */
  onRewardsChanged: () => void | Promise<void>;
  /** Called after saving; `created` is how many games we wrote from the answers. */
  onSaved: (created: number) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<BusinessProfile>(profile);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pack = industryPack(draft.industry);

  // Computed from the draft, so the bar moves the moment a chip is tapped.
  const items = useMemo(
    () => completionItems(draft, merchant, { hasReward, hasGame }),
    [draft, merchant, hasReward, hasGame]
  );
  const percent = completionPercent(items);
  const nextUp = items.filter((i) => !i.done).slice(0, 3);

  const patch = (change: Partial<BusinessProfile>) => {
    setDraft((current) => ({ ...current, ...change }));
    setSaved(false);
  };

  const toggleGoal = (key: string) => {
    const goals = draft.goals ?? [];
    patch({
      goals: goals.includes(key)
        ? goals.filter((g) => g !== key)
        : [...goals, key],
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/knowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      setBusy(false);
      setError("We couldn't save that. Try again.");
      return;
    }

    // Saving is also the trigger to write games from the new answers.
    let created = 0;
    if (draft.industry) {
      const suggest = await fetch("/api/merchant/games/suggest", {
        method: "POST",
      });
      const body = await suggest.json().catch(() => null);
      created = Number(body?.created ?? 0);
    }

    setBusy(false);
    setSaved(true);
    await onSaved(created);
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">
            <Sparkles className="size-3.5" aria-hidden /> About your business
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tell us a little and we&apos;ll write the games for you. Tap, don&apos;t
            type, wherever you can.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-zinc-900">
            {percent}%
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            complete
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, backgroundColor: "var(--brand)" }}
        />
      </div>

      {nextUp.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {nextUp.map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-xs text-zinc-500">
              <span className="mt-0.5 size-3.5 shrink-0 rounded-full border border-dashed border-zinc-300" />
              <span>
                <span className="font-medium text-zinc-700">{item.label}</span> —{" "}
                {item.unlocks}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* --- The questions --------------------------------------------- */}
      <div className="mt-6 flex flex-col gap-6">
        <div>
          <span className="field-label">What kind of business is it?</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {INDUSTRIES.map((industry) => (
              <Chip
                key={industry.key}
                active={draft.industry === industry.key}
                onClick={() => patch({ industry: industry.key })}
              >
                {industry.emoji} {industry.label}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">What do you want games to do for you?</span>
          <p className="-mt-1 mb-2 text-xs text-zinc-500">
            Pick as many as apply — it changes which games we write.
          </p>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((goal) => (
              <Chip
                key={goal.key}
                active={(draft.goals ?? []).includes(goal.key)}
                onClick={() => toggleGoal(goal.key)}
              >
                {goal.emoji} {goal.label}
              </Chip>
            ))}
          </div>
        </div>

        <ListField
          label="Your top three sellers"
          help="These become quiz answers, poll contenders, and the items in your arcade games."
          values={draft.sells ?? []}
          examples={pack.sellsExamples}
          slots={3}
          placeholder={pack.sellsExamples[0]}
          onChange={(sells) => patch({ sells })}
        />

        <OfferPicker
          rewards={rewards}
          chosen={(draft.offers ?? []).filter((offer) =>
            rewards.some((r) => r.description === offer)
          )}
          onChange={(offers) => patch({ offers })}
          onCreated={onRewardsChanged}
        />

        {/* Everything below is genuinely optional. */}
        <div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="btn-ghost -ml-3"
          >
            <ChevronDown
              className={"size-4 transition " + (expanded ? "rotate-180" : "")}
              aria-hidden
            />
            {expanded ? "Fewer details" : "Add a few more details (optional)"}
          </button>

          {expanded && (
            <div className="mt-3 flex flex-col gap-5">
              <div>
                <span className="field-label">How do you like to sound?</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TONES.map((tone) => (
                    <Chip
                      key={tone.key}
                      active={draft.tone === tone.key}
                      onClick={() => patch({ tone: tone.key })}
                    >
                      {tone.emoji} {tone.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="field-label">Who are your customers?</span>
                <input
                  value={draft.audience ?? ""}
                  onChange={(e) => patch({ audience: e.target.value })}
                  maxLength={160}
                  placeholder="Office workers on their lunch break"
                  className="input-field"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Which city?</span>
                  <input
                    value={draft.city ?? ""}
                    onChange={(e) => patch({ city: e.target.value })}
                    maxLength={60}
                    placeholder="Lagos"
                    className="input-field"
                  />
                </label>
                <label className="block">
                  <span className="field-label">Busiest day</span>
                  <select
                    value={draft.busiestDay ?? ""}
                    onChange={(e) => patch({ busiestDay: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Not sure</option>
                    {DAYS.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="field-label">
                  One true thing about you that customers wouldn&apos;t guess
                </span>
                <input
                  value={draft.funFact ?? ""}
                  onChange={(e) => patch({ funFact: e.target.value })}
                  maxLength={200}
                  placeholder="We've used the same jollof recipe since 2016"
                  className="input-field"
                />
                <span className="mt-1 block text-xs text-zinc-500">
                  It becomes a trivia question only your regulars can answer.
                </span>
              </label>
            </div>
          )}
        </div>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="btn-primary"
          style={{ backgroundColor: "var(--brand)" }}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Building your games…
            </>
          ) : saved ? (
            <>
              <Check className="size-4" aria-hidden />
              Saved
            </>
          ) : (
            <>
              <Wand2 className="size-4" aria-hidden />
              Save &amp; build my games
            </>
          )}
        </button>
        {!draft.industry && (
          <span className="text-xs text-zinc-500">
            Pick a business type and we can write your first games right away.
          </span>
        )}
      </div>
    </section>
  );
}
