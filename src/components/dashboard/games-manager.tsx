"use client";

// The merchant's games: the ones we wrote for them waiting to be published, and
// the ones that are live, with what each has done and its share link.

import { useState } from "react";
import {
  Coins,
  Copy,
  Crown,
  ExternalLink,
  Gamepad2,
  Pause,
  Pencil,
  Play,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { GAME_TIER_LIMITS, GAMES, gameDef, type GameType } from "@/lib/games/catalog";
import type { PrizeRow } from "@/lib/games/slots";
import type { GameSummary } from "@/lib/games/types";
import type { SubscriptionTier } from "@/lib/constants";
import { GameLoop } from "@/components/games/game-loop";
import { GamePreview } from "./game-preview";
import { naira } from "./shared";
import { GameLeaderboard } from "./game-leaderboard";
import { Modal } from "@/components/ui/modal";

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
  const drafts = games.filter((g) => g.status === "draft");

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
            <h2 className="font-bold text-zinc-900">Your games</h2>
            <p className="text-sm text-zinc-500">
              {live.length === 0 && drafts.length > 0
                ? `${drafts.length} ready and waiting for you to publish.`
                : live.length === 0
                  ? "Tell us about your business and we'll write your first games."
                  : `${live.length} live · ${games.reduce(
                      (sum, g) => sum + g.playsCount,
                      0
                    )} plays · ${games.reduce((sum, g) => sum + g.winsCount, 0)} prizes won`}
            </p>
          </div>
        </div>
        <button
          onClick={live.length === 0 && drafts.length === 0 ? onNewGame : onManage}
          className="btn-primary"
          style={{ backgroundColor: "var(--brand)" }}
        >
          {live.length === 0 && drafts.length === 0 ? (
            <>
              <Plus className="size-4" aria-hidden />
              Create a game
            </>
          ) : drafts.length > 0 && live.length === 0 ? (
            <>
              <Rocket className="size-4" aria-hidden />
              Review &amp; publish
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
  brandColor,
  onNewGame,
  onEditGame,
  onChanged,
  onUpgrade,
  onSetUpPayouts,
}: {
  games: GameSummary[];
  tier: SubscriptionTier;
  merchantSlug: string;
  brandColor: string;
  onNewGame: () => void;
  onEditGame: (game: GameSummary) => void;
  onChanged: () => void | Promise<void>;
  /** Opens the Plans tab. Absent when there's nowhere to upgrade to. */
  onUpgrade?: () => void;
  /** Opens Settings → Getting paid, for when publishing is blocked on it. */
  onSetUpPayouts?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<GameSummary | null>(null);
  const [boardFor, setBoardFor] = useState<GameSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const drafts = games.filter((g) => g.status === "draft");
  // Published and shared first, busiest of those at the top: the games with
  // customers in them are the ones worth looking at. Paused ones sink, drafts
  // sit below the lot.
  const liveOrPaused = games
    .filter((g) => g.status !== "draft")
    .slice()
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        b.playsCount - a.playsCount ||
        b.players - a.players
    );
  const maxGames = GAME_TIER_LIMITS[tier].maxGames;
  const atLimit = liveOrPaused.length >= maxGames;

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

  const publish = async (game: GameSummary) => {
    setBusyId(game.id);
    setNotice(null);
    const res = await fetch(`/api/merchant/games/${game.id}/publish`, {
      method: "POST",
    });
    const body = await res.json().catch(() => null);
    setBusyId(null);
    if (!res.ok || !body?.ok) {
      setNotice(
        body?.error === "no_payout_account"
          ? "Add your bank account first — that's where your share of anything players buy goes. It's under Settings → Getting paid."
          : body?.error === "too_many_games"
            ? "That would put you over your plan's live-game limit — pause one first, or upgrade."
            : "We couldn't publish that game. Try again."
      );
      if (body?.error === "no_payout_account") onSetUpPayouts?.();
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${body.url}`);
      setCopiedId(game.id);
      window.setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Clipboard blocked — the link is on the card either way.
    }
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
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Your games</h2>
          <p className="text-sm text-zinc-500">
            {games.length === 0
              ? "No games yet — pick one and share it in a minute."
              : `${liveOrPaused.length} published${
                  Number.isFinite(maxGames) ? ` of ${maxGames}` : ""
                }${drafts.length > 0 ? ` · ${drafts.length} ready to publish` : ""}`}
          </p>
        </div>
        <button
          onClick={onNewGame}
          className="btn-primary"
          style={{ backgroundColor: "var(--brand)" }}
        >
          <Plus className="size-4" aria-hidden />
          New game
        </button>
      </header>

      {notice && <p className="alert-error">{notice}</p>}

      {/* --- Published and shared: what customers can play right now ------- */}
      {liveOrPaused.length === 0 && drafts.length === 0 ? (
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
            Fill in a little about your business under Settings and we&apos;ll
            write a few for you — or pick one yourself.
          </span>
        </button>
      ) : (
        liveOrPaused.length > 0 && (
          <div className="flex flex-col gap-3">
            {drafts.length > 0 && <p className="section-title">Published</p>}
            {atLimit && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  {maxGames === 1
                    ? "You can run one game at a time on the free plan. Pause this one to swap in another, or upgrade and run as many as you like."
                    : "You're at your plan's limit for live games. Pause one to swap it out, or upgrade and run as many as you like."}
                </p>
                {onUpgrade && (
                  <button onClick={onUpgrade} className="btn-primary mt-3 bg-amber-500">
                    <Crown className="size-4" aria-hidden />
                    See Premium
                  </button>
                )}
              </div>
            )}

            {liveOrPaused.map((game) => {
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
                    <GameLoop
                      type={game.type}
                      icon={def?.icon ?? "gamepad-2"}
                      swatch={def?.swatch}
                    />

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

                  {/* How the game is doing, and what it has paid — both on
                      the card, because a business checking one always wants
                      the other. */}
                  <div className="mt-3 overflow-hidden rounded-xl border border-zinc-100">
                    <dl className="grid grid-cols-3 divide-x divide-zinc-100 bg-zinc-50">
                      {[
                        { label: "Plays", value: game.playsCount },
                        { label: "Players", value: game.players },
                        { label: "Prizes won", value: game.winsCount },
                      ].map((stat) => (
                        <div key={stat.label} className="px-3 py-2">
                          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            {stat.label}
                          </dt>
                          <dd className="text-lg font-bold tabular-nums text-zinc-900">
                            {stat.value.toLocaleString()}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex items-center gap-2.5 border-t border-zinc-100 px-3 py-2.5">
                      <Coins
                        className={
                          "size-4 shrink-0 " +
                          (game.earnedKobo > 0
                            ? "text-emerald-600"
                            : "text-zinc-300")
                        }
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 text-sm text-zinc-500">
                        Earned from extra plays
                        {game.blocksSold > 0 && (
                          <span className="text-zinc-400">
                            {" "}
                            · {game.blocksSold.toLocaleString()} bought
                          </span>
                        )}
                      </span>
                      <span
                        className={
                          "shrink-0 text-base font-bold tabular-nums " +
                          (game.earnedKobo > 0
                            ? "text-emerald-700"
                            : "text-zinc-400")
                        }
                      >
                        {naira(game.earnedKobo)}
                      </span>
                    </div>
                  </div>

                  {prizeStock.total > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {prizeStock.left} of {prizeStock.total} prize
                      {prizeStock.total === 1 ? "" : "s"} still available
                      {prizeStock.left === 0 &&
                        " — top up the stock to keep it winnable"}
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
                      onClick={() => setBoardFor(game)}
                      className="btn-ghost"
                    >
                      <Trophy className="size-4" aria-hidden />
                      Leaderboard
                    </button>
                    <button
                      onClick={() => onEditGame(game)}
                      className="btn-ghost"
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </button>
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
        )
      )}

      {/* --- Ready for you: drafts we wrote, not yet shared ----------------- */}
      {drafts.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="section-title">
              <Sparkles className="size-3.5" aria-hidden /> Ready for you
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Built from what you told us about your business. Have a play, change
              anything you like, then publish the ones you want.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {drafts.map((game) => {
              const def = gameDef(game.type);
              const prize = game.prizes.find((p) => p.kind === "prize");
              return (
                <article key={game.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <GameLoop
                      type={game.type}
                      icon={def?.icon ?? "gamepad-2"}
                      swatch={def?.swatch}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-zinc-900">
                        {game.title}
                      </h3>
                      <p className="truncate text-sm text-zinc-500">
                        {def?.label ?? game.type}
                      </p>
                      {prize && (
                        <p className="mt-1 truncate text-xs text-zinc-400">
                          Prize: {prize.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setPreviewing(game)}
                      className="btn-secondary text-sm"
                    >
                      <Play className="size-4" aria-hidden />
                      Try it
                    </button>
                    <button
                      onClick={() => onEditGame(game)}
                      className="btn-secondary text-sm"
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </button>
                    <button
                      onClick={() => publish(game)}
                      disabled={busyId === game.id}
                      className="btn-primary text-sm"
                      style={{ backgroundColor: "var(--brand)" }}
                    >
                      <Rocket className="size-4" aria-hidden />
                      {copiedId === game.id ? "Link copied!" : "Publish & share"}
                    </button>
                    <button
                      onClick={() => remove(game.id)}
                      disabled={busyId === game.id}
                      className="btn-ghost text-sm text-zinc-400 hover:text-rose-600"
                    >
                      Not for me
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {previewing && (
        <DraftPreview
          game={previewing}
          brandColor={brandColor}
          onClose={() => setPreviewing(null)}
        />
      )}

      {boardFor && (
        <GameLeaderboard
          gameId={boardFor.id}
          onClose={() => setBoardFor(null)}
        />
      )}
    </section>
  );
}

/** "Try it" on a draft: the real game, in a modal, without publishing it. */
function DraftPreview({
  game,
  brandColor,
  onClose,
}: {
  game: GameSummary;
  brandColor: string;
  onClose: () => void;
}) {
  const def = GAMES[game.type as GameType];
  if (!def) return null;

  const prizes: PrizeRow[] = game.prizes
    .filter((p) => p.kind === "prize")
    .map((p) => ({
      description: p.description,
      details: p.details ?? "",
      icon: p.icon,
      expiryDays: p.expiryDays,
      stock: p.stock,
      minScore: p.minScore,
    }));

  const total = game.prizes.reduce((sum, p) => sum + p.weight, 0);
  const winning = game.prizes
    .filter((p) => p.kind === "prize")
    .reduce((sum, p) => sum + p.weight, 0);
  const winPercent =
    total > 0 ? Math.min(Math.max(Math.round((winning / total) * 100), 1), 100) : 25;

  return (
    <Modal
      title={<span className="truncate">{game.title}</span>}
      subtitle="Preview — nothing here issues a real code."
      onClose={onClose}
    >
      <GamePreview
        def={def}
        config={game.config}
        prizes={prizes}
        winPercent={winPercent}
        accent={brandColor || "#059669"}
      />
    </Modal>
  );
}
