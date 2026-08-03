// The shapes route handlers return. Anything a browser can see is in here,
// which is also the easiest way to check that `boxes.secret` never is — and
// that neither is its length, unless the player has paid to learn it.

import type { LengthHint } from "@/lib/game/feedback";
import type { PowerUpKind, Revealed } from "@/lib/game/power-ups";
import type { Difficulty } from "@/lib/game/difficulty";

export type BoxStatus = "draft" | "funding" | "live" | "unlocked" | "closed";

/**
 * A box as anyone may see it.
 *
 * Note what is missing: the password's length. It is the first thing a player
 * has to work out, so it can't be sitting in a JSON payload. Difficulty and
 * the attempt estimate are derived from it server-side and shipped instead —
 * they narrow the length a little, which is the intended trade for making the
 * box's cost legible before you commit weeks to it.
 */
export interface PublicBox {
  slug: string;
  kind: "general" | "contributor";
  title: string;
  blurb: string | null;
  rewardKobo: number;
  /** True when there's no money behind it — a challenge, not a ₦0 reward. */
  isChallenge: boolean;
  difficulty: Difficulty;
  estimatedAttempts: number;
  status: BoxStatus;
  attemptsCount: number;
  playersCount: number;
  contributor: string | null;
  publishedAt: string | null;
  unlockedAt: string | null;
  /** Masked address of whoever cracked it, once someone has. */
  unlockedBy: string | null;
}

/** The player's own life pool, as the header shows it. */
export interface PlayerState {
  email: string | null;
  lives: number;
  livesMax: number;
  /** When the next life lands, or null when the pool is full. */
  nextLifeAt: string | null;
  lifePriceKobo: number;
}

/** One guess and the verdict it earned. */
export interface AttemptRecord {
  ordinal: number;
  value: string;
  lengthHint: LengthHint;
  exact: number;
  miscase: number;
  at: string;
}

/** The live state of one player's hunt on one box. */
export interface HuntState {
  attemptsCount: number;
  /** Newest first — a long hunt is read from the top. */
  attempts: AttemptRecord[];
  revealed: Revealed;
  /** Notes from power-ups already bought on this hunt, newest last. */
  notes: string[];
  won: boolean;
}

export interface PlayView {
  box: PublicBox;
  player: PlayerState;
  hunt: HuntState | null;
  powerUps: {
    kind: PowerUpKind;
    name: string;
    blurb: string;
    priceKobo: number;
    available: boolean;
  }[];
  /** Set when this player already won this box. */
  claim: { amountKobo: number; status: "unclaimed" | "submitted" | "paid" } | null;
}

/** What comes back from spending a life on a guess. */
export interface AttemptResult extends PlayView {
  outcome: "open" | "won" | "pipped";
  verdict: { lengthHint: LengthHint; exact: number; miscase: number } | null;
}

// ---------------------------------------------------------------------------
// Contributor dashboard
// ---------------------------------------------------------------------------

export interface ContributorProfile {
  displayName: string;
  handle: string;
  payout: {
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
    connected: boolean;
  };
}

/** One of the contributor's own boxes, with the numbers only they see. */
export interface OwnedBox extends PublicBox {
  id: string;
  /** What they paid in. The reward is 70% of this. */
  fundingKobo: number;
  platformFeeKobo: number;
  earnedKobo: number;
  powerUpsSold: number;
  /** Only a draft can be edited or deleted; a funded box is permanent. */
  editable: boolean;
  createdAt: string;
  /** The author's own copy of the length — they wrote it, so they know it. */
  length: number;
}

/** A row on the Attempts screen. The address is masked; it always is. */
export interface HuntRow {
  player: string;
  boxTitle: string;
  boxSlug: string;
  attempts: number;
  won: boolean;
  powerUpsBought: number;
  startedAt: string;
  lastAttemptAt: string | null;
}

export interface ContributorEarnings {
  /** 70% of every power-up sold against this contributor's boxes. */
  totalKobo: number;
  last30dKobo: number;
  powerUpsSold: number;
  /** What the platform kept, shown so the split is never a mystery. */
  platformKobo: number;
  sharePercent: number;
}

export interface WinnerRow {
  player: string;
  boxTitle: string;
  boxSlug: string;
  rewardKobo: number;
  unlockedAt: string;
  claimStatus: "unclaimed" | "submitted" | "paid";
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Every checkout in the app answers with this. */
export type CheckoutResponse =
  | { result: "redirect"; authorizationUrl: string }
  | { result: "error"; error: string };

export interface Bank {
  name: string;
  code: string;
}
