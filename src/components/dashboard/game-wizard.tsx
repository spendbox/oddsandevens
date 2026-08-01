"use client";

// The game builder. Pick a game, name it, tweak it, set a prize — with the
// real game playing alongside the whole time, so nothing has to be imagined.
//
// Every field arrives pre-filled: a business that picks a game and presses
// "Create" straight away still gets a working, branded, shareable game.

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
import { buildChanceSlots, buildScoreSlots, type PrizeRow } from "@/lib/games/slots";
import type { GameConfig } from "@/lib/games/types";
import type { RewardTemplate } from "@/lib/types";
import type { SubscriptionTier } from "@/lib/constants";
import { GameIcon } from "@/components/games/icons";
import { GameConfigEditor } from "./game-config-editor";
import { GamePreview } from "./game-preview";

type Step = "gallery" | "name" | "setup" | "prizes" | "done";

// Replay limits in the words a shop owner would use, not hours.
const PLAY_FREQUENCY = [
  { value: 0, label: "As often as they like" },
  { value: 6, label: "A few times a day" },
  { value: 12, label: "Twice a day" },
  { value: 24, label: "Once a day" },
  { value: 168, label: "Once a week" },
];

const WIN_LIMIT = [
  { value: 1, label: "One prize, then they're done" },
  { value: 2, label: "Up to two prizes" },
  { value: 3, label: "Up to three prizes" },
  { value: 100, label: "As many as they can win" },
];

export function GameWizard({
  tier,
  brandColor,
  rewardTemplates,
  onDone,
  onCancel,
}: {
  tier: SubscriptionTier;
  /** The business's brand colour — the preview paints the game with it. */
  brandColor: string;
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
    // Start from the business's own reward catalogue when they have one.
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
          ? "You've hit your plan's game limit. Upgrade or retire one first."
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
              Choose one and you&apos;ll be playing your own version of it in a
              few seconds — then share the link.
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
                    ? "Instant win"
                    : game.hasLeaderboard
                      ? "Play for a high score"
                      : "Everyone who finishes wins"}
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
              Open it
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
  const showPreview = step === "setup" || step === "prizes";

  const form = (
    <div className="card p-5 sm:p-6">
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
            Next: make it yours
          </button>
        </div>
      )}

      {/* ---- Step: setup ---- */}
      {step === "setup" && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="text-sm text-zinc-500">
            Change anything here and the preview updates as you type. Or change
            nothing — it already works.
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
            <p className="section-title">What can they win?</p>
            <p className="mt-1 text-xs text-zinc-500">
              {def.engine === "chance"
                ? "Winners are drawn on our servers, so nobody can rig it from their phone."
                : `They win the best prize they earn — play the preview to see what a real score looks like.`}
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
                  <span className="field-label">How many can you give away?</span>
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
                      Score they need ({def.scoreLabel})
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
                About {winPercent} in every 100 plays lands on a prize. The rest
                see a &ldquo;not this time&rdquo; and still earn a loyalty point.
                Play the preview a few times to feel it.
              </span>
            </label>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">How often can one person play?</span>
              <select
                value={cooldownHours}
                onChange={(e) => setCooldownHours(Number(e.target.value))}
                className="input-field"
              >
                {PLAY_FREQUENCY.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">
                How many prizes can one person win?
              </span>
              <select
                value={maxWins}
                onChange={(e) => setMaxWins(Number(e.target.value))}
                className="input-field"
              >
                {WIN_LIMIT.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
  );

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

      {showPreview ? (
        // Preview first on a phone (see what you're making), beside the form
        // and sticky on a wide screen.
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="order-2 lg:order-1">{form}</div>
          <div className="order-1 lg:order-2 lg:sticky lg:top-6">
            <GamePreview
              def={def}
              config={config}
              prizes={prizes}
              winPercent={winPercent}
              accent={brandColor || "#059669"}
            />
          </div>
        </div>
      ) : (
        <div className="mx-auto mt-4 max-w-2xl">{form}</div>
      )}
    </section>
  );
}
