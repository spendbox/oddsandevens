"use client";

// Editing a game after the fact: the whole configuration — questions, artwork,
// wording, prizes, rules — with the live preview beside it.
//
// Deliberately kept out of the creation flow. Making a game is two steps;
// fiddling with it is something you do later, if you feel like it.

import { useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { GAMES, type GameType } from "@/lib/games/catalog";
import { buildChanceSlots, buildScoreSlots, type PrizeRow } from "@/lib/games/slots";
import type { GameConfig, GameSummary } from "@/lib/games/types";
import { GameIcon } from "@/components/games/icons";
import { GameConfigEditor } from "./game-config-editor";
import { GamePreview } from "./game-preview";

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

/** Existing prize slots back into the editable rows the builder uses. */
function toPrizeRows(game: GameSummary): PrizeRow[] {
  const real = game.prizes.filter((p) => p.kind === "prize");
  return real.map((p) => ({
    description: p.description,
    details: p.details ?? "",
    icon: p.icon,
    expiryDays: p.expiryDays,
    stock: p.stock,
    minScore: p.minScore,
  }));
}

/** Recover the win chance a chance game was built with, for the slider. */
function inferWinPercent(game: GameSummary): number {
  const total = game.prizes.reduce((sum, p) => sum + p.weight, 0);
  const winning = game.prizes
    .filter((p) => p.kind === "prize")
    .reduce((sum, p) => sum + p.weight, 0);
  if (total === 0) return 25;
  return Math.min(Math.max(Math.round((winning / total) * 100), 1), 100);
}

export function GameEditor({
  game,
  brandColor,
  onSaved,
  onCancel,
}: {
  game: GameSummary;
  brandColor: string;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const def = GAMES[game.type as GameType];
  const [title, setTitle] = useState(game.title);
  const [description, setDescription] = useState(game.description ?? "");
  const [config, setConfig] = useState<GameConfig>(game.config ?? {});
  const [prizes, setPrizes] = useState<PrizeRow[]>(() => toPrizeRows(game));
  const [winPercent, setWinPercent] = useState(() => inferWinPercent(game));
  const [cooldownHours, setCooldownHours] = useState(game.cooldownHours);
  const [maxWins, setMaxWins] = useState(game.maxWinsPerPlayer);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!def) return null;

  const updatePrize = (index: number, patch: Partial<PrizeRow>) => {
    setPrizes(prizes.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const named = prizes.filter((p) => p.description.trim().length > 0);
    const slots =
      def.engine === "chance"
        ? buildChanceSlots(named, winPercent)
        : buildScoreSlots(named);

    const res = await fetch(`/api/merchant/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || def.label,
        description: description.trim(),
        config,
        prizes: slots,
        cooldownHours,
        maxWinsPerPlayer: maxWins,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "too_many_prizes"
          ? "Your plan allows fewer prizes than that."
          : "We couldn't save those changes. Try again."
      );
      return;
    }
    setSaved(true);
    await onSaved();
  };

  return (
    <section className="mt-6">
      <header className="flex items-start justify-between gap-3">
        <button onClick={onCancel} className="btn-ghost">
          <ArrowLeft className="size-4" aria-hidden />
          Back to my games
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Editing
        </span>
      </header>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="order-2 lg:order-1">
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
                <h2 className="truncate font-bold text-zinc-900">{game.title}</h2>
                <p className="truncate text-sm text-zinc-500">
                  {def.label}
                  {game.status === "draft" ? " · not published yet" : ""}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <label className="block">
                <span className="field-label">What players will see</span>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSaved(false);
                  }}
                  maxLength={80}
                  className="input-field"
                />
              </label>

              <label className="block">
                <span className="field-label">One line about it</span>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setSaved(false);
                  }}
                  maxLength={300}
                  rows={2}
                  className="input-field resize-y"
                />
              </label>

              <div>
                <p className="section-title">The game itself</p>
                <p className="mt-1 mb-3 text-xs text-zinc-500">
                  Questions, artwork, difficulty — the preview updates as you type.
                </p>
                <GameConfigEditor
                  fields={def.fields}
                  config={config}
                  onChange={(next) => {
                    setConfig(next);
                    setSaved(false);
                  }}
                />
              </div>

              <div>
                <p className="section-title">Prizes</p>
                {game.prizes.some((p) => p.claimed > 0) && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Some of these have already been won. You can raise the
                    numbers, but not below what&apos;s gone out.
                  </p>
                )}
              </div>

              {prizes.map((prize, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
                >
                  <input
                    value={prize.description}
                    onChange={(e) =>
                      updatePrize(index, { description: e.target.value })
                    }
                    maxLength={200}
                    className="input-field"
                  />
                  <input
                    value={prize.details}
                    onChange={(e) => updatePrize(index, { details: e.target.value })}
                    maxLength={300}
                    placeholder="Small print (optional)"
                    className="input-field mt-2"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="field-label">How many</span>
                      <input
                        type="number"
                        min={1}
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
                          Score needed ({def.scoreLabel})
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
                        <span className="field-label">Valid for (days)</span>
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

              <button
                onClick={() =>
                  setPrizes([
                    ...prizes,
                    {
                      description: "",
                      details: "",
                      icon: null,
                      expiryDays: 30,
                      stock: 10,
                      minScore: def.defaultTarget,
                    },
                  ])
                }
                className="btn-secondary self-start text-sm"
              >
                Add another prize
              </button>

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
                    onChange={(e) => {
                      setWinPercent(Number(e.target.value));
                      setSaved(false);
                    }}
                    className="w-full accent-[var(--brand)]"
                  />
                </label>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">How often can one person play?</span>
                  <select
                    value={cooldownHours}
                    onChange={(e) => {
                      setCooldownHours(Number(e.target.value));
                      setSaved(false);
                    }}
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
                    onChange={(e) => {
                      setMaxWins(Number(e.target.value));
                      setSaved(false);
                    }}
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
                onClick={save}
                disabled={busy}
                className="btn-primary"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : saved ? (
                  <>
                    <Check className="size-4" aria-hidden />
                    Saved
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </div>
        </div>

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
    </section>
  );
}
