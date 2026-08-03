// Platform-wide constants. The Postgres functions in supabase/migrations
// mirror the life economy (LIVES_MAX, LIFE_REGEN_MINUTES) and the 70/30
// split — change both places together.

// ---------------------------------------------------------------------------
// The alphabet
// ---------------------------------------------------------------------------

/**
 * Everything a password can be built from.
 *
 * Case matters. `k` and `K` are different characters, which roughly squares
 * the search space against an uppercase-only alphabet, and is the single
 * biggest reason a box now takes hundreds of attempts rather than a dozen.
 */
export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
export const DIGITS = "0123456789".split("");
export const SPECIALS = ["!", "@", "#", "$", "%", "&", "*", "?", "+", "=", "-", "_"];

export const ALPHABET = [...UPPER, ...LOWER, ...DIGITS, ...SPECIALS];
export const ALPHABET_SET = new Set(ALPHABET);

/**
 * How many characters a player has to *distinguish between* at one position,
 * rather than how many exist.
 *
 * Case comes free once a position is found — a wrong-case hit is reported, so
 * `k` landing on `K` tells the player to stop searching and flip the case. So
 * the real per-position search is over case-folded classes: 26 letters, 10
 * digits, 12 specials. This is what the difficulty estimate is built on.
 */
export const CHARACTER_CLASSES = UPPER.length + DIGITS.length + SPECIALS.length;

// ---------------------------------------------------------------------------
// Password shape
// ---------------------------------------------------------------------------

export const MIN_LENGTH = 3;
export const MAX_LENGTH = 26;

/** How long a guess may be. Nothing stops a player probing past the maximum. */
export const MAX_GUESS_LENGTH = 40;

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Everything money is stored in kobo (₦1 = 100 kobo). */
export const KOBO = 100;

/** Paystack caps a single transfer at ₦10,000,000, so funding can't exceed it. */
export const MAX_FUNDING_KOBO = 10_000_000 * KOBO;

/** What Spendbox keeps of a box's funding, and of every power-up sale. */
export const PLATFORM_SHARE_PERCENT = 30;

/** One life, bought rather than waited for. 100% of this is platform revenue. */
export const LIFE_PRICE_KOBO = 150 * KOBO;
export const LIFE_PURCHASE_MAX = 100;

// ---------------------------------------------------------------------------
// Lives
// ---------------------------------------------------------------------------

/**
 * Lives are held by the *player*, not by a box: one pool spent across the
 * public box and every contributor box alike.
 *
 * One life buys one guess. There is no limit on how many guesses a box will
 * take — only on how fast a player can afford them — so the pool is small and
 * the refill is the pace of the whole game.
 */
export const LIVES_MAX = 7;
export const LIFE_REGEN_MINUTES = 60;

/**
 * The most attempts one player may make on one box in a rolling 24 hours.
 *
 * This is the anti-brute-force measure, and it works by making *time* the
 * scarce thing rather than money. The free refill supplies 24 lives a day, so
 * a paying player can push a single box to 50 and no further — roughly double
 * pace, never a thousand times it. A box that takes 600 attempts therefore
 * takes a fortnight at minimum no matter what anyone spends, and spends that
 * fortnight in public with everybody else free to beat them to it.
 *
 * Mirrored by `attempts_per_box_per_day()` in the migrations, which is where
 * it is actually enforced — a ceiling a second browser tab can race past is
 * not a ceiling.
 */
export const MAX_ATTEMPTS_PER_BOX_PER_DAY = 50;

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
