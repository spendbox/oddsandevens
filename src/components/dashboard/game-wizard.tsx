"use client";

// The game builder. Five short steps, every one of them pre-filled: a business
// that just picks a game and hits "Create" gets a working, branded, shareable
// game with sensible odds and one prize.

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import {
  GAMES,
  GAME_CATEGORIES,
  GAME_TIER_LIMITS,
  type GameCategory,
  type GameDefinition,
  type GameType,
} from "@/lib/games/catalog";
import type { GameConfig, PrizeDraft } from "@/lib/games/types";
import type { RewardTemplate } from "@/lib/types";
import type { SubscriptionTier } from "@/lib/constants";
import { GameIcon } from "@/components/games/icons";
import { GameConfigEditor } from "./game-config-editor";

type Step = "gallery" | "name" | "setup" | "prizes" | "done";

interface PrizeRow {
  description: string;
  details: string;
  icon: string | null;
  expiryDays: number;
  stock: number;
  minScore: number;
}

const BLANK_LABELS = [
  "Not this time",
  "So close!",
  "Try again tomorrow",
  "Better luck next time",
];

// Turns the merchant's "how often should someone win?" percentage into the
// weights the draw actually uses: every real prize carries the same weight,
// and blank segments soak up the rest.
function buildChanceSlots(prizes: PrizeRow[], winPercent: number): PrizeDraft[] {
  const realWeight = 100;
  const totalPrizeWeight = realWeight * prizes.length;
  const chance = Math.min(Math.max(winPercent, 1), 100) / 100;
  const blankTotal = Math.round((totalPrizeWeight * (1 - chance)) / chance);
  // A wheel reads best with 6-ish segments, and alternating blanks look fair.
  const blankCount =
    blankTotal <= 0 ? 0 : Math.max(2, Math.min(6 - prizes.length, 4));

  const slots: PrizeDraft[] = [];
  const perBlank = blankCount > 0 ? Math.round(blankTotal / blankCount) : 0;

  // Interleave prizes and blanks so neighbouring wheel segments differ.
  const blanks: PrizeDraft[] = Array.from({ length: blankCount }, (_, i) => ({
    kind: "blank" as const,
    description: BLANK_LABELS[i % BLANK_LABELS.length],
    weight: Math.max(perBlank, 1),
    stock: 0,
  }));

  const maxLength = Math.max(prizes.length, blanks.length);
  for (let i = 0; i < maxLength; i++) {
    if (i < prizes.length) {
      slots.push({
        kind: "prize",
        description: prizes[i].description,
        details: prizes[i].details || null,
        icon: prizes[i].icon,
        expiry_days: prizes[i].expiryDays,
        stock: prizes[i].stock,
        weight: realWeight,
        min_score: 0,
      });
    }
    if (i < blanks.length) slots.push(blanks[i]);
  }
  return slots;
}

function buildScoreSlots(prizes: PrizeRow[]): PrizeDraft[] {
  return prizes.map((prize) => ({
    kind: "prize" as const,
    description: prize.description,
    details: prize.details || null,
    icon: prize.icon,
    expiry_days: prize.expiryDays,
    stock: prize.stock,
    weight: 1,
    min_score: prize.minScore,
  }));
}

export function GameWizard({
  tier,
  rewardTemplates,
  onDone,
  onCancel,
}: {
  tier: SubscriptionTier;
  rewardTemplates: RewardTemplate[];
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("gallery");
  const [category, setCategory] = useState<GameCategory>("instant-win");
  const [type, setType] = useState<GameType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [config, setConfig] = useState<GameConfig>({});
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [winPercent, setWinPercent] = useState(25);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [maxWins, setMaxWins] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const def: GameDefinition | null = type ? GAMES[type] : null;
  const maxPrizes = GAME_TIER_LIMITS[tier].maxPrizes;

  const gallery = useMemo(
    () =>
      GAME_CATEGORIES.map((c) => ({
        ...c,
        games: Object.values(GAMES).filter((g) => g.category === c.key),
      })),
    []
  );

  const choose = (chosen: GameDefinition) => {
    setType(chosen.type);
    setTitle(chosen.label);
    setDescription(chosen.tagline);
    setConfig({ ...chosen.defaultConfig });
    setCooldownHours(chosen.cooldownHours);
    // Start from the merchant's own reward catalogue when they have one.
    const first = rewardTemplates[0];
    setPrizes([
      {
        description: first?.description ?? "10% off your next order",
        details: first?.details ?? "",
        icon: first?.icon ?? null,
        expiryDays: first?.default_expiry_days ?? 30,
        stock: 25,
        minScore: chosen.defaultTarget,
      },
    ]);
    setStep("name");
  };

  const addPrize = () => {
    if (prizes.length >= maxPrizes) return;
    const template = rewardTemplates[prizes.length];
    setPrizes([
      ...prizes,
      {
        description: template?.description ?? "",
        details: template?.details ?? "",
        icon: template?.icon ?? null,
        expiryDays: template?.default_expiry_days ?? 30,
        stock: 10,
        minScore: (def?.defaultTarget ?? 0) * (prizes.length + 1),
      },
    ]);
  };

  const updatePrize = (index: number, patch: Partial<PrizeRow>) => {
    setPrizes(prizes.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const create = async () => {
    if (!def) return;
    const named = prizes.filter((p) => p.description.trim().length > 0);
    if (def.engine === "chance" && named.length === 0) {
      setError("Add at least one prize — a wheel needs something to win.");
      return;
    }

    setBusy(true);
    setError(null);
    const slots =
      def.engine === "chance"
        ? buildChanceSlots(named, winPercent)
        : buildScoreSlots(named);

    const res = await fetch("/api/merchant/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: def.type,
        title: title.trim() || def.label,
        description: description.trim(),
        config,
        prizes: slots,
        cooldownHours,
        maxWinsPerPlayer: maxWins,
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);

    if (!res.ok || !body?.ok) {
      setError(
        body?.error === "too_many_games"
          ? "You've hit your plan's game limit. Upgrade or archive one first."
          : body?.error === "too_many_prizes"
            ? `Your plan allows up to ${maxPrizes} prizes per game.`
            : "We couldn't create that game. Check the details and try again."
      );
      return;
    }

    setShareUrl(`${window.location.origin}${body.url}`);
    setStep("done");
  };

  // ---- Step: gallery ------------------------------------------------------
  if (step === "gallery") {
    return (
      <section className="mt-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">
              Pick a game to brand
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Every game is yours in a minute: name it, set a prize, share the
              link.
            </p>
          </div>
          <button onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        </header>

        <nav className="mt-4 flex flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
          {gallery.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={
                "cursor-pointer rounded-xl px-3 py-1.5 text-sm font-medium transition " +
                (category === c.key
                  ? "text-white"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800")
              }
              style={
                category === c.key
                  ? { backgroundColor: "var(--brand)" }
                  : undefined
              }
            >
              {c.label}
            </button>
          ))}
        </nav>

        <p className="mt-3 text-sm text-zinc-500">
          {gallery.find((c) => c.key === category)?.blurb}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gallery
            .find((c) => c.key === category)!
            .games.map((game) => (
              <button
                key={game.type}
                onClick={() => choose(game)}
                className="card group cursor-pointer p-4 text-left transition hover:-translate-y-1 hover:shadow-md"
              >
                <span
                  className="flex size-11 items-center justify-center rounded-xl text-white"
                  style={{
                    background: `linear-gradient(140deg, ${game.swatch[0]}, ${game.swatch[1]})`,
                  }}
                >
                  <GameIcon icon={game.icon} className="size-5" />
                </span>
                <h3 className="mt-3 font-semibold text-zinc-900">
                  {game.label}
                </h3>
                <p className="mt-0.5 text-sm text-zinc-500">{game.tagline}</p>
                <p className="mt-2 text-xs font-medium text-zinc-400">
                  {game.engine === "chance"
                    ? "Instant draw"
                    : game.hasLeaderboard
                      ? "Score + leaderboard"
                      : "Everyone who finishes"}
                </p>
              </button>
            ))}
        </div>
      </section>
    );
  }

  if (!def) return null;

  // ---- Step: done ---------------------------------------------------------
  if (step === "done" && shareUrl) {
    return (
      <section className="mt-6">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Check className="size-7" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-bold text-zinc-900">
            {title} is live
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Share this link anywhere — WhatsApp status, Instagram bio, a QR code
            on the counter.
          </p>

          <div className="mt-5 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
            <code className="min-w-0 flex-1 truncate px-2 text-left text-sm text-zinc-700">
              {shareUrl}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="btn-secondary text-sm"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex-1"
            >
              Preview it
            </a>
            <button
              onClick={() => void onDone()}
              className="btn-primary flex-1"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Back to my games
            </button>
          </div>
        </div>
      </section>
    );
  }

  const stepIndex = step === "name" ? 1 : step === "setup" ? 2 : 3;

  return (
    <section className="mt-6">
      <header className="flex items-start justify-between gap-3">
        <button
          onClick={() =>
            setStep(step === "name" ? "gallery" : step === "setup" ? "name" : "setup")
          }
          className="btn-ghost"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Step {stepIndex} of 3
        </span>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </header>

      <div className="card mx-auto mt-4 max-w-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{
              background: `linear-gradient(140deg, ${def.swatch[0]}, ${def.swatch[1]})`,
            }}
          >
            <GameIcon icon={def.icon} className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-bold text-zinc-900">{def.label}</h2>
            <p className="truncate text-sm text-zinc-500">{def.tagline}</p>
          </div>
        </div>

        {/* ---- Step: name ---- */}
        {step === "name" && (
          <div className="mt-5 flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-zinc-600">{def.blurb}</p>
            <label className="block">
              <span className="field-label">What players will see</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className="input-field"
                placeholder={def.label}
              />
            </label>
            <label className="block">
              <span className="field-label">One line about it (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                rows={2}
                className="input-field resize-y"
              />
            </label>
            <button
              onClick={() => setStep("setup")}
              className="btn-primary"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Next: set it up
            </button>
          </div>
        )}

        {/* ---- Step: setup ---- */}
        {step === "setup" && (
          <div className="mt-5 flex flex-col gap-4">
            <p className="text-sm text-zinc-500">
              These are all pre-filled — change what you care about and move on.
            </p>
            <GameConfigEditor
              fields={def.fields}
              config={config}
              onChange={setConfig}
            />
            <button
              onClick={() => setStep("prizes")}
              className="btn-primary"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Next: prizes
            </button>
          </div>
        )}

        {/* ---- Step: prizes ---- */}
        {step === "prizes" && (
          <div className="mt-5 flex flex-col gap-4">
            <div>
              <p className="section-title">Prizes</p>
              <p className="mt-1 text-xs text-zinc-500">
                {def.engine === "chance"
                  ? "Winners are drawn on our servers — the browser never sees the odds."
                  : `A player wins the best prize whose target they beat (${def.scoreLabel}).`}
              </p>
            </div>

            {prizes.map((prize, index) => (
              <div
                key={index}
                className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Prize {index + 1}
                  </span>
                  {prizes.length > 1 && (
                    <button
                      onClick={() =>
                        setPrizes(prizes.filter((_, i) => i !== index))
                      }
                      className="btn-ghost px-2 text-xs text-zinc-400 hover:text-rose-600"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className="block">
                  <span className="field-label">What they win</span>
                  <input
                    value={prize.description}
                    onChange={(e) =>
                      updatePrize(index, { description: e.target.value })
                    }
                    maxLength={200}
                    placeholder="Free coffee with any pastry"
                    className="input-field"
                    list="game-reward-suggestions"
                  />
                </label>

                <label className="mt-2 block">
                  <span className="field-label">Small print (optional)</span>
                  <input
                    value={prize.details}
                    onChange={(e) =>
                      updatePrize(index, { details: e.target.value })
                    }
                    maxLength={300}
                    placeholder="Dine-in only, one per customer"
                    className="input-field"
                  />
                </label>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="field-label">How many to give away</span>
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={prize.stock}
                      onChange={(e) =>
                        updatePrize(index, { stock: Number(e.target.value) })
                      }
                      className="input-field"
                    />
                  </label>
                  {def.winRule === "target" ? (
                    <label className="block">
                      <span className="field-label">
                        Score to beat ({def.scoreLabel})
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={prize.minScore}
                        onChange={(e) =>
                          updatePrize(index, { minScore: Number(e.target.value) })
                        }
                        className="input-field"
                      />
                    </label>
                  ) : (
                    <label className="block">
                      <span className="field-label">Code valid for (days)</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={prize.expiryDays}
                        onChange={(e) =>
                          updatePrize(index, {
                            expiryDays: Number(e.target.value),
                          })
                        }
                        className="input-field"
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}

            <datalist id="game-reward-suggestions">
              {rewardTemplates.map((template) => (
                <option key={template.id} value={template.description} />
              ))}
            </datalist>

            {prizes.length < maxPrizes && (
              <button onClick={addPrize} className="btn-secondary self-start text-sm">
                Add another prize
              </button>
            )}

            {def.engine === "chance" && (
              <label className="block rounded-xl border border-zinc-200 p-3">
                <span className="field-label">
                  How often should someone win? ({winPercent}%)
                </span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={winPercent}
                  onChange={(e) => setWinPercent(Number(e.target.value))}
                  className="w-full accent-[var(--brand)]"
                />
                <span className="text-xs text-zinc-500">
                  Roughly {winPercent} in 100 plays land on a prize. The rest see
                  a &ldquo;not this time&rdquo; segment — and still earn a
                  loyalty point.
                </span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="field-label">Replay cooldown (hours)</span>
                <input
                  type="number"
                  min={0}
                  max={720}
                  value={cooldownHours}
                  onChange={(e) => setCooldownHours(Number(e.target.value))}
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="field-label">Max wins per player</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxWins}
                  onChange={(e) => setMaxWins(Number(e.target.value))}
                  className="input-field"
                />
              </label>
            </div>

            {error && <p className="alert-error">{error}</p>}

            <button
              onClick={create}
              disabled={busy}
              className="btn-primary"
              style={{ backgroundColor: "var(--brand)" }}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden />
                  Create &amp; get my link
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
