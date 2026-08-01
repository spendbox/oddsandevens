"use client";

// The merchant's games list: what each one has done, its share link, and the
// controls to pause, edit the basics, or retire it.

import { useState } from "react";
import {
  Copy,
  ExternalLink,
  Gamepad2,
  Pause,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { GAME_TIER_LIMITS, gameDef } from "@/lib/games/catalog";
import type { GameSummary } from "@/lib/games/types";
import type { SubscriptionTier } from "@/lib/constants";
import { GameIcon } from "@/components/games/icons";

/**
 * Home-tab strip: how the games are doing, and a nudge to launch the first one.
 * The shareable link itself lives in the link card right below.
 */
export function GamesHighlight({
  games,
  onNewGame,
  onManage,
}: {
  games: GameSummary[];
  onNewGame: () => void;
  onManage: () => void;
}) {
  const live = games.filter((g) => g.status === "active");

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            <Gamepad2 className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-zinc-900">Branded games</h2>
            <p className="text-sm text-zinc-500">
              {live.length === 0
                ? "Launch a wheel, a scratch card, a quiz — 20 to choose from."
                : `${live.length} live · ${games.reduce(
                    (sum, g) => sum + g.playsCount,
                    0
                  )} plays · ${games.reduce((sum, g) => sum + g.winsCount, 0)} prizes won`}
            </p>
          </div>
        </div>
        <button
          onClick={live.length === 0 ? onNewGame : onManage}
          className="btn-primary"
          style={{ backgroundColor: "var(--brand)" }}
        >
          {live.length === 0 ? (
            <>
              <Plus className="size-4" aria-hidden />
              Create a game
            </>
          ) : (
            "Manage games"
          )}
        </button>
      </div>

    </section>
  );
}

export function GamesManager({
  games,
  tier,
  merchantSlug,
  onNewGame,
  onChanged,
}: {
  games: GameSummary[];
  tier: SubscriptionTier;
  merchantSlug: string;
  onNewGame: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const maxGames = GAME_TIER_LIMITS[tier].maxGames;
  const atLimit = games.length >= maxGames;

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    await fetch(`/api/merchant/games/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    await onChanged();
  };

  const remove = async (id: string) => {
    setBusyId(id);
    await fetch(`/api/merchant/games/${id}`, { method: "DELETE" });
    setBusyId(null);
    setConfirmId(null);
    await onChanged();
  };

  const copyLink = async (game: GameSummary) => {
    const url = `${window.location.origin}/p/${merchantSlug}/${game.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(game.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard blocked — the link is visible on the card anyway.
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Your games</h2>
          <p className="text-sm text-zinc-500">
            {games.length === 0
              ? "No games yet — pick one and share it in a minute."
              : `${games.length} game${games.length === 1 ? "" : "s"}${
                  Number.isFinite(maxGames) ? ` of ${maxGames}` : ""
                }. Each one has its own link.`}
          </p>
        </div>
        <button
          onClick={onNewGame}
          disabled={atLimit}
          className="btn-primary"
          style={{ backgroundColor: "var(--brand)" }}
          title={atLimit ? "Upgrade to run more games" : undefined}
        >
          <Plus className="size-4" aria-hidden />
          New game
        </button>
      </header>

      {atLimit && (
        <p className="alert-error">
          You&apos;re running the maximum number of games on your plan. Upgrade
          to Premium for unlimited games, or retire one first.
        </p>
      )}

      {games.length === 0 ? (
        <button
          onClick={onNewGame}
          className="card flex cursor-pointer flex-col items-center gap-3 p-10 text-center transition hover:shadow-md"
        >
          <span
            className="flex size-14 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            <Gamepad2 className="size-7" aria-hidden />
          </span>
          <span className="font-semibold text-zinc-900">
            Launch your first branded game
          </span>
          <span className="max-w-sm text-sm text-zinc-500">
            A spin-to-win wheel, a scratch card, a quiz, an arcade high-score
            chase — twenty to choose from, all branded to you.
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {games.map((game) => {
            const def = gameDef(game.type);
            const url = `/p/${merchantSlug}/${game.slug}`;
            const prizeStock = game.prizes
              .filter((p) => p.kind === "prize")
              .reduce(
                (acc, p) => ({
                  left: acc.left + Math.max(p.stock - p.claimed, 0),
                  total: acc.total + p.stock,
                }),
                { left: 0, total: 0 }
              );

            return (
              <article key={game.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{
                      background: def
                        ? `linear-gradient(140deg, ${def.swatch[0]}, ${def.swatch[1]})`
                        : "var(--brand)",
                    }}
                  >
                    <GameIcon icon={def?.icon ?? "gamepad-2"} className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-zinc-900">
                        {game.title}
                      </h3>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (game.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500")
                        }
                      >
                        {game.status === "active" ? "Live" : "Paused"}
                      </span>
                    </div>
                    <p className="truncate text-sm text-zinc-500">
                      {def?.label ?? game.type}
                      {game.description ? ` · ${game.description}` : ""}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Plays", value: game.playsCount },
                    { label: "Players", value: game.players },
                    { label: "Prizes won", value: game.winsCount },
                    { label: "Redeemed", value: game.redeemedCount },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-zinc-50 px-3 py-2">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        {stat.label}
                      </dt>
                      <dd className="text-lg font-bold tabular-nums text-zinc-900">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {prizeStock.total > 0 && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {prizeStock.left} of {prizeStock.total} prize
                    {prizeStock.total === 1 ? "" : "s"} still available
                    {prizeStock.left === 0 && " — top up the stock to keep it winnable"}
                    .
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                    {url}
                  </code>
                  <button
                    onClick={() => copyLink(game)}
                    className="btn-secondary text-sm"
                  >
                    <Copy className="size-4" aria-hidden />
                    {copiedId === game.id ? "Copied!" : "Copy link"}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-sm"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    Open
                  </a>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      patch(game.id, {
                        status: game.status === "active" ? "paused" : "active",
                      })
                    }
                    disabled={busyId === game.id}
                    className="btn-ghost"
                  >
                    {game.status === "active" ? (
                      <>
                        <Pause className="size-4" aria-hidden />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-4" aria-hidden />
                        Resume
                      </>
                    )}
                  </button>

                  {confirmId === game.id ? (
                    <>
                      <span className="text-sm text-zinc-600">
                        {game.playsCount > 0
                          ? "Retire this game? Codes already won stay valid."
                          : "Delete this game?"}
                      </span>
                      <button
                        onClick={() => remove(game.id)}
                        disabled={busyId === game.id}
                        className="btn-ghost text-rose-600 hover:bg-rose-50"
                      >
                        Yes, remove
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="btn-ghost"
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(game.id)}
                      className="btn-ghost text-zinc-400 hover:text-rose-600"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Remove
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
