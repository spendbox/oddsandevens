"use client";

// The branded game shell.
//
// A game is a weekly competition: play as often as your lives allow, get your
// best run onto the public board, and the top places take the prizes when the
// week closes. This owns everything around the game itself — the business's
// branding, the email gate, lives, the board, the countdown, and the share
// link that earns another life.
//
// It is drawn as an arcade cabinet rather than a page: dark, lit by the
// business's colour, numbers in pills, one enormous button. Anything that
// could be a medal, a heart or a clock is one — the reading matters more than
// the sentence, and a player mid-run has no time for a sentence anyway. While
// a round is running everything except the playfield gets out of the way.
//
// The game components only play and report a score.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Copy, Share2, X } from "lucide-react";
import { GameRenderer } from "@/components/games";
import { GameIcon } from "@/components/games/icons";
import { EMAIL_STORAGE_KEY, VerifyModal } from "@/components/games/verify-modal";
import { RANK_MEDALS, gameDef, rankLabel, themeAccent } from "@/lib/games/catalog";
import { useCountdown } from "@/lib/games/use-countdown";
import type {
  GameOutcome,
  LeaderboardEntry,
  PublicGame,
  PublicGameHost,
} from "@/lib/games/types";

interface PlayerState {
  /** The verified address behind the cookie — the server tells us who we are. */
  email: string;
  livesLeft: number;
  bestScore: number;
  rank: number | null;
  shareCode: string | null;
  nextPlayAt: string | null;
}

type Phase = "loading" | "intro" | "playing" | "result";

export default function GamePlayer({
  slug,
  gameSlug,
}: {
  slug: string;
  gameSlug: string;
}) {
  const [host, setHost] = useState<PublicGameHost | null>(null);
  const [game, setGame] = useState<PublicGame | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState<"code" | "share" | null>(null);
  const [lifeEarned, setLifeEarned] = useState(false);

  const def = game ? gameDef(game.type) : null;
  const accent = themeAccent(game?.theme, host?.brandColor ?? "#059669");
  const isBoard = game?.awardMode === "leaderboard";
  const seasonLeft = useCountdown(game?.season?.endsAt ?? null);
  const cooldownLeft = useCountdown(
    outcome?.nextPlayAt ?? player?.nextPlayAt ?? null
  );

  // Someone else's share code, if this page was opened from their link.
  const [referral] = useState(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("ref");
    return code ? code.trim().toUpperCase() : null;
  });

  // The server knows who is playing from the verification cookie, so this is
  // just "what's happening" — no address to send, nothing to re-prove. The
  // remembered address is only ever a prefill for the verify form.
  const fetchGame = useCallback(async () => {
    let known: string | null = null;
    try {
      known = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    } catch {
      // Private mode or blocked storage: the player just types it again.
    }
    const res = await fetch(
      `/api/play/${encodeURIComponent(slug)}/games/${encodeURIComponent(
        gameSlug
      )}`
    );
    const body = await res.json().catch(() => null);
    return { ok: res.ok, body, known };
  }, [slug, gameSlug]);

  const apply = useCallback(
    (result: {
      ok: boolean;
      body: { host?: unknown; game?: unknown; player?: unknown; error?: string } | null;
      known: string | null;
    }) => {
      if (result.known) setEmail((current) => current ?? result.known);
      if (!result.ok) {
        setError(
          result.body?.error === "game_paused"
            ? "This game is paused right now — check back soon."
            : "We couldn't find that game."
        );
        setPhase((current) => (current === "loading" ? "intro" : current));
        return;
      }
      setHost(result.body?.host as PublicGameHost);
      setGame(result.body?.game as PublicGame);
      const who = (result.body?.player as PlayerState | null) ?? null;
      setPlayer(who);
      // A signed-in player is one the cookie identified; that beats anything
      // the browser happens to have written down.
      if (who?.email) setEmail(who.email);
      setPhase((current) => (current === "loading" ? "intro" : current));
    },
    []
  );

  const load = useCallback(async () => {
    apply(await fetchGame());
  }, [fetchGame, apply]);

  // A round owns the device: no page scrolling behind the playfield, and no
  // rubber-banding on iOS while a finger is dragging a basket around.
  useEffect(() => {
    if (phase !== "playing") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  useEffect(() => {
    let ignore = false;
    fetchGame().then((result) => {
      if (!ignore) apply(result);
    });
    return () => {
      ignore = true;
    };
  }, [fetchGame, apply]);

  const startPlay = async () => {
    setStarting(true);
    setError(null);
    const res = await fetch(
      `/api/play/${encodeURIComponent(slug)}/games/${encodeURIComponent(
        gameSlug
      )}/start`,
      { method: "POST" }
    );
    const body = await res.json().catch(() => null);
    setStarting(false);

    if (body?.result === "started") {
      setToken(body.token as string);
      setOutcome(null);
      setPhase("playing");
      return;
    }
    if (body?.result === "no_lives") {
      setError("You're out of lives for today. Share your link for another, or come back tomorrow.");
      void load();
      return;
    }
    if (body?.result === "cooldown") {
      setPlayer((current) => ({
        email: current?.email ?? "",
        livesLeft: current?.livesLeft ?? 0,
        bestScore: current?.bestScore ?? 0,
        rank: current?.rank ?? null,
        shareCode: current?.shareCode ?? null,
        nextPlayAt: body.nextPlayAt as string,
      }));
      setError("You've already played — come back when the timer is up.");
      return;
    }
    if (body?.result === "no_plays") {
      setError("This business has paused their games for now. Check back a little later.");
      return;
    }
    if (body?.error === "email_not_verified") {
      setShowVerify(true);
      return;
    }
    setError("Something went wrong starting your game. Try again.");
  };

  const submit = useCallback(
    async (score: number, meta?: Record<string, unknown>) => {
      if (!token) return null;
      const res = await fetch(
        `/api/play/${encodeURIComponent(slug)}/games/${encodeURIComponent(
          gameSlug
        )}/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, score, meta: meta ?? {} }),
        }
      );
      const body = await res.json().catch(() => null);
      if (!body || body.result === "error") {
        setError("We couldn't save that round. Try again.");
        return null;
      }
      if (body.result === "no_plays") {
        setError("This business has run out of plays for now.");
        return null;
      }
      const result = body as GameOutcome;
      setOutcome(result);
      setToken(null);

      // Playing a round is what pays the person who invited you.
      if (referral) {
        fetch(
          `/api/play/${encodeURIComponent(slug)}/games/${encodeURIComponent(
            gameSlug
          )}/refer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: referral }),
          }
        ).catch(() => {});
      }
      return result;
    },
    [token, slug, gameSlug, referral]
  );

  const showResult = useCallback(() => {
    setPhase("result");
    void load();
  }, [load]);

  const shareUrl =
    player?.shareCode && typeof window !== "undefined"
      ? `${window.location.origin}/p/${slug}/${gameSlug}?ref=${player.shareCode}`
      : null;

  const share = async () => {
    if (!shareUrl || !game) return;
    const text = `I'm ${
      player?.rank ? `#${player.rank}` : "playing"
    } on ${game.title} at ${host?.businessName}. Beat me and win — you get a free go through my link.`;
    // The share sheet where there is one, the clipboard everywhere else.
    const canShare =
      typeof navigator !== "undefined" && typeof navigator.share === "function";
    try {
      if (canShare) {
        await navigator.share({ title: game.title, text, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied("share");
        window.setTimeout(() => setCopied(null), 2000);
      }
      setLifeEarned(true);
    } catch {
      // Cancelled or blocked — nothing to do.
    }
  };

  if (phase === "loading" && !game) {
    return (
      <main className="arcade flex min-h-screen items-center justify-center">
        <span className="animate-pulse text-4xl">🎮</span>
      </main>
    );
  }

  if (!game || !host) {
    return (
      <main className="arcade flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="emoji text-5xl">🕹️</span>
        <p className="text-white/70">{error ?? "Game not found."}</p>
        <Link href={`/p/${slug}`} className="btn-play-ghost">
          All games
        </Link>
      </main>
    );
  }

  const rankedPrizes = game.prizes
    .filter((p) => p.kind === "prize")
    .sort((a, b) => (a.awardRank ?? 99) - (b.awardRank ?? 99));
  const brandStyle = { "--brand": accent } as React.CSSProperties;
  const lives = player?.livesLeft ?? game.dailyLives;
  const playing = phase === "playing";

  // ---- A round in progress owns the whole screen -------------------------
  if (playing) {
    return (
      <main
        className="arcade fixed inset-0 z-50 flex h-[100dvh] w-full flex-col p-2 sm:p-3"
        style={brandStyle}
      >
        <div className="mb-2 flex shrink-0 items-center gap-2">
          <button
            onClick={() => {
              setToken(null);
              setPhase("intro");
            }}
            aria-label="Leave the game"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
          >
            <X className="size-5" aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-white/85">
            {game.title}
          </p>
          {isBoard && (
            <span className="arcade-chip" title="Plays left today">
              <span className="emoji text-base leading-none" aria-hidden>
                {"❤️".repeat(Math.min(lives, 3)) || "💔"}
              </span>
              {lives > 3 ? `×${lives}` : ""}
            </span>
          )}
        </div>

        {/* The screen is bright inside the dark bezel — that's what makes a
            cabinet read as a cabinet, and it keeps every game's own artwork
            legible. `stage-fill` is what stretches the playfield to whatever
            height is left, on any device. */}
        <div className="stage-fill min-h-0 flex-1 rounded-2xl bg-gradient-to-b from-zinc-100 to-zinc-50 p-2 shadow-[inset_0_1px_3px_rgb(0_0_0/0.12)]">
          <GameRenderer
            type={game.type}
            config={game.config}
            prizes={game.prizes}
            accent={accent}
            canWin
            submit={submit}
            showResult={showResult}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="arcade min-h-screen p-4 pb-10 sm:p-6" style={brandStyle}>
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        {/* Cabinet top rail: who's hosting, and the two numbers that matter. */}
        <header className="flex items-center gap-2.5">
          <Link
            href={`/p/${slug}`}
            aria-label="All games"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          {host.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={host.logoUrl} alt="" className="size-9 rounded-xl object-cover" />
          ) : (
            <span
              className="flex size-9 items-center justify-center rounded-xl text-xs font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {host.businessName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">
            {host.businessName}
          </p>
          {isBoard && (
            <>
              <span
                className="arcade-chip"
                title={`${lives} plays left today, across every game here`}
              >
                <span className="emoji text-base leading-none" aria-hidden>
                  {"❤️".repeat(Math.min(lives, 3)) || "💔"}
                </span>
                {lives > 3 ? `×${lives}` : ""}
              </span>
              {seasonLeft && (
                <span className="arcade-chip" title="Until the prizes go out">
                  <span className="emoji text-base leading-none" aria-hidden>
                    ⏳
                  </span>
                  {seasonLeft}
                </span>
              )}
            </>
          )}
        </header>

        {/* ---- Result ---- */}
        {phase === "result" && outcome && (
          <ResultPanel
            outcome={outcome}
            accent={accent}
            scoreLabel={def?.scoreLabel ?? "points"}
            isBoard={isBoard}
            seasonLeft={seasonLeft}
            copied={copied === "code"}
            onCopy={async (code) => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied("code");
                window.setTimeout(() => setCopied(null), 2000);
              } catch {
                // Clipboard blocked — the code is on screen anyway.
              }
            }}
            onPlayAgain={() => {
              setPhase("intro");
              setOutcome(null);
              setError(null);
            }}
            onShare={share}
          />
        )}

        {/* ---- Intro: the marquee ---- */}
        {phase === "intro" && (
          <section className="arcade-panel overflow-hidden p-5 text-center sm:p-6">
            <span
              className="animate-float mx-auto flex size-20 items-center justify-center rounded-3xl text-white shadow-lg"
              style={{
                background: def
                  ? `linear-gradient(140deg, ${def.swatch[0]}, ${def.swatch[1]})`
                  : accent,
              }}
            >
              <GameIcon icon={def?.icon ?? "gamepad-2"} className="size-10" />
            </span>

            <h1 className="arcade-title mt-4 text-3xl leading-tight">
              {game.title}
            </h1>
            {game.description && (
              <p className="mx-auto mt-1 line-clamp-2 max-w-xs text-sm text-white/55">
                {game.description}
              </p>
            )}

            {/* The podium: what the top of the board is playing for. */}
            {isBoard && rankedPrizes.length > 0 && (
              <div className="mt-5 grid grid-cols-3 gap-2">
                {rankedPrizes.slice(0, 3).map((prize, i) => (
                  <div
                    key={prize.position}
                    className={
                      "rounded-2xl border border-white/10 bg-white/5 px-2 py-3 " +
                      (prize.soldOut ? "opacity-40" : "")
                    }
                  >
                    <span className="emoji block text-2xl">
                      {RANK_MEDALS[i] ?? "🎖️"}
                    </span>
                    <span className="mt-1 block truncate text-[11px] font-semibold text-white/80">
                      {prize.description}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!isBoard && rankedPrizes.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {rankedPrizes.slice(0, 4).map((prize) => (
                  <span
                    key={prize.position}
                    className={
                      "rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 " +
                      (prize.soldOut ? "line-through opacity-40" : "")
                    }
                  >
                    🎁 {prize.description}
                  </span>
                ))}
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            )}

            {cooldownLeft ? (
              <p className="mt-5 rounded-2xl bg-white/5 px-4 py-4 text-sm text-white/70">
                Next go in{" "}
                <span className="font-bold text-white">{cooldownLeft}</span>
              </p>
            ) : (
              <button
                onClick={() => {
                  if (!player) {
                    setShowVerify(true);
                    return;
                  }
                  void startPlay();
                }}
                disabled={starting || (isBoard && lives <= 0)}
                className="btn-play animate-shine mt-5 overflow-hidden"
              >
                {starting
                  ? "Loading…"
                  : isBoard && lives <= 0
                    ? "No lives left"
                    : player?.bestScore
                      ? "▶ Play again"
                      : "▶ Play"}
              </button>
            )}

            {isBoard && (
              <p className="mt-3 text-xs text-white/45">
                {player?.rank
                  ? `Your best: ${player.bestScore} · #${player.rank} this week`
                  : lives > 0
                    ? `${lives} ${lives === 1 ? "play" : "plays"} left today`
                    : "Share for another life"}
              </p>
            )}
          </section>
        )}

        {/* ---- The board, whenever we're not mid-round ---- */}
        {isBoard && (
          <section className="arcade-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
                <span className="emoji" aria-hidden>
                  🏆
                </span>
                This week
              </h2>
              <span className="text-xs text-white/45">
                {game.playerCount} playing
              </span>
            </div>

            {game.leaderboard.length === 0 ? (
              <p className="py-4 text-center text-sm text-white/50">
                Empty board — first score takes first place.
              </p>
            ) : (
              <ol className="flex flex-col gap-1">
                {game.leaderboard.map((entry) => (
                  <BoardRow key={`${entry.rank}-${entry.maskedEmail}`} entry={entry} accent={accent} />
                ))}
              </ol>
            )}
          </section>
        )}

        {/* ---- Sharing is how you get more plays ---- */}
        {isBoard && shareUrl && (
          <button
            onClick={share}
            className="arcade-panel flex items-center gap-3 p-4 text-left transition hover:brightness-110"
          >
            <span className="emoji text-2xl">🎁</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">
                {lifeEarned ? "Link shared!" : "Share for a free life"}
              </span>
              <span className="block text-xs text-white/50">
                {lifeEarned
                  ? "Your life lands when they finish a round."
                  : `Up to ${game.maxBonusLives} extra plays a day.`}
              </span>
            </span>
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: accent }}
            >
              <Share2 className="size-4" aria-hidden />
            </span>
          </button>
        )}

        {/* ---- Last week's podium ---- */}
        {isBoard && game.lastWinners.length > 0 && (
          <section className="arcade-panel p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">
              Last week
            </h2>
            <ol className="flex flex-col gap-1">
              {game.lastWinners.map((winner) => (
                <li
                  key={winner.rank}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm"
                >
                  <span className="emoji w-6 shrink-0 text-center">
                    {RANK_MEDALS[winner.rank - 1] ?? winner.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/60">
                    {winner.maskedEmail}
                  </span>
                  <span className="max-w-32 truncate text-xs text-white/45">
                    {winner.prize ?? "—"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(
          <div className="flex items-center justify-center gap-3 text-xs text-white/35">
            <Link href={`/p/${slug}`} className="hover:text-white/70">
              More games
            </Link>
            <span>·</span>
            <Link href="/me" className="hover:text-white/70">
              My rewards
            </Link>
          </div>
        )}
      </div>

      {showVerify && (
        <VerifyModal
          businessName={host.businessName}
          logoUrl={host.logoUrl}
          accent={accent}
          initialEmail={email ?? ""}
          onVerified={(verified) => {
            try {
              window.localStorage.setItem(EMAIL_STORAGE_KEY, verified);
            } catch {
              // Non-fatal: they'll just re-enter it next time.
            }
            setEmail(verified);
            setShowVerify(false);
            void startPlay();
          }}
          onClose={() => setShowVerify(false)}
        />
      )}
    </main>
  );
}

/** One row of the board: medal, masked address, score. */
function BoardRow({
  entry,
  accent,
}: {
  entry: LeaderboardEntry;
  accent: string;
}) {
  return (
    <li
      className={
        "flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm " +
        (entry.isYou ? "font-bold" : "")
      }
      style={
        entry.isYou
          ? {
              backgroundColor: `${accent}2e`,
              boxShadow: `inset 0 0 0 1.5px ${accent}`,
            }
          : undefined
      }
    >
      <span className="emoji w-6 shrink-0 text-center">
        {RANK_MEDALS[entry.rank - 1] ?? (
          <span className="text-xs font-bold text-white/40">{entry.rank}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/70">
        {entry.isYou ? "You" : entry.maskedEmail}
      </span>
      {entry.prize && (
        <span className="hidden max-w-28 truncate text-xs text-white/40 sm:block">
          {entry.prize}
        </span>
      )}
      <span className="shrink-0 tabular-nums text-white">{entry.score}</span>
    </li>
  );
}

/**
 * How the round went — a number, a medal, and the button to go again. The
 * things a player wants to know after a run are their score, whether it beat
 * their own, and whether they can play again; everything else is on the board
 * right underneath.
 */
function ResultPanel({
  outcome,
  accent,
  scoreLabel,
  isBoard,
  seasonLeft,
  copied,
  onCopy,
  onPlayAgain,
  onShare,
}: {
  outcome: GameOutcome;
  accent: string;
  scoreLabel: string;
  isBoard: boolean;
  seasonLeft: string | null;
  copied: boolean;
  onCopy: (code: string) => void;
  onPlayAgain: () => void;
  onShare: () => void;
}) {
  // ---- Leaderboard result ------------------------------------------------
  if (isBoard || outcome.result === "scored") {
    const isBest = outcome.score >= outcome.bestScore && outcome.score > 0;
    const onPodium = outcome.rank !== null && outcome.rank <= 3;
    return (
      <section className="arcade-panel flex flex-col items-center gap-4 p-6 text-center">
        <span className="emoji animate-pop text-6xl">
          {onPodium
            ? (RANK_MEDALS[(outcome.rank ?? 1) - 1] ?? "🏆")
            : isBest
              ? "🔥"
              : "👏"}
        </span>

        <div>
          <p className="text-5xl font-extrabold tabular-nums text-white">
            {outcome.score}
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/45">
            {scoreLabel}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <span className="arcade-chip" title="Your rank this week">
            <span className="emoji" aria-hidden>
              🏅
            </span>
            {outcome.rank ? rankLabel(outcome.rank) : "On the board"}
          </span>
          <span className="arcade-chip" title="Your best this week">
            <span className="emoji" aria-hidden>
              ⭐
            </span>
            {outcome.bestScore}
          </span>
          <span className="arcade-chip" title="Plays left today">
            <span className="emoji" aria-hidden>
              {"❤️".repeat(Math.min(outcome.livesLeft, 3)) || "💔"}
            </span>
            {outcome.livesLeft > 3 ? `×${outcome.livesLeft}` : ""}
          </span>
        </div>

        {isBest && outcome.score > 0 && (
          <p className="text-sm font-bold" style={{ color: accent }}>
            New personal best!
          </p>
        )}

        {outcome.livesLeft > 0 ? (
          <button
            onClick={onPlayAgain}
            style={{ "--brand": accent } as React.CSSProperties}
            className="btn-play"
          >
            ▶ Play again
          </button>
        ) : (
          <button onClick={onShare} className="btn-play-ghost w-full">
            <Share2 className="size-4" aria-hidden />
            Share for another life
          </button>
        )}

        <p className="text-xs text-white/40">
          {seasonLeft ? `Prizes in ${seasonLeft}` : "Prizes are on their way"}
        </p>
      </section>
    );
  }

  // ---- Instant-win result (games published before the change) ------------
  const won = outcome.result === "win";
  return (
    <section className="arcade-panel flex flex-col items-center gap-4 p-6 text-center">
      <span className="emoji animate-pop text-6xl">{won ? "🎉" : "🙂"}</span>
      <h2 className="text-2xl font-extrabold text-white">
        {won ? "You won!" : "No prize this time"}
      </h2>
      {won ? (
        <p className="font-semibold" style={{ color: accent }}>
          {outcome.prize?.description}
        </p>
      ) : (
        <p className="text-sm text-white/50">+1 loyalty point</p>
      )}

      {won && outcome.code && (
        <div
          className="w-full rounded-2xl border-2 border-dashed p-4"
          style={{ borderColor: accent }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
            Show at the counter
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-white">
            {outcome.code}
          </p>
          <button
            onClick={() => onCopy(outcome.code!)}
            className="btn-play-ghost mt-3 text-sm"
          >
            <Copy className="size-4" aria-hidden />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      <button
        onClick={onPlayAgain}
        style={{ "--brand": accent } as React.CSSProperties}
        className="btn-play"
      >
        Done
      </button>
    </section>
  );
}
