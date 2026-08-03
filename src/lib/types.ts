// The shapes route handlers return. Anything a browser can see is in here,
// which is also the easiest way to check that `boxes.secret` never is — and
// that neither is its length, unless the player has paid to learn it.

import type { Breakdown, LengthHint } from "@/lib/game/feedback";
import type { Offering, Revealed } from "@/lib/game/power-ups";
import type { Design } from "@/lib/game/designs";
import type { Difficulty } from "@/lib/game/difficulty";

export type BoxStatus = "draft" | "funding" | "live" | "unlocked" | "closed";

/**
 * A box as anyone may see it.
 *
 * Note what is missing: the password's length, and anything that would give it
 * away. `estimatedAttempts` used to be here and had to go — it's a
 * deterministic function of the length, so shipping it handed over the exact
 * answer to the first thing a player has to work out. The difficulty tier
 * survives because it only narrows the length to a band of five or six, which
 * is the intended trade for making a box's cost legible before you commit
 * weeks to it.
 */
export interface PublicBox {
  slug: string;
  kind: "general" | "contributor";
  title: string;
  blurb: string | null;
  rewardKobo: number;
  /** True when there's no money behind it — a challenge, not a ₦0 reward. */
  isChallenge: boolean;
  /** Which safe it wears. Decoration; no rule reads it. */
  design: Design;
  difficulty: Difficulty;
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

/**
 * One guess and the verdict it earned.
 *
 * `breakdown` is null unless the hunt has bought Colour Read. That's enforced
 * where the record is built, not here and not in the browser — the components
 * simply don't travel until they've been paid for.
 */
export interface AttemptRecord {
  ordinal: number;
  value: string;
  lengthHint: LengthHint;
  /** 0–100, two decimal places. 100 means solved. */
  scorePercent: number;
  breakdown: Breakdown | null;
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
  /** True while Colour Read is in force; every attempt then carries a breakdown. */
  hasBreakdown: boolean;
  /** When that lapses, so the screen can count it down. Null when inactive. */
  breakdownUntil: string | null;
  /** While this is in the future, guesses on this box cost no lives. */
  secondWindUntil: string | null;
  /** The best score reached so far — the number a long hunt is measured by. */
  bestPercent: number;
  won: boolean;
}

export interface PlayView {
  box: PublicBox;
  player: PlayerState;
  hunt: HuntState | null;
  /**
   * The shelf, priced against *this* box. Every power-up costs a share of the
   * reward, so the same hint is a different price on a ₦7,000,000 safe and a
   * ₦7,000 one — which means the catalogue can't be a constant in the browser
   * and has to arrive with the view.
   */
  powerUps: Offering[];
  /** Set when this player already won this box. */
  claim: { amountKobo: number; status: "unclaimed" | "submitted" | "paid" } | null;
}

/** What comes back from spending a life on a guess. */
export interface AttemptResult extends PlayView {
  outcome: "open" | "won" | "pipped";
  verdict: { lengthHint: LengthHint; scorePercent: number } | null;
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
  /** Same reasoning: only the author sees the attempt estimate. */
  estimatedAttempts: number;
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
  /** 70% of everything players spent against this contributor's boxes. */
  totalKobo: number;
  last30dKobo: number;
  powerUpsSold: number;
  /** Their 70% of power-ups alone. */
  powerUpKobo: number;
  /** Their 70% of lives bought while hunting one of their boxes. */
  lifeKobo: number;
  livesSold: number;
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
