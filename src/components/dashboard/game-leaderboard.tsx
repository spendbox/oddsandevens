"use client";

// The board, for the business running it.
//
// A weekly competition the owner can't see is a competition they can't talk
// about: who is winning, whether anyone is playing at all, whether last week's
// winner ever came in to collect. All three questions are answered here, and
// unlike the player's page the addresses are not masked — this is the person
// who has to match a code to a face at the counter.

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  Mail,
  Trophy,
  Users,
} from "lucide-react";
import { RANK_MEDALS, rankLabel } from "@/lib/games/catalog";
import { Modal } from "@/components/ui/modal";

interface Row {
  rank: number;
  email: string;
  score: number;
  at: string;
  prize: string | null;
}

interface PastWinnerRow {
  rank: number;
  score: number;
  email: string;
  prize: string | null;
  code: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  emailedAt: string | null;
}

interface Board {
  game: { id: string; slug: string; title: string; type: string };
  seasonDays: number;
  season: { number: number; startsAt: string; endsAt: string } | null;
  playerCount: number;
  shown: number;
  leaderboard: Row[];
  past: {
    number: number;
    startsAt: string;
    endsAt: string;
    closedAt: string | null;
    winners: PastWinnerRow[];
  }[];
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });

/** "3 days left", or "closing today" once it's down to hours. */
function closesIn(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "closing now";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return hours <= 1 ? "closing within the hour" : `${hours}h left`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export function GameLeaderboard({
  gameId,
  onClose,
}: {
  gameId: string;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/merchant/games/${gameId}/leaderboard`);
    const body = (await res.json().catch(() => null)) as
      | (Board & { error?: string })
      | null;
    if (!res.ok || !body) {
      return {
        error:
          body?.error === "not_a_competition"
            ? "This game doesn't run a weekly board."
            : "Couldn't load the leaderboard.",
      };
    }
    return { board: body };
  }, [gameId]);

  useEffect(() => {
    let ignore = false;
    load().then((result) => {
      if (ignore) return;
      if (result.error) setError(result.error);
      else if (result.board) setBoard(result.board);
    });
    return () => {
      ignore = true;
    };
  }, [load]);

  return (
    <Modal
      title={board?.game.title ?? "Leaderboard"}
      subtitle={
        board?.season
          ? `Week ${board.season.number} · ${day(board.season.startsAt)} to ${day(board.season.endsAt)} · ${closesIn(board.season.endsAt)}`
          : undefined
      }
      icon={<Trophy className="size-5 text-amber-500" aria-hidden />}
      width="lg"
      onClose={onClose}
    >

        {error && <p className="alert-error">{error}</p>}

        {!board && !error && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading the board…
          </p>
        )}

        {board && (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                <Users className="size-3.5" aria-hidden />
                {board.playerCount} on the board
              </span>
              {board.season && (
                <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                  <Clock className="size-3.5" aria-hidden />
                  Resets every {board.seasonDays} day
                  {board.seasonDays === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {/* ---- This week ------------------------------------------- */}
            {board.leaderboard.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-200 p-8 text-center">
                <Trophy className="mx-auto size-8 text-zinc-300" aria-hidden />
                <p className="mt-3 text-sm text-zinc-500">
                  Nobody has scored this week yet. Share the link and the board
                  fills up.
                </p>
              </div>
            ) : (
              <ol className="mt-4 flex flex-col gap-1.5">
                {board.leaderboard.map((row) => (
                  <li
                    key={row.rank}
                    className={
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 " +
                      (row.prize
                        ? "bg-gradient-to-r from-amber-50 to-white ring-1 ring-amber-200"
                        : "bg-zinc-50")
                    }
                  >
                    <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-zinc-500">
                      {RANK_MEDALS[row.rank - 1] ?? row.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-800">
                        {row.email}
                      </span>
                      {row.prize && (
                        <span className="block truncate text-xs text-amber-700">
                          {rankLabel(row.rank)} — wins {row.prize}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-zinc-900">
                      {row.score.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {board.playerCount > board.shown && (
              <p className="mt-2 text-xs text-zinc-400">
                Showing the top {board.shown} of {board.playerCount}.
              </p>
            )}

            {/* ---- Weeks already paid out ------------------------------ */}
            {board.past.length > 0 && (
              <section className="mt-6 border-t border-zinc-100 pt-4">
                <h3 className="section-title">Already paid out</h3>
                <div className="mt-2 flex flex-col gap-3">
                  {board.past.map((season) => (
                    <div key={season.number} className="rounded-xl bg-zinc-50 p-3">
                      <p className="text-xs font-semibold text-zinc-500">
                        Week {season.number} · ended {day(season.endsAt)}
                      </p>
                      {season.winners.length === 0 ? (
                        <p className="mt-1.5 text-sm text-zinc-500">
                          Nobody scored, so nothing went out.
                        </p>
                      ) : (
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {season.winners.map((winner) => (
                            <li
                              key={winner.rank}
                              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                            >
                              <span className="w-6 shrink-0 text-center">
                                {RANK_MEDALS[winner.rank - 1] ?? winner.rank}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">
                                {winner.email}
                              </span>
                              {winner.code && (
                                <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-zinc-600 ring-1 ring-zinc-200">
                                  {winner.code}
                                </code>
                              )}
                              {winner.redeemedAt ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                                  <Check className="size-3" aria-hidden />
                                  Redeemed
                                </span>
                              ) : winner.emailedAt ? (
                                <span className="flex items-center gap-1 text-xs text-zinc-400">
                                  <Mail className="size-3" aria-hidden />
                                  Sent, not collected
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">
                                  Email pending
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
    </Modal>
  );
}
