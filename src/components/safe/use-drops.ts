"use client";

// When to send something down.
//
// The two places a player quits a hard box are the same two every time: out of
// lives, and a run of guesses that went nowhere. So those are the two triggers,
// and the rate is a function of how much trouble somebody is in rather than a
// timer — a drop that arrives on a schedule is a schedule, and a drop that
// arrives when you are about to stop is a reason not to.
//
// What it asks for cycles through the power-ups, so a long session sees a
// discount on each of them in turn rather than the same one repeatedly. What it
// actually *gets* is the server's decision; this only ever asks.

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
  /** When the last one was minted, so the floor can be enforced. */
  const lastAt = useRef(0);
  /** Which power-up the next discount should be about. */
  const cycle = useRef(0);

  const dismiss = useCallback(() => setDrop(null), []);

  const mint = useCallback(async () => {
    // A discount two times in three, free lives the other — lives are the more
    // valuable of the two and the one that should feel like luck.
    const wantsDiscount = Math.random() > 0.34;
    const powerUp = POWER_UP_KINDS[cycle.current % POWER_UP_KINDS.length];
    cycle.current += 1;

    const res = await fetch("/api/player/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mint",
        slug,
        kind: wantsDiscount ? "power_up_discount" : "free_lives",
        powerUp,
      }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { offer?: Drop };
    if (body.offer) {
      lastAt.current = Date.now();
      setDrop(body.offer);
    }
  }, [slug]);

  const claim = useCallback(async (): Promise<{ kind: string; amount: number } | null> => {
    if (!drop) return null;
    setDrop(null);
    const res = await fetch("/api/player/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", offerId: drop.id }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { kind: string; amount: number };
  }, [drop]);

  useEffect(() => {
    if (!enabled || drop) return;

    const trouble = lives <= LOW_LIVES || coldStreak >= COLD_STREAK;
    const gap = Math.max(FLOOR_MS, trouble ? TROUBLE_MS : CALM_MS);
    const due = lastAt.current + gap - Date.now();

    const id = window.setTimeout(() => void mint(), Math.max(4_000, due));
    return () => window.clearTimeout(id);
  }, [enabled, drop, lives, coldStreak, mint]);

  return { drop, claim, dismiss };
}
