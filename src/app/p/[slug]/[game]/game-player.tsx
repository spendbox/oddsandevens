"use client";

// The branded game shell.
//
// It owns everything that is the same for all twenty games: the business's
// branding, the email gate, opening a play (which gets the single-use token),
// handing the round to the right game component, and showing the result — the
// prize code, the loyalty points, the leaderboard, the cooldown.
//
// The game components themselves only play and report a score.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Share2, Trophy } from "lucide-react";
import { GameRenderer } from "@/components/games";
import { EMAIL_STORAGE_KEY, VerifyModal } from "@/components/games/verify-modal";
import { gameDef, themeAccent } from "@/lib/games/catalog";
import type {
  GameOutcome,
  PublicGame,
  PublicGameHost,
} from "@/lib/games/types";

interface PlayerState {
  nextPlayAt: string | null;
  bestScore: number;
  wins: number;
  canWin: boolean;
}

type Phase = "loading" | "intro" | "playing" | "result";

function useCountdown(target: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}

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
  const [canWin, setCanWin] = useState(true);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const def = game ? gameDef(game.type) : null;
  const accent = themeAccent(game?.theme, host?.brandColor ?? "#059669");
  const cooldownLeft = useCountdown(
    outcome?.nextPlayAt ?? player?.nextPlayAt ?? null
  );

  // Fetching is kept free of setState so the effect below only ever updates
  // state from a resolved promise, never synchronously during the effect.
  const fetchGame = useCallback(async () => {
    let known: string | null = null;
    try {
      known = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    } catch {
      // Private mode or blocked storage: the player just types it again.
    }
    const who = email ?? known;
    const query = who ? `?email=${encodeURIComponent(who)}` : "";
    const res = await fetch(
      `/api/play/${encodeURIComponent(slug)}/games/${encodeURIComponent(
        gameSlug
      )}${query}`
    );
    const body = await res.json().catch(() => null);
    return { ok: res.ok, body, known };
  }, [slug, gameSlug, email]);

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
      setPlayer((result.body?.player as PlayerState | null) ?? null);
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

  // Open a play: the server checks the cooldown and the allowance, and hands
  // back the token the finish call needs.
  const startPlay = async (playerEmail: string) => {
    setStarting(true);
    setError(null);
    const res = await fetch(
      `/api/play/${encodeURIComponent(slug)}/games/${encodeURIComponent(
        gameSlug
      )}/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: playerEmail }),
      }
    );
    const body = await res.json().catch(() => null);
    setStarting(false);

    if (body?.result === "started") {
      setToken(body.token as string);
      setCanWin(body.canWin !== false);
      setOutcome(null);
      setPhase("playing");
      return;
    }
    if (body?.result === "cooldown") {
      setPlayer((current) => ({
        nextPlayAt: body.nextPlayAt as string,
        bestScore: current?.bestScore ?? 0,
        wins: current?.wins ?? 0,
        canWin: current?.canWin ?? true,
      }));
      setError("You've already played — come back when the timer is up.");
      return;
    }
    if (body?.result === "no_plays") {
      setError(
        "This business has paused their games for now. Check back a little later."
      );
      return;
    }
    if (body?.error === "email_not_verified") {
      setShowVerify(true);
      return;
    }
    setError("Something went wrong starting your game. Try again.");
  };

  // Handed to the game component: grade this round.
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
      return result;
    },
    [token, slug, gameSlug]
  );

  const showResult = useCallback(() => {
    setPhase("result");
    void load();
  }, [load]);

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

  const realPrizes = game.prizes.filter((p) => p.kind === "prize");
  const brandStyle = { "--brand": accent } as React.CSSProperties;

  return (
    <main
      className="min-h-screen bg-zinc-50 p-4 pb-16 sm:p-6"
      style={brandStyle}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        {/* Business header */}
        <header className="flex items-center gap-3">
          <Link
            href={`/p/${slug}`}
            className="btn-ghost px-2"
            aria-label="All games"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          {host.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={host.logoUrl}
              alt=""
              className="size-9 rounded-xl object-cover"
            />
          ) : (
            <span
              className="flex size-9 items-center justify-center rounded-xl text-xs font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {host.businessName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-zinc-900">
              {host.businessName}
            </p>
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

          {error && <p className="alert-error mt-4">{error}</p>}

          {/* ---- Intro ---- */}
          {phase === "intro" && (
            <div className="mt-5 flex flex-col gap-4">
              {realPrizes.length > 0 && (
                <div>
                  <p className="section-title">Up for grabs</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {realPrizes.map((prize) => (
                      <li
                        key={prize.position}
                        className={
                          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm " +
                          (prize.soldOut
                            ? "border-zinc-200 bg-zinc-50 text-zinc-400"
                            : "border-zinc-200 bg-white text-zinc-800")
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {prize.description}
                          </span>
                          {prize.details && (
                            <span className="block truncate text-xs text-zinc-500">
                              {prize.details}
                            </span>
                          )}
                        </span>
                        {prize.soldOut ? (
                          <span className="shrink-0 text-xs font-semibold uppercase">
                            Gone
                          </span>
                        ) : (
                          def?.winRule === "target" && (
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                              style={{ backgroundColor: accent }}
                            >
                              {prize.minScore}+ {def.scoreLabel}
                            </span>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cooldownLeft ? (
                <div className="rounded-xl bg-zinc-100 px-4 py-3 text-center text-sm text-zinc-600">
                  You&apos;ve played already. Next go in{" "}
                  <span className="font-semibold text-zinc-900">
                    {cooldownLeft}
                  </span>
                  .
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (!email) {
                      setShowVerify(true);
                      return;
                    }
                    void startPlay(email);
                  }}
                  disabled={starting}
                  style={{ backgroundColor: accent }}
                  className="btn-primary w-full text-base"
                >
                  {starting ? "Getting ready…" : "Play now"}
                </button>
              )}

              {player && player.bestScore > 0 && def?.hasLeaderboard && (
                <p className="text-center text-xs text-zinc-500">
                  Your best: {player.bestScore} {def.scoreLabel}
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
                canWin={canWin}
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
              showScore={def?.hasLeaderboard ?? false}
              cooldownLeft={cooldownLeft}
              copied={copied}
              onCopy={async (code) => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
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

        {/* Leaderboard */}
        {def?.hasLeaderboard && game.leaderboard.length > 0 && (
          <div className="card p-5">
            <p className="section-title">
              <Trophy className="size-3.5" aria-hidden /> Top players
            </p>
            <ol className="mt-3 flex flex-col gap-1.5">
              {game.leaderboard.map((entry) => (
                <li
                  key={`${entry.rank}-${entry.maskedEmail}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-zinc-50"
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{
                      backgroundColor: entry.rank <= 3 ? accent : "#a1a1aa",
                    }}
                  >
                    {entry.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-600">
                    {entry.maskedEmail}
                  </span>
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {entry.score}
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
            void startPlay(verified);
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
  showScore,
  cooldownLeft,
  copied,
  onCopy,
  onPlayAgain,
}: {
  outcome: GameOutcome;
  accent: string;
  scoreLabel: string;
  showScore: boolean;
  cooldownLeft: string | null;
  copied: boolean;
  onCopy: (code: string) => void;
  onPlayAgain: () => void;
}) {
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

      {showScore && (
        <div className="flex w-full gap-2">
          <div className="flex-1 rounded-xl bg-zinc-100 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Your score
            </p>
            <p className="text-lg font-bold text-zinc-900">
              {outcome.score} {scoreLabel}
            </p>
          </div>
          <div className="flex-1 rounded-xl bg-zinc-100 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Best
            </p>
            <p className="text-lg font-bold text-zinc-900">{outcome.bestScore}</p>
          </div>
          {outcome.rank !== null && (
            <div className="flex-1 rounded-xl bg-zinc-100 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Rank
              </p>
              <p className="text-lg font-bold text-zinc-900">#{outcome.rank}</p>
            </div>
          )}
        </div>
      )}

      {won && outcome.code && (
        <div className="w-full rounded-2xl border-2 border-dashed p-4" style={{ borderColor: accent }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Show this code at the counter
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-zinc-900">
            {outcome.code}
          </p>
          {outcome.prize?.details && (
            <p className="mt-1 text-xs text-zinc-500">{outcome.prize.details}</p>
          )}
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => onCopy(outcome.code!)} className="btn-secondary text-sm">
              <Copy className="size-4" aria-hidden />
              {copied ? "Copied!" : "Copy code"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={() =>
                  navigator
                    .share({
                      title: outcome.prize?.description ?? "My prize",
                      text: `I won ${outcome.prize?.description}! Code: ${outcome.code}`,
                    })
                    .catch(() => {})
                }
                className="btn-secondary text-sm"
              >
                <Share2 className="size-4" aria-hidden />
                Share
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            We emailed it to you too. It expires{" "}
            {outcome.expiresAt
              ? new Date(outcome.expiresAt).toLocaleDateString()
              : "soon"}
            .
          </p>
        </div>
      )}

      {!won && outcome.loyaltyPoints > 0 && (
        <div className="w-full rounded-xl bg-zinc-100 px-4 py-3">
          <p className="text-sm text-zinc-600">
            Loyalty points:{" "}
            <span className="font-bold text-zinc-900">
              {outcome.loyaltyPoints}
            </span>
          </p>
          {outcome.loyaltyCode && (
            <p className="mt-1 font-mono text-sm tracking-widest text-zinc-700">
              {outcome.loyaltyCode}
            </p>
          )}
        </div>
      )}

      {cooldownLeft ? (
        <p className="text-sm text-zinc-500">
          Next play in <span className="font-semibold">{cooldownLeft}</span>.
        </p>
      ) : (
        <button
          onClick={onPlayAgain}
          style={{ backgroundColor: accent }}
          className="btn-primary w-full"
        >
          Play again
        </button>
      )}
    </div>
  );
}
