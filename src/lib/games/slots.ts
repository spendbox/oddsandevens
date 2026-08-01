// Turns the prizes a business typed into the prize slots the engine draws
// from. Shared by the builder (which submits them) and the builder's live
// preview (which simulates them), so what they play in the preview is exactly
// what their customers will play.

import type { PrizeDraft, PublicPrizeSlot } from "./types";

export interface PrizeRow {
  description: string;
  details: string;
  icon: string | null;
  expiryDays: number;
  stock: number;
  minScore: number;
}

const BLANK_LABELS = [
  "Not this time",
  "So close!",
  "Try again tomorrow",
  "Better luck next time",
];

/**
 * Chance games: the business picks how often someone should win, and that
 * percentage becomes weights — every real prize carries the same weight and
 * blank segments soak up the rest. Prizes and blanks are interleaved so
 * neighbouring wheel segments differ.
 */
export function buildChanceSlots(
  prizes: PrizeRow[],
  winPercent: number
): PrizeDraft[] {
  const realWeight = 100;
  const totalPrizeWeight = realWeight * prizes.length;
  const chance = Math.min(Math.max(winPercent, 1), 100) / 100;
  const blankTotal = Math.round((totalPrizeWeight * (1 - chance)) / chance);
  // A wheel reads best at around six segments.
  const blankCount =
    blankTotal <= 0 ? 0 : Math.max(2, Math.min(6 - prizes.length, 4));
  const perBlank = blankCount > 0 ? Math.round(blankTotal / blankCount) : 0;

  const blanks: PrizeDraft[] = Array.from({ length: blankCount }, (_, i) => ({
    kind: "blank" as const,
    description: BLANK_LABELS[i % BLANK_LABELS.length],
    weight: Math.max(perBlank, 1),
    stock: 0,
  }));

  const slots: PrizeDraft[] = [];
  const maxLength = Math.max(prizes.length, blanks.length);
  for (let i = 0; i < maxLength; i++) {
    if (i < prizes.length) {
      slots.push({
        kind: "prize",
        description: prizes[i].description,
        details: prizes[i].details || null,
        icon: prizes[i].icon,
        expiry_days: prizes[i].expiryDays,
        stock: prizes[i].stock,
        weight: realWeight,
        min_score: 0,
      });
    }
    if (i < blanks.length) slots.push(blanks[i]);
  }
  return slots;
}

/** Score games: one slot per prize, each with the score it takes to win it. */
export function buildScoreSlots(prizes: PrizeRow[]): PrizeDraft[] {
  return prizes.map((prize) => ({
    kind: "prize" as const,
    description: prize.description,
    details: prize.details || null,
    icon: prize.icon,
    expiry_days: prize.expiryDays,
    stock: prize.stock,
    weight: 1,
    min_score: prize.minScore,
  }));
}

/** The same slots as a player would receive them, for the preview. */
export function slotsAsPublic(slots: PrizeDraft[]): PublicPrizeSlot[] {
  return slots.map((slot, position) => ({
    position,
    kind: slot.kind,
    description: slot.description,
    details: slot.details ?? null,
    icon: slot.icon ?? null,
    minScore: slot.min_score ?? 0,
    soldOut: false,
  }));
}
