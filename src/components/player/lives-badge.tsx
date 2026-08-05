"use client";

// The life counter, and the countdown to the next one.
//
// The countdown matters more than it looks: it is the thing that says "you
// don't have to pay, you have to wait", which is the difference between a game
// and a slot machine.

import { useEffect, useState } from "react";
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

/**
 * The life counter.
 *
 * A chunky pill with a real heart in it rather than an outline glyph, because
 * this is the number a player checks more than any other and it should read
 * like a resource in a game, not a status in a toolbar. It goes berry and
 * pulses when the pool is empty — the one place in the app that is allowed to
 * nag, and only because running out is the thing you most need to notice.
 */
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
      style={
        {
          "--btn-lip": empty ? "var(--berry-deep)" : "var(--surface-low)",
        } as React.CSSProperties
      }
      className={
        "btn-chunky flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm " +
        (empty ? "bg-berry text-ink" : "bg-surface-high text-foreground") +
        (onBuy ? " cursor-pointer" : " cursor-default")
      }
      title={onBuy ? "Buy more lives" : undefined}
    >
      <HeartArt className={"size-5 " + (empty ? "opacity-70" : "")} />
      <span className="font-black tabular-nums">{player.lives}</span>
      {player.nextLifeAt && (
        <span className={"text-xs font-semibold " + (empty ? "text-ink/70" : "text-zinc-300")}>
          +1 in {countdown(player.nextLifeAt, now)}
        </span>
      )}
    </button>
  );
}

/**
 * A heart with a shine on it.
 *
 * Drawn rather than an icon-font glyph for one reason: it needs a highlight.
 * A flat silhouette at 20px reads as a symbol, and two extra shapes turn it
 * into an object — which is the whole difference between an app and a game.
 */
export function HeartArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="heart-fill" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ff9ab8" />
          <stop offset="100%" stopColor="#e0325f" />
        </linearGradient>
      </defs>
      <path
        d="M12 21.2 C 5.2 16.6 2 13.2 2 9.4 A 5.4 5.4 0 0 1 12 6.4 A 5.4 5.4 0 0 1 22 9.4 C 22 13.2 18.8 16.6 12 21.2 Z"
        fill="url(#heart-fill)"
        stroke="#150e2b"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <ellipse cx="8.4" cy="9" rx="2.4" ry="1.6" fill="#fff" opacity="0.6" transform="rotate(-28 8.4 9)" />
    </svg>
  );
}
