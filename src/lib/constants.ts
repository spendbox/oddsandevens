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

/**
 * Every printable symbol a QWERTY keyboard can produce without a modifier
 * hunt — the full unshifted and shifted punctuation rows, and the space bar.
 *
 * Space was left out at first, on the grounds that it is invisible in a
 * monospaced field and a player who cannot see whether their guess ends in one
 * is being cheated rather than challenged. It is in now, because a password
 * game that forbids the most common character in a passphrase is a strange
 * game — and the objection is answered where it belongs, in the rendering:
 * every place a guess or a password is shown back, a space is drawn as `␣`.
 */
export const SPECIALS = [
  " ",
  "!", '"', "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/",
  ":", ";", "<", "=", ">", "?", "@", "[", "\\", "]", "^", "_", "`", "{", "|",
  "}", "~",
];

export const ALPHABET = [...UPPER, ...LOWER, ...DIGITS, ...SPECIALS];
export const ALPHABET_SET = new Set(ALPHABET);

/**
 * A password as it should be *shown*, with its spaces made visible.
 *
 * Never use the result for comparison or for filling a field — it is display
 * only, and `␣` is not in the alphabet.
 */
export function visible(value: string): string {
  return value.replace(/ /g, "␣");
}

/**
 * How many characters a player has to *distinguish between* at one position,
 * rather than how many exist.
 *
 * Case comes free once a position is found — a wrong-case hit is reported, so
 * `k` landing on `K` tells the player to stop searching and flip the case. So
 * the real per-position search is over case-folded classes: 26 letters, 10
 * digits and every symbol. This is what the difficulty estimate is built on.
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

/**
 * One life, bought rather than waited for.
 *
 * Bought from a box's page, 70% goes to that box's contributor — a hunter
 * grinding somebody's password is worth something to them whether or not any
 * power-up gets sold. Bought from the player's own page, where there is no box
 * to credit, the whole thing is platform revenue.
 */
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

// ---------------------------------------------------------------------------
// Text shapes
// ---------------------------------------------------------------------------

export const TITLE_MAX = 12;
export const BLURB_MAX = 30;
export const DISPLAY_NAME_MAX = 40;

export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const HANDLE_REGEX = SLUG_REGEX;
export const ACCOUNT_NUMBER_REGEX = /^\d{10}$/;

/**
 * Referrals, mirrored from `0029_referral_lives.sql`.
 *
 * The migration is the authority — the bonus is banked and spent by
 * `settle_life_purchase`, and nothing in the app grants a life. These exist so
 * copy can say "10" and "5" without a round trip, and must be changed together
 * with the functions of the same names.
 */
export const REFERRAL_MIN_LIVES = 10;
export const INVITER_BONUS_LIVES = 5;
export const INVITEE_BONUS_LIVES = 5;
