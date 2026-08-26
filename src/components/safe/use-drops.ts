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
//
// **A crate applies itself.** It used to be a button, and a gift with a
// button on it is a gift you can lose by not noticing — a 40% discount that
// hung for two minutes over somebody typing a guess and then expired unclaimed
// was worth nothing to them and nothing to us. There was never a decision in
// that tap: nobody declines free lives. So a crate minted for this safe is
// claimed the moment it arrives and announced afterwards, and the only thing
// left on screen is what they now have and how long they have it for.
//
// The one thing still waiting to be spent is a *floating* reward — a Second
// Wind or a power-up won on a streak, which carries no safe. That one is a
// real decision ("on whichever safe you like"), so it keeps its tap.

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

/** What a claim gave back, in whatever shape the kind needs. */
export interface Applied {
  kind: Drop["kind"];
  amount: number;
  powerUp: string | null;
  /** When a discount stops being honoured. Its own ten minutes, from now. */
  expiresAt: string | null;
  /** What a free power-up revealed. */
  note: string | null;
  secondWindUntil: string | null;
}

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
  /** Called once a crate has applied itself, with what it turned out to be. */
  onApplied,
}: {
  slug: string;
  lives: number;
  coldStreak: number;
  powerUps: string[];
  initial: Drop | null;
  enabled: boolean;
  onApplied: (applied: Applied) => void;
}) {
  // Only a floating reward ever sits here now. A crate goes straight through
  // `take` and is never a thing on screen waiting to be pressed.
  const [drop, setDrop] = useState<Drop | null>(null);
  /** Every offer id already sent to the claim route, so none goes twice. */
  const taken = useRef<Set<string>>(new Set());
  /** A crate waiting for the effect below to apply it. */
  const [pending, setPending] = useState<Drop | null>(null);
  /**
   * What the page arrived holding, until the hunt is open enough to route it.
   *
   * Held rather than routed on the spot because `enabled` is false for the
   * first moments of most visits — an unverified visitor, or a box still
   * loading — and applying a discount to a hunt somebody cannot play yet
   * spends its ten minutes on nothing.
   */
  const arrived = useRef<Drop | null>(initial);
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
    if (!body.offer) return;
    if (body.offer.floating) setDrop(body.offer);
    else setPending(body.offer);
  }, [slug, shortlist]);

  /**
   * Take one offer, whoever asked.
   *
   * Guarded by a set of ids rather than by the render, because the auto-claim
   * below fires from an effect: a re-render between the fetch going out and
   * the state landing would otherwise claim the same crate twice, and the
   * second attempt spends nothing but does tell the player their gift is gone.
   */
  const take = useCallback(
    async (offer: Drop): Promise<Applied | null> => {
      if (taken.current.has(offer.id)) return null;
      taken.current.add(offer.id);

      let res: Response;
      try {
        res = await fetch("/api/player/offer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The box goes with the claim, not with the mint: a streak reward is
          // won before any safe is on screen and is spent on the one they pick.
          body: JSON.stringify({ action: "claim", offerId: offer.id, slug }),
        });
      } catch {
        // Offline, or a deploy mid-flight. The offer is still unclaimed in the
        // database, so let a later attempt have it rather than burning it here.
        taken.current.delete(offer.id);
        return null;
      }
      if (!res.ok) return null;

      const body = (await res.json()) as {
        kind?: Drop["kind"];
        amount?: number;
        power_up?: string | null;
        expires_at?: string | null;
        note?: string | null;
        second_wind_until?: string | null;
      };
      return {
        kind: body.kind ?? offer.kind,
        amount: Number(body.amount ?? offer.amount),
        powerUp: body.power_up ?? offer.powerUp,
        expiresAt: body.expires_at ?? null,
        note: body.note ?? null,
        secondWindUntil: body.second_wind_until ?? null,
      };
    },
    [slug]
  );

  /** The tap that spends a floating reward on this safe. */
  const claim = useCallback(async (): Promise<Applied | null> => {
    if (!drop) return null;
    setDrop(null);
    return take(drop);
  }, [drop, take]);

  /*
   * Route what the page arrived holding, once there is a hunt to route it into.
   *
   * An unclaimed offer in the payload is one of two things and they are not
   * alike: a crate minted on an earlier visit and never taken, which applies
   * itself like any other, or a streak reward with no safe on it, which is
   * still somebody's decision to make.
   */
  useEffect(() => {
    if (!enabled) return;
    const one = arrived.current;
    if (!one) return;
    arrived.current = null;
    if (one.floating) setDrop(one);
    else setPending(one);
  }, [enabled]);

  /*
   * Apply whatever is waiting, then say what it was.
   *
   * In an effect rather than inline in `mint`, because the crate the *page*
   * arrived holding has no mint to hang off — it was minted on a previous
   * visit and never claimed — and both need the same treatment.
   */
  useEffect(() => {
    if (!pending) return;
    let live = true;
    void (async () => {
      const applied = await take(pending);
      if (!live) return;
      setPending(null);
      if (applied) onApplied(applied);
    })();
    return () => {
      live = false;
    };
  }, [pending, take, onApplied]);

  useEffect(() => {
    if (!enabled || drop || pending) return;

    const trouble = lives <= LOW_LIVES || coldStreak >= COLD_STREAK;
    const gap = Math.max(FLOOR_MS, trouble ? TROUBLE_MS : CALM_MS);
    const due = lastAt.current + gap - Date.now();

    const id = window.setTimeout(() => void mint(), Math.max(SETTLE_MS, due));
    return () => window.clearTimeout(id);
  }, [enabled, drop, pending, lives, coldStreak, mint, asked]);

  return { drop, claim, dismiss };
}
