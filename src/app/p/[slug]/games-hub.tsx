"use client";

// One link that shows everything a business has running — and, more to the
// point, who is winning it.
//
// The hub used to be a menu of games. It is now a wall of leaderboards: each
// game shows the top of this week's board, the clock until the prizes go out,
// and where the player themselves stands. Busiest boards sit at the top,
// because a competition with people in it is the reason to tap.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Heart, Loader2, Share2, Trophy, Users, Zap } from "lucide-react";
import { GameLoop } from "@/components/games/game-loop";
import { RANK_MEDALS, gameDef, themeAccent } from "@/lib/games/catalog";
import { useCountdown } from "@/lib/games/use-countdown";
import type { PublicGamesHub } from "@/lib/games/types";

type HubGame = PublicGamesHub["games"][number];

export default function GamesHub({ slug }: { slug: string }) {
  const [hub, setHub] = useState<PublicGamesHub | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [topup, setTopup] = useState<{
    amountKobo: number;
    lives: number;
    paymentsEnabled: boolean;
  } | null>(null);
  const [buying, setBuying] = useState(false);
  const [bought, setBought] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/play/${encodeURIComponent(slug)}/games`);
    return res.ok ? ((await res.json()) as PublicGamesHub) : null;
  }, [slug]);

  useEffect(() => {
    let ignore = false;
    load().then((body) => {
      if (ignore) return;
      if (!body) setNotFound(true);
      else setHub(body);
    });
    return () => {
      ignore = true;
    };
  }, [load]);

  // Paystack sends the player back here when they bought from this page. The
  // credit is idempotent server-side, so a reload can't double it — but the
  // reference is cleared from the URL anyway so a reload doesn't look like a
  // second payment.
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("life_ref");
    if (!reference) return;
    window.history.replaceState(null, "", window.location.pathname);
    let ignore = false;
    fetch(`/api/play/${encodeURIComponent(slug)}/lives/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (body) => {
        if (ignore || body?.result !== "credited") return;
        setBought(Number(body.lives ?? 0));
        const fresh = await load();
        if (!ignore && fresh) setHub(fresh);
      });
    return () => {
      ignore = true;
    };
  }, [slug, load]);

  // What a block of extra plays costs here. Loaded alongside the hub so the
  // offer can sit next to the plays counter rather than hiding inside a game.
  useEffect(() => {
    let ignore = false;
    fetch(`/api/play/${encodeURIComponent(slug)}/lives`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!ignore && body) setTopup(body);
      });
    return () => {
      ignore = true;
    };
  }, [slug]);

  /** Straight to Paystack; the game page verifies the reference on the way back. */
  const buyLives = useCallback(async () => {
    setBuying(true);
    const res = await fetch(
      `/api/play/${encodeURIComponent(slug)}/lives`,
      { method: "POST" }
    );
    const body = await res.json().catch(() => null);
    if (res.ok && body?.authorizationUrl) {
      window.location.href = body.authorizationUrl;
      return;
    }
    setBuying(false);
  }, [slug]);

  const share = useCallback(async () => {
    const url = `${window.location.origin}/p/${slug}`;
    const text = hub
      ? `Free games and prizes from ${hub.host.businessName}. Get on the leaderboard.`
      : "Play and win";
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: hub?.host.businessName, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Cancelled or blocked — nothing to do.
    }
  }, [hub, slug]);

  if (notFound) {
    return (
      <main className="arcade flex min-h-screen items-center justify-center p-6 text-center text-white/60">
        We couldn&apos;t find that business.
      </main>
    );
  }

  if (!hub) {
    return (
      <main className="arcade flex min-h-screen items-center justify-center">
        <span className="animate-pulse text-4xl">🎮</span>
      </main>
    );
  }

  const brand = hub.host.brandColor || "#059669";
  const lives = hub.player?.livesLeft ?? null;

  return (
    <main
      className="arcade min-h-screen p-4 pb-16 sm:p-6"
      style={{ "--brand": brand } as React.CSSProperties}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        <header className="flex flex-col items-center gap-3 pt-6 text-center">
          {hub.host.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hub.host.logoUrl}
              alt=""
              className="size-16 rounded-2xl object-cover shadow-sm"
            />
          ) : (
            <span
              className="flex size-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm"
              style={{ backgroundColor: brand }}
            >
              {hub.host.businessName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="arcade-title text-3xl">{hub.host.businessName}</h1>
            {hub.host.tagline && (
              <p className="mt-0.5 text-sm text-white/50">{hub.host.tagline}</p>
            )}
          </div>
        </header>

        {/* Lives are one pool for the whole business, so they belong here
            rather than on any single game. */}
        {lives !== null && (
          <div className="arcade-panel flex items-center gap-3 p-4">
            <span className="emoji text-xl">
              {"❤️".repeat(Math.min(lives, 6)) || "💔"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">
                {lives > 0
                  ? `${lives} ${lives === 1 ? "play" : "plays"} left this week`
                  : "No plays left this week"}
              </p>
              <p className="text-xs text-white/50">
                Shared across every game here — sharing earns more.
              </p>
            </div>
            <button
              onClick={share}
              className="btn-play-ghost shrink-0 text-sm"
            >
              <Share2 className="size-4" aria-hidden />
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        )}

        {bought !== null && (
          <p className="arcade-panel p-3 text-center text-sm font-bold text-white">
            +{bought} plays added to this week. Good luck.
          </p>
        )}

        {/* Buying plays belongs beside the counter that says you have none,
            not three taps deep inside whichever game you happened to open. */}
        {lives !== null && topup?.paymentsEnabled && (
          <button
            onClick={buyLives}
            disabled={buying}
            className="arcade-panel flex w-full items-center gap-3 p-4 text-left transition active:scale-[0.99] disabled:opacity-60"
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${brand}33` }}
            >
              {buying ? (
                <Loader2 className="size-5 animate-spin text-white" aria-hidden />
              ) : (
                <Zap className="size-5" style={{ color: brand }} aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">
                {lives > 0
                  ? `Want more? ${topup.lives} extra plays this week`
                  : `Get ${topup.lives} more plays this week`}
              </span>
              <span className="block text-xs text-white/50">
                ₦{(topup.amountKobo / 100).toLocaleString("en-NG")} — optional.
                The free plays are enough to reach the top.
              </span>
            </span>
          </button>
        )}

        {hub.games.length === 0 ? (
          <p className="arcade-panel p-8 text-center text-sm text-white/50">
            No games running right now — check back soon.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {hub.games.map((game) => (
              <GameCard key={game.slug} slug={slug} game={game} brand={brand} />
            ))}
          </div>
        )}

        <Link
          href="/me"
          className="text-center text-xs text-white/35 hover:text-white/70"
        >
          See everything you&apos;ve won
        </Link>
      </div>
    </main>
  );
}

function GameCard({
  slug,
  game,
  brand,
}: {
  slug: string;
  game: HubGame;
  brand: string;
}) {
  const def = gameDef(game.type);
  const accent = themeAccent(game.theme, brand);
  const left = useCountdown(game.season?.endsAt ?? null);

  return (
    <Link
      href={`/p/${slug}/${game.slug}`}
      className="arcade-panel group block p-4 transition hover:-translate-y-0.5 hover:brightness-110"
    >
      <div className="flex items-center gap-4">
        <GameLoop
          type={game.type}
          icon={def?.icon ?? "gamepad-2"}
          swatch={def?.swatch}
          className="size-12 rounded-xl"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-white">
            {game.title}
          </span>
          <span className="block truncate text-sm text-white/45">
            {game.description || def?.tagline || "Tap to play"}
          </span>
        </span>
        <span
          className="shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-white"
          style={{
            backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${accent}, white 18%), ${accent})`,
            boxShadow: `0 4px 0 color-mix(in oklab, ${accent}, black 42%)`,
          }}
        >
          {game.yourRank ? "Defend" : "▶ Play"}
        </span>
      </div>

      {game.prizeTeasers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {game.prizeTeasers.map((teaser, i) => (
            <span
              key={i}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/70"
            >
              {teaser}
            </span>
          ))}
        </div>
      )}

      {/* This week's board */}
      {game.season && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
            <span className="flex items-center gap-1">
              <Trophy className="size-3" aria-hidden /> This week
            </span>
            <span className="flex items-center gap-2 normal-case tracking-normal">
              <span className="flex items-center gap-1">
                <Users className="size-3" aria-hidden />
                {game.playerCount}
              </span>
              {left && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  {left}
                </span>
              )}
            </span>
          </div>

          {game.leaderboard.length === 0 ? (
            <p className="mt-2 text-xs text-white/45">
              Empty board — first score takes first place.
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-1">
              {game.leaderboard.map((row) => (
                <li
                  key={row.rank}
                  className={
                    "flex items-center gap-2 rounded-lg px-2 py-1 text-xs " +
                    (row.isYou ? "bg-white/15 font-bold text-white" : "")
                  }
                >
                  <span className="emoji w-5 shrink-0 text-center">
                    {RANK_MEDALS[row.rank - 1] ?? row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-white/60">
                    {row.isYou ? "You" : row.maskedEmail}
                  </span>
                  {row.prize && (
                    <span className="hidden max-w-28 truncate text-white/40 sm:block">
                      {row.prize}
                    </span>
                  )}
                  <span className="shrink-0 font-bold tabular-nums text-white">
                    {row.score}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {game.yourRank && game.yourRank > game.leaderboard.length && (
            <p className="mt-2 flex items-center gap-1 text-xs text-white/50">
              <Heart className="size-3" aria-hidden />
              You&apos;re #{game.yourRank} with {game.yourBest}.
            </p>
          )}
        </div>
      )}
    </Link>
  );
}
