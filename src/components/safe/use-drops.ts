"use client";

// When to ask whether anything is due.
//
// The two places a player quits a hard box are the same two every time: out of
// lives, and a run of guesses that went nowhere. So those are still the two
// moments this watches for — but they now decide *when to ask*, not what to
// ask for and not whether anything arrives.
//
// The rate used to live here, and it was far too generous: a floor of ninety
// seconds and eight minutes between crates on a calm hunt, which over an
// evening is a gift every few minutes. That is not a gift, it is weather. The
// floor is ninety *minutes* now and it is enforced in SQL as well, so a second
// tab, a reload, or a browser with its own ideas cannot beat it.
//
// What arrives is entirely the server's decision — kind, terms and rotation.
// All this sends is the shortlist of power-ups still worth discounting, which
// only the browser knows, and which can only ever narrow what is offered.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Drop } from "@/lib/types";

/** Never more often than this, and Postgres agrees. */
const FLOOR_MS = 90 * 60_000;
/** The gap when somebody is in trouble — the floor, and not a second less. */
const TROUBLE_MS = FLOOR_MS;
/** The ordinary gap when a hunt is going fine. */
const CALM_MS = 3 * 60 * 60_000;
/** Guesses that failed to beat your best before it counts as trouble. */
const COLD_STREAK = 5;
/** Lives at or below which it counts as trouble. */
const LOW_LIVES = 2;
/**
 * How long after arriving on a box the first ask happens.
 *
 * Long enough that it never lands on top of somebody still reading the screen,
 * short enough that a player who *is* in trouble gets it in the same session.
 */
const SETTLE_MS = 45_000;

export function useDrops({
  slug,
  lives,
  /** How many guesses in a row have failed to beat their own best. */
  coldStreak,
  /** Power-ups still on sale here. The rotation draws discounts from these. */
  powerUps,
  /** An offer the server already had waiting when the page loaded. */
  initial,
  enabled,
}: {
  slug: string;
  lives: number;
  coldStreak: number;
  powerUps: string[];
  initial: Drop | null;
  enabled: boolean;
}) {
  const [drop, setDrop] = useState<Drop | null>(initial);
  /** When we last asked, so the floor isn't hammered from this tab either. */
  const lastAt = useRef(0);
  /**
   * Bumped after every ask, answered or not.
   *
   * Without it a refused ask — and at one gift per ninety minutes almost every
   * ask is refused — would be the end of it: nothing about the inputs changes,
   * so the effect never re-arms and no drop ever comes again this session.
   */
  const [asked, setAsked] = useState(0);

  const dismiss = useCallback(() => setDrop(null), []);

  // Joined here rather than passed as an array, so the effect below doesn't
  // re-arm on every render just because a fresh array has a fresh identity.
  const shortlist = powerUps.join(",");

  const mint = useCallback(async () => {
    lastAt.current = Date.now();
    const res = await fetch("/api/player/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mint",
        slug,
        powerUps: shortlist ? shortlist.split(",") : [],
      }),
    });
    setAsked((n) => n + 1);
    if (!res.ok) return;
    const body = (await res.json()) as { offer?: Drop | null };
    if (body.offer) setDrop(body.offer);
  }, [slug, shortlist]);

  const claim = useCallback(async (): Promise<{
    kind: Drop["kind"];
    amount: number;
    /** What a free power-up just revealed. Null for every other kind. */
    note?: string | null;
  } | null> => {
    if (!drop) return null;
    setDrop(null);
    const res = await fetch("/api/player/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The box goes with the claim, not with the mint: a streak reward is won
      // before any safe is on screen and is spent on whichever one they pick.
      body: JSON.stringify({ action: "claim", offerId: drop.id, slug }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { kind: Drop["kind"]; amount: number; note?: string | null };
  }, [drop, slug]);

  useEffect(() => {
    if (!enabled || drop) return;

    const trouble = lives <= LOW_LIVES || coldStreak >= COLD_STREAK;
    const gap = Math.max(FLOOR_MS, trouble ? TROUBLE_MS : CALM_MS);
    const due = lastAt.current + gap - Date.now();

    const id = window.setTimeout(() => void mint(), Math.max(SETTLE_MS, due));
    return () => window.clearTimeout(id);
  }, [enabled, drop, lives, coldStreak, mint, asked]);

  return { drop, claim, dismiss };
}
