// Reading boxes out of the database without ever reading the password out
// with them — nor, on player-facing surfaces, its length.

import { randomBytes, randomInt } from "node:crypto";
import { ALPHABET, LIVES_MAX, LIFE_PRICE_KOBO, LIFE_REGEN_MINUTES } from "@/lib/constants";
import { maskEmail } from "@/lib/mask";
import { difficultyOf } from "@/lib/game/difficulty";
import { toDesign } from "@/lib/game/designs";
import { isChallenge } from "@/lib/game/rewards";
import type { PlayerState, PublicBox } from "@/lib/types";

/**
 * The columns a box may be selected with.
 *
 * `secret` is absent on purpose and should stay that way — the only thing
 * allowed to read it is `score_attempt` inside Postgres and the power-up
 * settlement, which fetches it on its own. `length` is here because the server
 * needs it to derive difficulty; `toPublicBox` is what makes sure it doesn't
 * travel any further.
 */
export const PUBLIC_BOX_COLUMNS =
  "id, kind, slug, title, blurb, length, reward_kobo, design, status, attempts_count, players_count, best_percent, published_at, unlocked_at, unlocked_by, contributor_id, featured_at";

export interface BoxRow {
  id: string;
  kind: "general" | "contributor";
  slug: string;
  title: string;
  blurb: string | null;
  length: number;
  reward_kobo: number;
  design: string;
  status: PublicBox["status"];
  attempts_count: number;
  players_count: number;
  best_percent: string | number;
  published_at: string | null;
  unlocked_at: string | null;
  unlocked_by: string | null;
  contributor_id: string | null;
  featured_at: string | null;
}

/**
 * A box as a browser may see it.
 *
 * The length goes in and does not come out — nor does anything invertible back
 * to it. What comes out is the difficulty tier, which places the length in a
 * band of five or six: enough to decide whether a box is worth your month, not
 * enough to skip the first thing you have to work out.
 */
export function toPublicBox(
  row: BoxRow,
  extras: { contributor?: string | null; winnerEmail?: string | null } = {}
): PublicBox {
  return {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    blurb: row.blurb,
    rewardKobo: row.reward_kobo,
    isChallenge: isChallenge(row.reward_kobo),
    design: toDesign(row.design),
    difficulty: difficultyOf(row.length),
    status: row.status,
    attemptsCount: row.attempts_count,
    playersCount: row.players_count,
    // `numeric` arrives as a string from PostgREST, and a string here would
    // reach the scene as a width in percent that silently never animates.
    bestPercent: Number(row.best_percent ?? 0),
    contributor: extras.contributor ?? null,
    publishedAt: row.published_at,
    unlockedAt: row.unlocked_at,
    unlockedBy: extras.winnerEmail ? maskEmail(extras.winnerEmail) : null,
    featured: !!row.featured_at,
  };
}

export interface PlayerRow {
  id: string;
  email: string;
  lives: number;
  lives_accrued_at: string;
  invite_code: string | null;
  /** Referral bonus banked, waiting for their next paid top-up. */
  bonus_lives_pending: number;
}

/**
 * Find or create the player behind a verified address, lives brought current.
 *
 * `ensure_player` returns a composite row rather than a set, and PostgREST is
 * entitled to hand that back either as a bare object or wrapped in a
 * single-element array depending on how the call is framed. Rather than betting
 * on one shape at four call sites, this normalises both — and returns null
 * instead of throwing, because a player row failing to materialise should
 * degrade to "not signed in", not to a 500 in the middle of a game.
 */
export async function ensurePlayer(
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> },
  email: string
): Promise<PlayerRow | null> {
  const { data } = await db.rpc("ensure_player", { p_email: email });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as PlayerRow | null) ?? null;
}

export function toPlayerState(
  player: PlayerRow | null,
  email: string | null,
  /** Things that need their own query, so the callers that can, pass them. */
  extras: { lifeDiscount?: PlayerState["lifeDiscount"] } = {}
): PlayerState {
  if (!player) {
    return {
      email,
      lives: LIVES_MAX,
      livesMax: LIVES_MAX,
      nextLifeAt: null,
      lifePriceKobo: LIFE_PRICE_KOBO,
      inviteCode: null,
      bonusLivesPending: 0,
      lifeDiscount: null,
    };
  }
  const full = player.lives >= LIVES_MAX;
  return {
    email,
    lives: player.lives,
    livesMax: LIVES_MAX,
    nextLifeAt: full
      ? null
      : new Date(
          new Date(player.lives_accrued_at).getTime() + LIFE_REGEN_MINUTES * 60_000
        ).toISOString(),
    lifePriceKobo: LIFE_PRICE_KOBO,
    inviteCode: player.invite_code ?? null,
    bonusLivesPending: player.bonus_lives_pending ?? 0,
    lifeDiscount: extras.lifeDiscount ?? null,
  };
}

/**
 * A URL-safe slug for a new box, seeded from its title so the share link reads
 * like something. Collisions are possible in principle, so the caller retries.
 */
export function slugify(title: string): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  const tail = randomBytes(3).toString("hex");
  return stem ? `${stem}-${tail}` : `box-${tail}`;
}

/** Suggests a password of the requested length. Contributors may ignore it. */
export function suggestSecret(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Paystack references have to be unique per transaction, forever. */
export function newReference(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}
