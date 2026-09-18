/**
 * What to call the person using this.
 *
 * ## Why a name at all
 *
 * The screen said "Notes", which is a filing cabinet's label. A tool somebody
 * has open all day should know whose it is — and the app already knows, or can
 * work it out, so asking them to type it in would be asking for something it
 * has.
 *
 * ## Why it is a guess, and always editable
 *
 * An email address is a good guess at a name and a bad certainty:
 * `ada.lovelace@…` is Ada, `a.l.99@…` is nobody, and plenty of people go by
 * something their work address has never heard of. So it is derived where it
 * can be, shown either way, and one press from being corrected — and what
 * somebody types always wins over what was worked out.
 *
 * No DOM and no storage in here: where the name is kept is `profile.ts`, and
 * every awkward address below is a unit test.
 */

/** How long a name may be before it is plainly not a name. */
const MAX = 24

/**
 * A first name out of an email address, or nothing.
 *
 * Nothing rather than a bad guess: "Hi, A_l99" is worse than "Hi" on its own,
 * and this is the one piece of copy on the screen that is about the person
 * reading it.
 */
export function nameFromEmail(email: string): string {
  const local = email.trim().toLowerCase().split('@')[0] ?? ''
  if (!local) return ''
  // The part before the first separator: "ada.lovelace" is Ada, and so is
  // "ada_lovelace", "ada-lovelace" and "ada+notes".
  const first = local.split(/[.\-_+]/).filter(Boolean)[0] ?? ''
  // Trailing digits are an account, not a name: "ada99" is still Ada.
  const cleaned = first.replace(/\d+$/, '')
  if (cleaned.length < 2 || cleaned.length > MAX) return ''
  // Anything left that is not a letter means this was never a name.
  if (!/^[a-z]+$/.test(cleaned)) return ''
  return cleaned[0].toUpperCase() + cleaned.slice(1)
}

/**
 * The greeting at the top of the notes.
 *
 * With no name it is "Hi there" rather than a blank or a "Hi," with nothing
 * after it — a greeting addressed to nobody reads as a bug, and the name is
 * one press away from being filled in.
 */
export function greeting(name: string): string {
  const trimmed = name.trim()
  return trimmed ? `Hi, ${trimmed}` : 'Hi there'
}
