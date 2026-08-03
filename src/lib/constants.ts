// Platform-wide constants. The Postgres functions in supabase/migrations
// mirror the life economy (LIVES_MAX, LIFE_REGEN_MINUTES) — change both
// places together.

// ---------------------------------------------------------------------------
// The alphabet
// ---------------------------------------------------------------------------

/**
 * Every character a password can be built from: the 26 letters plus ten
 * specials. Uppercase only — a password is a *pattern*, not a word, and
 * asking a player to also guess the case would double the search space for
 * no extra fun.
 */
export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const SPECIALS = ["!", "@", "#", "$", "%", "&", "*", "?", "+", "="];
export const ALPHABET = [...LETTERS, ...SPECIALS];
export const ALPHABET_SET = new Set(ALPHABET);

// ---------------------------------------------------------------------------
// Password shape
// ---------------------------------------------------------------------------

export const MIN_LENGTH = 3;
export const MAX_LENGTH = 26;

/**
 * How many guesses a run gets. Longer passwords get more, but the ceiling
 * stops a 26-character box from being a formality — past that point the
 * difference is made up with power-ups, which is the point.
 */
export function guessesFor(length: number): number {
  return Math.min(Math.max(length + 6, 9), 20);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Everything money is stored in kobo (₦1 = 100 kobo). */
export const KOBO = 100;

/** Paystack caps a single transfer at ₦10,000,000, so a stake can't exceed it. */
export const MAX_STAKE_KOBO = 10_000_000 * KOBO;

/** What Spendbox keeps of a stake, and of every power-up sale. */
export const PLATFORM_SHARE_PERCENT = 30;

/** One life, bought rather than waited for. 100% of this is platform revenue. */
export const LIFE_PRICE_KOBO = 150 * KOBO;
export const LIFE_PURCHASE_MAX = 100;

// ---------------------------------------------------------------------------
// Lives
// ---------------------------------------------------------------------------

/**
 * Lives are held by the *player*, not by a box: one pool spent across the
 * public box and every contributor box alike. Losing a run costs one; the
 * pool refills on its own, so nobody ever has to pay to keep playing.
 */
export const LIVES_MAX = 15;
export const LIFE_REGEN_MINUTES = 60;

// ---------------------------------------------------------------------------
// Text shapes
// ---------------------------------------------------------------------------

export const TITLE_MAX = 70;
export const BLURB_MAX = 240;
export const DISPLAY_NAME_MAX = 40;

export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const HANDLE_REGEX = SLUG_REGEX;
export const ACCOUNT_NUMBER_REGEX = /^\d{10}$/;
