"use client";

// When to send something down.
//
// The two places a player quits a hard box are the same two every time: out of
// lives, and a run of guesses that went nowhere. So those are the two triggers,
// and the rate is a function of how much trouble somebody is in rather than a
// timer — a drop that arrives on a schedule is a schedule, and a drop that
// arrives when you are about to stop is a reason not to.
//
// What it *asks* for is mostly a discount, cycling through the power-ups so a
// long session sees a different one each time. Free lives are the rare one and
// the server caps them regardless — one popup an hour, five taken a day — so
// this asks for them a fifth of the time and lets Postgres be the authority.
//
// A player with nothing left in the pool is asked for on different terms: a
// free Second Wind, which is an hour of guessing that costs nothing. It is
// once a week and the cap for that lives in SQL too.

import { useCallback, useEffect, useRef, useState } from "react";
import { POWER_UP_KINDS } from "@/lib/game/power-ups";
import type { Drop } from "@/lib/types";

/** Never more often than this, whatever else is going on. */
const FLOOR_MS = 90_000;
/** The ordinary gap when a hunt is going fine. */
const CALM_MS = 8 * 60_000;
/** The gap when somebody is in trouble. */
const TROUBLE_MS = 2 * 60_000;
/** Guesses that failed to beat your best before it counts as trouble. */
const COLD_STREAK = 5;
/** Lives at or below which it counts as trouble. */
const LOW_LIVES = 2;
/** How often the ask is for free lives rather than a discount. */
const LIVES_SHARE = 0.2;

export function useDrops({
  slug,
  lives,
  /** How many guesses in a row have failed to beat their own best. */
  coldStreak,
  /** An offer the server already had waiting when the page loaded. */
  initial,
  enabled,
}: {
  slug: string;
  lives: number;
  coldStreak: number;
  initial: Drop | null;
  enabled: boolean;
}) {
  const [drop, setDrop] = useState<Drop | null>(initial);
  /** When the last one was asked for, so the floor can be enforced. */
  const lastAt = useRef(0);
  /** Which power-up the next discount should be about. */
  const cycle = useRef(0);
  /**
   * Bumped after every ask, answered or not.
   *
   * Without it a refused ask — and the server refuses plenty now, by design —
   * would be the end of it: nothing about the inputs changes, so the effect
   * never re-arms and no drop ever comes again for the rest of the session.
   */
  const [asked, setAsked] = useState(0);

  const dismiss = useCallback(() => setDrop(null), []);

  const mint = useCallback(
    async (kind: Drop["kind"]) => {
      const powerUp = POWER_UP_KINDS[cycle.current % POWER_UP_KINDS.length];
      cycle.current += 1;
      lastAt.current = Date.now();

      const res = await fetch("/api/player/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mint", slug, kind, powerUp }),
      });
      setAsked((n) => n + 1);
      if (!res.ok) return;
      const body = (await res.json()) as { offer?: Drop | null };
      if (body.offer) setDrop(body.offer);
    },
    [slug]
  );

  const claim = useCallback(async (): Promise<{
    kind: Drop["kind"];
    amount: number;
  } | null> => {
    if (!drop) return null;
    setDrop(null);
    const res = await fetch("/api/player/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", offerId: drop.id }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { kind: Drop["kind"]; amount: number };
  }, [drop]);

  useEffect(() => {
    if (!enabled || drop) return;

    const trouble = lives <= LOW_LIVES || coldStreak >= COLD_STREAK;
    const gap = Math.max(FLOOR_MS, trouble ? TROUBLE_MS : CALM_MS);
    const due = lastAt.current + gap - Date.now();

    const id = window.setTimeout(
      () =>
        void mint(
          // Nothing left in the pool is the one moment an hour of free
          // guesses is worth more than anything else on the shelf.
          lives === 0
            ? "free_second_wind"
            : Math.random() < LIVES_SHARE
              ? "free_lives"
              : "power_up_discount"
        ),
      Math.max(4_000, due)
    );
    return () => window.clearTimeout(id);
  }, [enabled, drop, lives, coldStreak, mint, asked]);

  return { drop, claim, dismiss };
}
