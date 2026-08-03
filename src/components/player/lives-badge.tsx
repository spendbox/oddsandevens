"use client";

// The life counter, and the countdown to the next one.
//
// The countdown matters more than it looks: it is the thing that says "you
// don't have to pay, you have to wait", which is the difference between a game
// and a slot machine.

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { usePlayer } from "./player-context";

/**
 * A clock that ticks only while something is counting down to `target`.
 *
 * Reading `Date.now()` straight from a render body is impure — two renders of
 * the same state would disagree — so the current time is state, seeded once
 * and advanced by an interval that stops as soon as there's nothing left to
 * count.
 */
export function useNow(target: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return now;
}

/** "48m" / "1h 12m" / "9s" — short enough to sit in a header. */
export function countdown(target: string, now: number): string {
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "any moment";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${Math.ceil(ms / 1000)}s`;
}

export function LivesBadge({ onBuy }: { onBuy?: () => void }) {
  const { player, ready, verified, refresh } = usePlayer();
  const now = useNow(player.nextLifeAt);

  // When the countdown runs out, the server is the one that decides a life has
  // landed — ask it rather than incrementing optimistically.
  useEffect(() => {
    const due = player.nextLifeAt;
    if (!due || new Date(due).getTime() > now) return;
    async function reload() {
      await refresh();
    }
    void reload();
  }, [player.nextLifeAt, now, refresh]);

  if (!ready || !verified) return null;

  const empty = player.lives === 0;

  return (
    <button
      type="button"
      onClick={onBuy}
      disabled={!onBuy}
      className={
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition " +
        (empty
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-white/10 bg-white/5 text-zinc-200 hover:border-brass/40") +
        (onBuy ? " cursor-pointer" : " cursor-default")
      }
      title={onBuy ? "Buy more lives" : undefined}
    >
      <Heart
        className={"size-4 " + (empty ? "text-red-400" : "fill-brass text-brass")}
        aria-hidden
      />
      <span className="font-semibold tabular-nums">{player.lives}</span>
      {player.nextLifeAt && (
        <span className="text-xs text-zinc-400">
          +1 in {countdown(player.nextLifeAt, now)}
        </span>
      )}
    </button>
  );
}
