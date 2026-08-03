// The shapes route handlers return. Anything a browser can see is in here,
// which is also the easiest way to check that `boxes.secret` never is.

import type { PowerUpKind, Revealed } from "@/lib/game/power-ups";

export type BoxStatus = "draft" | "funding" | "live" | "unlocked" | "closed";

/** A box as anyone may see it: no password, no funding detail. */
export interface PublicBox {
  slug: string;
  kind: "general" | "contributor";
  title: string;
  blurb: string | null;
  length: number;
  guessesAllowed: number;
  prizeKobo: number;
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

export interface GuessRow {
  value: string;
  feedback: string;
}

/** The live state of one player's attempt on one box. */
export interface RunState {
  runId: string;
  status: "active" | "won" | "lost";
  guessesAllowed: number;
  guessesUsed: number;
  guesses: GuessRow[];
  revealed: Revealed;
  /** Notes from power-ups already bought on this run, newest last. */
  notes: string[];
}

export interface PlayView {
  box: PublicBox;
  player: PlayerState;
  run: RunState | null;
  powerUps: {
    kind: PowerUpKind;
    name: string;
    blurb: string;
    priceKobo: number;
    available: boolean;
  }[];
  /** Set when this player already won this box. */
  prize: { amountKobo: number; status: "unclaimed" | "submitted" | "paid" } | null;
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
  stakeKobo: number;
  platformFeeKobo: number;
  earnedKobo: number;
  powerUpsSold: number;
  createdAt: string;
}

/** A row on the Attempts screen. The address is masked; it always is. */
export interface AttemptRow {
  player: string;
  boxTitle: string;
  boxSlug: string;
  status: "active" | "won" | "lost";
  guessesUsed: number;
  guessesAllowed: number;
  powerUpsBought: number;
  startedAt: string;
  endedAt: string | null;
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
  prizeKobo: number;
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
