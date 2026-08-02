"use client";

// Editing a game after the fact: the whole configuration — questions, artwork,
// wording, prizes, rules — with the live preview beside it.
//
// Deliberately kept out of the creation flow. Making a game is two steps;
// fiddling with it is something you do later, if you feel like it.

import { useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import {
  GAMES,
  type GameType,
} from "@/lib/games/catalog";
import {
  buildChanceSlots,
  buildRankSlots,
  buildScoreSlots,
  type PrizeRow,
} from "@/lib/games/slots";
import type { GameConfig, GameSummary } from "@/lib/games/types";
import { GameLoop } from "@/components/games/game-loop";
import type { RewardTemplate } from "@/lib/types";
import { GamePreview } from "./game-preview";
import { GameSections } from "./game-sections";

const SEASON_LENGTHS = [
  { value: 7, label: "Every week" },
  { value: 14, label: "Every two weeks" },
  { value: 30, label: "Every month" },
  { value: 1, label: "Every day" },
];

/** Existing prize slots back into the editable rows the builder uses. */
function toPrizeRows(game: GameSummary): PrizeRow[] {
  return game.prizes
    .filter((p) => p.kind === "prize")
    .sort((a, b) => (a.awardRank ?? 99) - (b.awardRank ?? 99))
    .map((p, i) => ({
      description: p.description,
      details: p.details ?? "",
      icon: p.icon,
      expiryDays: p.expiryDays,
      stock: p.stock,
      minScore: p.minScore,
      awardRank: p.awardRank ?? i + 1,
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
  rewards,
  onSaved,
  onCancel,
  onCreateReward,
}: {
  game: GameSummary;
  brandColor: string;
  rewards: RewardTemplate[];
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
  onCreateReward?: () => void;
}) {
  const def = GAMES[game.type as GameType];
  const isBoard = game.awardMode === "leaderboard";
  const [title, setTitle] = useState(game.title);
  const [description, setDescription] = useState(game.description ?? "");
  const [config, setConfig] = useState<GameConfig>(game.config ?? {});
  const [prizes, setPrizes] = useState<PrizeRow[]>(() => toPrizeRows(game));
  const winPercent = inferWinPercent(game);
  const [seasonDays, setSeasonDays] = useState(game.seasonDays);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!def) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    const named = prizes.filter((p) => p.description.trim().length > 0);
    const slots = isBoard
      ? buildRankSlots(named)
      : def.engine === "chance"
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
        seasonDays,
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
              <GameLoop type={def.type} icon={def.icon} swatch={def.swatch} />
              <div className="min-w-0">
                <h2 className="truncate font-bold text-zinc-900">{game.title}</h2>
                <p className="truncate text-sm text-zinc-500">
                  {def.label}
                  {game.status === "draft" ? " · not published yet" : ""}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <GameSections
                def={def}
                title={title}
                description={description}
                config={config}
                prizes={prizes}
                rewards={rewards}
                onTitle={(next) => {
                  setTitle(next);
                  setSaved(false);
                }}
                onDescription={(next) => {
                  setDescription(next);
                  setSaved(false);
                }}
                onConfig={(next) => {
                  setConfig(next);
                  setSaved(false);
                }}
                onPrizes={(next) => {
                  setPrizes(next);
                  setSaved(false);
                }}
                onCreateReward={onCreateReward}
              />

              {isBoard && (
                <label className="card block p-4">
                  <span className="field-label">When do prizes go out?</span>
                  <select
                    value={seasonDays}
                    onChange={(e) => {
                      setSeasonDays(Number(e.target.value));
                      setSaved(false);
                    }}
                    className="input-field"
                  >
                    {SEASON_LENGTHS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Takes effect from the next round — the week that&apos;s
                    already running finishes as it started.
                  </span>
                </label>
              )}

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
