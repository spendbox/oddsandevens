// The shapes route handlers return. Anything a browser can see is in here,
// which is also the easiest way to check that `boxes.secret` never is — and
// that neither is its length, unless the player has paid to learn it.

import type { Breakdown, LengthHint } from "@/lib/game/feedback";
import type { Offering, Revealed } from "@/lib/game/power-ups";
import type { Design } from "@/lib/game/designs";
import type { Difficulty } from "@/lib/game/difficulty";

export type BoxStatus = "draft" | "funding" | "live" | "unlocked" | "closed";

/**
 * A picture of the thing a sponsor is giving away, or a film of it.
 *
 * The kind is carried rather than inferred from the URL, because the choice
 * between an `<img>` and a `<video>` cannot be a guess: getting it wrong draws
 * a black rectangle where the reward should be, on the one surface that is
 * selling the box.
 */
export interface SponsorMedia {
  url: string;
  kind: "image" | "video";
}

/**
 * The business behind a box, and what they are putting in it.
 *
 * Two levels, and the nesting is the feature. A sponsor may have no prize —
 * a name and a logo on a safe we fund is a real arrangement and the easy one
 * to sell — but a prize may never have no sponsor. A winner has to know who
 * is sending them a thing, and "plus a mystery gift" is worth less on a card
 * than saying nothing at all.
 *
 * Nothing here affects play. A sponsored box scores identically, costs the
 * same lives, and pays the same money; this is what is drawn around it.
 */
export interface Sponsor {
  name: string;
  logoUrl: string | null;
  /** What the winner gets from them, on top of our money. */
  prize: {
    title: string;
    blurb: string | null;
    media: SponsorMedia | null;
  } | null;
}

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
  /**
   * 'promo' has been reaching every surface that reads this since 0059 — it is
   * a contributor's box whose password was drawn rather than written — and was
   * missing from this union, so a screen asking whether a box is a promo safe
   * was told the comparison could never be true.
   */
  kind: "general" | "contributor" | "promo";
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
  /**
   * The best score anybody has reached on this box, 0–100.
   *
   * The number to beat, and the only thing on the play screen that is about
   * somebody other than you. It names nobody and dates nothing — it says a
   * stranger once got this close, which is the whole of what a leaderboard is
   * for on a game with exactly one winner.
   */
  bestPercent: number;
  contributor: string | null;
  publishedAt: string | null;
  unlockedAt: string | null;
  /** Masked address of whoever cracked it, once someone has. */
  unlockedBy: string | null;
  /**
   * Picked out by an admin for the top of the landing page.
   *
   * Editorial rather than structural: the front page used to be "ours on top,
   * everyone else's below", which is a strange thing to hard-code when every
   * box plays identically. Cracking one clears the flag — a safe with nothing
   * left in it is a poor invitation.
   */
  featured: boolean;
  /**
   * The business behind it, when there is one.
   *
   * It rides on the box and travels with every `PublicBox` everywhere one
   * goes, rather than being looked up by the screens that happen to want it.
   * "Sponsored" is not a fact about one surface: a safe whose card names a
   * business and whose play screen doesn't is a safe somebody reasonably
   * thinks they misread.
   */
  sponsor: Sponsor | null;
}

/**
 * A box this player has open, for the strip above the board.
 *
 * Not a `PublicBox`: a box on the board is an invitation and is described by
 * what it's worth, while one of these is a thing already in progress and is
 * described by how far in you are. Different question, different shape, and
 * folding them together is what made the signed-in front page look exactly
 * like the signed-out one.
 */
export interface InPlayHunt {
  slug: string;
  title: string;
  design: Design;
  difficulty: Difficulty;
  rewardKobo: number;
  isChallenge: boolean;
  /** Guesses you have made at it. */
  attempts: number;
  /** Your best score on it, 0–100. */
  bestPercent: number;
  /** The best anybody has managed, so yours has something to sit against. */
  boxBestPercent: number;
  lastAttemptAt: string | null;
  /**
   * The business behind it, when there is one — the name alone.
   *
   * Not the whole `Sponsor`, and that is the same reasoning as everything else
   * on this shape: a resume card answers "how far in am I", so it carries the
   * least that still keeps the box honest. A card that shows a figure in gold
   * on a box whose reward is partly a thing would be understating it, and one
   * word fixes that. The logo, the picture and the description are a tap away
   * on the box itself, which is where somebody is going anyway.
   */
  sponsor: string | null;
}

/** The player's own life pool, as the header shows it. */
export interface PlayerState {
  email: string | null;
  lives: number;
  livesMax: number;
  /** When the next life lands, or null when the pool is full. */
  nextLifeAt: string | null;
  lifePriceKobo: number;
  /** Their own invite code. Null until they've verified an address. */
  inviteCode: string | null;
  /**
   * Bonus lives banked under the old invite terms, which land free on their
   * next paid top-up. An invite pays both sides immediately now, so this only
   * ever counts down.
   */
  bonusLivesPending: number;
  /**
   * Money off the next lives order, claimed from a drop and unspent.
   *
   * It lives on the player rather than on a box, because lives bought anywhere
   * work everywhere — and so that the lives dialog shows the same price
   * wherever it is opened from. A discount visible in the game and invisible
   * in the header would be a discount somebody is charged without being told.
   */
  lifeDiscount: { amount: number; expiresAt: string } | null;
}

/** What the invite screen shows: the link, and what it has earned so far. */
export interface ReferralState {
  inviteCode: string | null;
  /** People who used the link. Each one paid `bonus` lives to both sides. */
  joined: number;
  /**
   * Free lives banked under the old rules, still owed on the next paid top-up.
   * Nothing adds to this any more; it only drains.
   */
  bonusLivesPending: number;
  /** The terms, so the copy is never out of step with the migration. */
  bonus: number;
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

/**
 * Somebody else on the same safe.
 *
 * The play screen draws the top ten as a field of cars, so this is deliberately
 * the smallest thing that supports that: a masked address and how close they
 * are. No id, no dates, nothing that identifies anybody to anybody.
 */
export interface Rival {
  /** Masked before it leaves the server, always. */
  player: string;
  percent: number;
  /** True for the one that is you, so your car can be marked. */
  you: boolean;
}

/**
 * A drop: something that falls out of the sky mid-hunt and is gone in minutes.
 *
 * Minted server-side and claimed server-side. It exists as a row rather than a
 * browser-side coupon for the obvious reason — a discount the client names is
 * a discount the client can name itself.
 */
export type DropKind =
  | "free_lives"
  | "power_up_discount"
  | "free_second_wind"
  | "life_discount"
  /** Won on a streak day rather than minted mid-hunt, and free outright. */
  | "free_power_up";

export interface Drop {
  id: string;
  kind: DropKind;
  /** A count of lives, a percentage off, or an hour of Second Wind. */
  amount: number;
  /** Which power-up a discount applies to. Null for every other kind. */
  powerUp: string | null;
  expiresAt: string;
  /**
   * Won without a safe attached — a streak reward rather than a crate.
   *
   * This is the whole difference between a gift and a decision. A crate is
   * minted against the safe in front of you and applies itself; a floating
   * reward is worth "on whichever safe you like", so it waits to be spent.
   */
  floating: boolean;
}

/**
 * A discount already claimed and not yet spent — the thing a player is
 * *holding*, as opposed to the crate they were offered.
 *
 * It has its own ten minutes, starting from the claim, and the play screen
 * counts them down in front of them. A discount you were given and then
 * couldn't find is worse than no discount, and one that quietly expired while
 * you were reading the shelf is worse still.
 */
export interface ClaimedDiscount {
  /** The power-up it may be spent on, and only that one. */
  powerUp: string;
  /** Percent off. */
  amount: number;
  expiresAt: string;
}

export interface PlayView {
  box: PublicBox;
  player: PlayerState;
  hunt: HuntState | null;
  /** The top ten on this box, closest first. Includes you wherever you are. */
  rivals: Rival[];
  /** An unclaimed offer waiting, if there is one. */
  offer: Drop | null;
  /** A claimed discount still in its redemption window, if there is one. */
  discount: ClaimedDiscount | null;
  /** A week of the raised life ceiling, at whatever an admin has priced it. */
  lifeBankKobo: number;
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
}

/** A row on the Attempts screen. The address is masked; it always is. */
export interface HuntRow {
  player: string;
  boxTitle: string;
  boxSlug: string;
  attempts: number;
  won: boolean;
  powerUpsBought: number;
  /**
   * Their best score on this box, 0–100. The one number that says whether a
   * hunter is idly poking at a safe or three characters from opening it.
   *
   * Safe to show its author and nobody else: they wrote the password, so a
   * closeness reading tells them nothing about it they don't already know.
   */
  bestPercent: number;
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
  /** Transferred so far, from the payout ledger. */
  paidKobo: number;
  /** Earned minus paid: what is still coming. */
  owedKobo: number;
}

/** One transfer an admin has recorded against a contributor. */
export interface ContributorPayout {
  id: string;
  amountKobo: number;
  paidAt: string;
  note: string | null;
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
  | {
      result: "redirect";
      authorizationUrl: string;
      accessCode: string;
      reference: string;
    }
  | { result: "error"; error: string };

export interface Bank {
  name: string;
  code: string;
}
