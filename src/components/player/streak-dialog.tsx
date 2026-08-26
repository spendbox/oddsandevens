"use client";

// The daily claim, and it is the one screen in the product allowed to
// interrupt somebody.
//
// Three things earn that interruption, and the third is the one most daily
// rewards forget: what today gives, how far the run has got, and **what
// tomorrow gives**. A reward you have already taken is spent; the locked tile
// beside it is the only part of this screen doing any work after the dialog
// closes.
//
// It opens once per day, on the first visit, over whatever they were doing.

import { useEffect, useState } from "react";
import { Flame, Loader2, Lock, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { usePlayer } from "@/components/player/player-context";
import {
  dayLabel,
  grantLabel,
  headlineGrant,
  isMilestone,
  STREAK_DAYS,
  type Grant,
  type StreakDay,
  type StreakState,
} from "@/lib/game/streaks";

type Phase = "grid" | "opening" | "won";

export function StreakDialog({
  state,
  onClose,
  onClaimed,
}: {
  state: StreakState;
  onClose: () => void;
  onClaimed: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("grid");
  const [won, setWon] = useState<{ day: number; grants: Grant[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byDay = new Map(state.ladder.map((d: StreakDay) => [d.day, d]));
  const today = state.nextDay;
  const tomorrow = today >= STREAK_DAYS ? 1 : today + 1;

  const claim = async () => {
    setPhase("opening");
    setError(null);
    const res = await fetch("/api/player/streak", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as {
      day?: number;
      grants?: Grant[];
      error?: string;
    };
    if (!res.ok || !body.day) {
      setError(
        body.error === "already_claimed"
          ? "Already claimed today. Come back tomorrow."
          : "That didn’t work. Try again in a moment."
      );
      setPhase("grid");
      return;
    }
    const day = body.day;
    const grants = body.grants ?? [];
    // A beat before the reward lands. The safe's dial spins for the same
    // reason: a result that appears instantly reads as a field, not an event.
    window.setTimeout(() => {
      setWon({ day, grants });
      setPhase("won");
      onClaimed();
    }, 650);
  };

  if (phase === "won" && won) {
    const big = isMilestone(won.day);
    return (
      <Modal
        above={
          <div className="relative mx-auto mb-1 size-28">
            {/* A milestone gets the spark ring the win dialog uses. A Tuesday
                does not — if every day is a celebration, none of them is. */}
            {big && (
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,194,71,.45) 0%, rgba(255,194,71,0) 70%)",
                }}
                aria-hidden
              />
            )}
            <Boxy mood={big ? "cheer" : "happy"} className="relative size-full" />
          </div>
        }
        title={big ? `Day ${won.day} — a week closed` : `Day ${won.day} claimed`}
        subtitle={
          big ? "The big one. Spend it on something hard." : "Same time tomorrow keeps it going."
        }
        icon={<Flame className="size-5 text-brass" aria-hidden />}
        width="sm"
        onClose={onClose}
        footer={
          <button
            type="button"
            onClick={onClose}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
          >
            Go and spend it
          </button>
        }
      >
        <ul className="space-y-1.5">
          {won.grants.map((grant, i) => (
            <li
              key={i}
              className="animate-fade-up rounded-2xl bg-brass/12 px-4 py-3 text-center text-lg font-black text-brass"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {grantLabel(grant)}
            </li>
          ))}
        </ul>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <Lock className="size-3" aria-hidden />
          Tomorrow: {dayLabel(byDay.get(won.day >= STREAK_DAYS ? 1 : won.day + 1))}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      above={
        <div className="mx-auto mb-1 size-24">
          <Boxy mood={state.broke ? "sad" : "happy"} className="size-full" />
        </div>
      }
      title={state.broke ? "Your streak broke" : state.day > 0 ? `Day ${today}` : "Start a streak"}
      subtitle={
        state.broke
          ? `You reached day ${state.bestDay}. Back to day one — thirty days is the whole ladder.`
          : "Open Spendbox every day. Miss one and it starts over."
      }
      icon={<Flame className="size-5 text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => void claim()}
            disabled={phase === "opening" || !state.claimable}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink disabled:opacity-60"
          >
            {phase === "opening" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Flame className="size-4" aria-hidden />
            )}
            {state.claimable ? `Claim day ${today}` : "Come back tomorrow"}
          </button>

          {/* The locked tile is the whole retention mechanism. */}
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
            <Lock className="size-3 shrink-0" aria-hidden />
            Tomorrow: {dayLabel(byDay.get(tomorrow))}
          </p>
        </>
      }
    >
      {/* Thirty tiles, because seeing the whole ladder is what makes day four
          worth turning up for. */}
      <div className="mt-1 grid grid-cols-6 gap-1.5">
        {Array.from({ length: STREAK_DAYS }, (_, i) => i + 1).map((n) => {
          const done = state.day > 0 && !state.broke && n < today;
          const isToday = n === today;
          const entry = byDay.get(n);
          const grant = headlineGrant(entry);
          return (
            <span
              key={n}
              title={dayLabel(entry)}
              className={
                "flex aspect-square flex-col items-center justify-center rounded-xl border-2 p-0.5 text-[9px] font-bold leading-tight " +
                (isToday
                  ? "animate-pop-in border-brass bg-brass/20 text-brass"
                  : done
                    ? "border-mint/30 bg-mint/10 text-mint"
                    : isMilestone(n)
                      ? "border-grape/40 bg-grape/10 text-grape"
                      : "border-white/10 bg-white/5 text-zinc-500")
              }
            >
              {/* A taken day keeps its number. Six identical ticks in a row
                  said "done" without saying how far — which is the one thing
                  the grid is for. */}
              <span className="font-mono text-[11px] font-black">{n}</span>
              {done ? (
                <Check className="size-3" aria-hidden />
              ) : (
                grant && (
                  <span className="w-full truncate px-0.5 opacity-80">{shortGrant(grant)}</span>
                )
              )}
            </span>
          );
        })}
      </div>

      <p className="mt-3 rounded-2xl bg-black/25 px-3 py-2.5 text-center text-sm">
        <span className="text-zinc-500">Today: </span>
        <strong className="text-brass">{dayLabel(byDay.get(today))}</strong>
      </p>

      {error && <p className="mt-2 text-center text-sm text-berry">{error}</p>}
    </Modal>
  );
}

/** A tile is about 48px wide. Anything longer than this is unreadable on it. */
function shortGrant(grant: Grant): string {
  switch (grant.kind) {
    case "free_lives":
      return `${grant.amount ?? 0}♥`;
    case "life_bank":
      return `${grant.amount ?? 0}d`;
    case "life_discount":
    case "power_up_discount":
      return `${grant.amount ?? 0}%`;
    case "free_second_wind":
      return "wind";
    case "free_power_up":
      return "free";
    default:
      return "";
  }
}

/**
 * Opens itself once a day, on the first visit.
 *
 * Mounted by the player provider rather than by a page, because "the first
 * visit" is not a page — somebody arriving on a shared box link should get
 * their streak exactly as somebody opening the lobby does.
 *
 * It asks nothing at all of a stranger: the ladder belongs to an address, and
 * a dialog about a run somebody hasn't started is an interruption with nothing
 * behind it.
 */
export function StreakGate() {
  const { verified, refresh } = usePlayer();
  const [state, setState] = useState<StreakState | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!verified) return;
    let live = true;
    void (async () => {
      const res = await fetch("/api/player/streak", { cache: "no-store" });
      if (!live || !res.ok) return;
      const body = (await res.json().catch(() => null)) as StreakState | null;
      if (!live || !body?.enabled) return;
      setState(body);
      // Only interrupt somebody who has something to take. A player who has
      // already claimed today gets nothing thrown over their game.
      if (body.claimable) setOpen(true);
    })();
    return () => {
      live = false;
    };
  }, [verified]);

  if (!open || !state) return null;
  return (
    <StreakDialog
      state={state}
      onClose={() => setOpen(false)}
      // The life count in the header is stale the instant a claim lands.
      onClaimed={() => void refresh()}
    />
  );
}
