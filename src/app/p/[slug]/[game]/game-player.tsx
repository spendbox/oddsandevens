"use client";

// The branded game shell.
//
// A game is a weekly competition: play as often as your lives allow, get your
// best run onto the public board, and the top places take the prizes when the
// week closes. This owns everything around the game itself — the business's
// branding, the email gate, lives, the board, the countdown, and the share
// link that earns another life.
//
// The game components only play and report a score.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  Copy,
  Heart,
  Share2,
  Trophy,
} from "lucide-react";
import { GameRenderer } from "@/components/games";
import { EMAIL_STORAGE_KEY, VerifyModal } from "@/components/games/verify-modal";
import { RANK_MEDALS, gameDef, rankLabel, themeAccent } from "@/lib/games/catalog";
import { useCountdown } from "@/lib/games/use-countdown";
import type { GameOutcome, PublicGame, PublicGameHost } from "@/lib/games/types";

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
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <span className="animate-pulse">Loading…</span>
      </main>
    );
  }

  if (!game || !host) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-zinc-600">{error ?? "Game not found."}</p>
        <Link href={`/p/${slug}`} className="btn-secondary">
          See all games
        </Link>
      </main>
    );
  }

  const rankedPrizes = game.prizes
    .filter((p) => p.kind === "prize")
    .sort((a, b) => (a.awardRank ?? 99) - (b.awardRank ?? 99));
  const brandStyle = { "--brand": accent } as React.CSSProperties;
  const lives = player?.livesLeft ?? game.dailyLives;

  return (
    <main className="min-h-screen bg-zinc-50 p-4 pb-16 sm:p-6" style={brandStyle}>
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        {/* Business header */}
        <header className="flex items-center gap-3">
          <Link href={`/p/${slug}`} className="btn-ghost px-2" aria-label="All games">
            <ArrowLeft className="size-4" aria-hidden />
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
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-zinc-900">{host.businessName}</p>
            {host.tagline && (
              <p className="truncate text-xs text-zinc-500">{host.tagline}</p>
            )}
          </div>
        </header>

        <div className="card p-5">
          <h1 className="text-2xl font-bold text-zinc-900">{game.title}</h1>
          {game.description && (
            <p className="mt-1 text-sm text-zinc-600">{game.description}</p>
          )}

          {/* Week + lives strip */}
          {isBoard && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-zinc-100 px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <Clock className="size-3" aria-hidden /> Prizes in
                </p>
                <p className="text-lg font-bold tabular-nums text-zinc-900">
                  {seasonLeft ?? "Closing…"}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-100 px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <Heart className="size-3" aria-hidden /> Lives today
                </p>
                <p className="emoji text-lg font-bold text-zinc-900">
                  {"❤️".repeat(Math.min(lives, 6)) || "—"}
                </p>
              </div>
            </div>
          )}

          {isBoard && (
            <p className="mt-2 text-center text-xs text-zinc-500">
              {lives > 0
                ? `${lives} ${lives === 1 ? "play" : "plays"} left today`
                : "Out of plays today"}{" "}
              — shared across every game {host.businessName} runs.
            </p>
          )}

          {error && <p className="alert-error mt-4">{error}</p>}

          {/* ---- Intro ---- */}
          {phase === "intro" && (
            <div className="mt-5 flex flex-col gap-4">
              {rankedPrizes.length > 0 && (
                <div>
                  <p className="section-title">
                    {isBoard ? "This week's prizes" : "Up for grabs"}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {rankedPrizes.map((prize, i) => (
                      <li
                        key={prize.position}
                        className={
                          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm " +
                          (prize.soldOut
                            ? "border-zinc-200 bg-zinc-50 text-zinc-400"
                            : "border-zinc-200 bg-white text-zinc-800")
                        }
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {isBoard && (
                            <span className="emoji shrink-0 text-lg">
                              {RANK_MEDALS[i] ?? "🎖️"}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {prize.description}
                            </span>
                            <span className="block truncate text-xs text-zinc-500">
                              {isBoard
                                ? rankLabel(prize.awardRank ?? i + 1)
                                : (prize.details ?? "")}
                            </span>
                          </span>
                        </span>
                        {prize.soldOut && (
                          <span className="shrink-0 text-xs font-semibold uppercase">
                            Gone
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {isBoard && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Highest scores when the clock runs out take the prizes.
                      Codes are emailed to the winners.
                    </p>
                  )}
                </div>
              )}

              {cooldownLeft ? (
                <div className="rounded-xl bg-zinc-100 px-4 py-3 text-center text-sm text-zinc-600">
                  You&apos;ve played already. Next go in{" "}
                  <span className="font-semibold text-zinc-900">{cooldownLeft}</span>.
                </div>
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
                  style={{ backgroundColor: accent }}
                  className="btn-primary w-full text-base"
                >
                  {starting
                    ? "Getting ready…"
                    : isBoard && lives <= 0
                      ? "No lives left today"
                      : player?.bestScore
                        ? "Play again"
                        : "Play now"}
                </button>
              )}

              {isBoard && player && (
                <p className="text-center text-xs text-zinc-500">
                  {player.rank
                    ? `Your best this week: ${player.bestScore} — currently #${player.rank}.`
                    : "You're not on this week's board yet."}
                </p>
              )}
            </div>
          )}

          {/* ---- Playing ---- */}
          {phase === "playing" && (
            <div className="mt-5">
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
          )}

          {/* ---- Result ---- */}
          {phase === "result" && outcome && (
            <ResultPanel
              outcome={outcome}
              accent={accent}
              scoreLabel={def?.scoreLabel ?? "points"}
              isBoard={isBoard}
              seasonLeft={seasonLeft}
              topPrize={rankedPrizes[0]?.description ?? null}
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
            />
          )}
        </div>

        {/* Share for a life */}
        {isBoard && shareUrl && (
          <div className="card p-5">
            <p className="section-title">
              <Share2 className="size-3.5" aria-hidden /> Out of lives?
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Sharing is how you get more plays. Send your link to someone —
              when they play, you get an extra life today, good on any game
              here. Up to {game.maxBonusLives} of them.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                {shareUrl}
              </code>
              <button
                onClick={share}
                className="btn-primary text-sm"
                style={{ backgroundColor: accent }}
              >
                {copied === "share" ? (
                  <>
                    <Copy className="size-4" aria-hidden />
                    Copied!
                  </>
                ) : (
                  <>
                    <Share2 className="size-4" aria-hidden />
                    Share
                  </>
                )}
              </button>
            </div>
            {lifeEarned && (
              <p className="mt-2 text-xs text-emerald-700">
                Shared — your life lands as soon as they finish a round.
              </p>
            )}
          </div>
        )}

        {/* This week's board */}
        {isBoard && (
          <div className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="section-title">
                <Trophy className="size-3.5" aria-hidden /> This week&apos;s board
              </p>
              <span className="text-xs text-zinc-400">
                {game.playerCount} playing
              </span>
            </div>

            {game.leaderboard.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                Nobody has scored yet this week. First run takes first place.
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-1.5">
                {game.leaderboard.map((entry) => (
                  <li
                    key={`${entry.rank}-${entry.maskedEmail}`}
                    className={
                      "flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm " +
                      (entry.isYou ? "ring-2" : "odd:bg-zinc-50")
                    }
                    style={
                      entry.isYou
                        ? {
                            backgroundColor: `${accent}14`,
                            boxShadow: `inset 0 0 0 2px ${accent}`,
                          }
                        : undefined
                    }
                  >
                    <span className="emoji w-7 shrink-0 text-center text-base">
                      {RANK_MEDALS[entry.rank - 1] ?? (
                        <span className="text-xs font-bold text-zinc-400">
                          {entry.rank}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600">
                      {entry.maskedEmail}
                      {entry.isYou && (
                        <span
                          className="ml-1.5 font-sans text-[10px] font-bold uppercase"
                          style={{ color: accent }}
                        >
                          you
                        </span>
                      )}
                    </span>
                    {entry.prize && (
                      <span className="hidden max-w-[8rem] truncate text-xs text-zinc-400 sm:block">
                        {entry.prize}
                      </span>
                    )}
                    <span className="font-semibold tabular-nums text-zinc-900">
                      {entry.score}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <p className="mt-3 text-xs text-zinc-400">
              Names are hidden — only you can tell which row is yours.
            </p>
          </div>
        )}

        {/* Last week */}
        {isBoard && game.lastWinners.length > 0 && (
          <div className="card p-5">
            <p className="section-title">Last week&apos;s winners</p>
            <ol className="mt-3 flex flex-col gap-1.5">
              {game.lastWinners.map((winner) => (
                <li
                  key={winner.rank}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-zinc-50"
                >
                  <span className="emoji w-7 shrink-0 text-center text-base">
                    {RANK_MEDALS[winner.rank - 1] ?? winner.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600">
                    {winner.maskedEmail}
                  </span>
                  <span className="truncate text-xs text-zinc-500">
                    {winner.prize ?? "—"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
          <Link href={`/p/${slug}`} className="hover:text-zinc-600">
            More games from {host.businessName}
          </Link>
          <span>·</span>
          <Link href="/me" className="hover:text-zinc-600">
            My rewards
          </Link>
        </div>
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

function ResultPanel({
  outcome,
  accent,
  scoreLabel,
  isBoard,
  seasonLeft,
  topPrize,
  copied,
  onCopy,
  onPlayAgain,
}: {
  outcome: GameOutcome;
  accent: string;
  scoreLabel: string;
  isBoard: boolean;
  seasonLeft: string | null;
  topPrize: string | null;
  copied: boolean;
  onCopy: (code: string) => void;
  onPlayAgain: () => void;
}) {
  // ---- Leaderboard result ------------------------------------------------
  if (isBoard || outcome.result === "scored") {
    const isBest = outcome.score >= outcome.bestScore && outcome.score > 0;
    const onPodium = outcome.rank !== null && outcome.rank <= 3;
    return (
      <div className="mt-5 flex flex-col items-center gap-4 text-center">
        <span className="emoji text-5xl">
          {onPodium ? (RANK_MEDALS[(outcome.rank ?? 1) - 1] ?? "🏆") : isBest ? "🔥" : "👏"}
        </span>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">
            {outcome.score} {scoreLabel}
          </h2>
          <p className="mt-1 text-sm" style={{ color: accent }}>
            {outcome.rank
              ? `${rankLabel(outcome.rank)} this week`
              : "On the board"}
            {isBest && outcome.score > 0 ? " · new personal best" : ""}
          </p>
        </div>

        <div className="flex w-full gap-2">
          <div className="flex-1 rounded-xl bg-zinc-100 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Your best
            </p>
            <p className="text-lg font-bold text-zinc-900">{outcome.bestScore}</p>
          </div>
          <div className="flex-1 rounded-xl bg-zinc-100 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Lives left
            </p>
            <p className="text-lg font-bold text-zinc-900">
              {"❤️".repeat(Math.min(outcome.livesLeft, 6)) || "0"}
            </p>
          </div>
        </div>

        {onPodium && topPrize && (
          <p className="w-full rounded-xl border-2 border-dashed p-3 text-sm" style={{ borderColor: accent }}>
            Hold your place until the week ends and the prize is yours. We&apos;ll
            email the code.
          </p>
        )}

        <p className="text-xs text-zinc-500">
          {seasonLeft
            ? `Prizes go out in ${seasonLeft}.`
            : "The week is closing — prizes are on their way."}
        </p>

        {outcome.livesLeft > 0 ? (
          <button
            onClick={onPlayAgain}
            style={{ backgroundColor: accent }}
            className="btn-primary w-full"
          >
            Play again ({outcome.livesLeft} left)
          </button>
        ) : (
          <p className="text-sm text-zinc-600">
            That was your last life today. Share your link for another, or come
            back tomorrow.
          </p>
        )}
      </div>
    );
  }

  // ---- Instant-win result (games published before the change) ------------
  const won = outcome.result === "win";
  return (
    <div className="mt-5 flex flex-col items-center gap-4 text-center">
      <span className="text-5xl">{won ? "🎉" : "🙂"}</span>
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">
          {won ? "You won!" : "No prize this time"}
        </h2>
        {won ? (
          <p className="mt-1 font-medium" style={{ color: accent }}>
            {outcome.prize?.description}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">
            You earned a loyalty point — they add up to a discount.
          </p>
        )}
      </div>

      {won && outcome.code && (
        <div className="w-full rounded-2xl border-2 border-dashed p-4" style={{ borderColor: accent }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Show this code at the counter
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-zinc-900">
            {outcome.code}
          </p>
          <button
            onClick={() => onCopy(outcome.code!)}
            className="btn-secondary mt-3 text-sm"
          >
            <Copy className="size-4" aria-hidden />
            {copied ? "Copied!" : "Copy code"}
          </button>
        </div>
      )}

      <button
        onClick={onPlayAgain}
        style={{ backgroundColor: accent }}
        className="btn-primary w-full"
      >
        Play again
      </button>
    </div>
  );
}
