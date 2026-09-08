import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from './supabase/admin'
import { sendEmail, emailShell } from './email'

/**
 * Password resets, end to end.
 *
 * The token is 32 random bytes. The player gets it in a link; the database gets
 * only its SHA-256. So the row cannot be turned back into a working link, and a
 * reset can be used exactly once because consuming it stamps `used_at` in the
 * same conditional update that finds it.
 *
 * Plain SHA-256 rather than a slow password hash is the right call here and not
 * a shortcut: this is 256 bits of true randomness with a 45-minute life, not a
 * human-chosen password, so there is nothing to brute-force and nothing for a
 * work factor to protect.
 */

const LIFETIME_MINUTES = 45

/**
 * How many resets one account may ask for in an hour before we stop sending.
 *
 * Six rather than three: three is plenty to stop this being used as a way to
 * post mail to somebody, and not plenty when the person hitting the button is
 * the one who just deployed it and is testing.
 */
const MAX_PER_HOUR = 6

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Start a reset and email the link.
 *
 * Reports nothing back about whether the address exists. Telling the caller
 * "no account with that email" turns the forgot-password form into a way to
 * find out who has an account here, which is nobody's business — so every
 * outcome, including the rate-limited one, looks the same from outside.
 */
export type ResetOutcome =
  | 'sent'
  | 'no-such-account'
  | 'rate-limited'
  | 'token-write-failed'
  | 'send-failed'

export async function sendResetLink(rawEmail: string, origin: string): Promise<ResetOutcome> {
  const email = rawEmail.trim().toLowerCase()

  /**
   * Say what happened, to the server log only.
   *
   * This function used to have three bare `return`s in it — no account, rate
   * limited, token write failed — and every one of them meant no email and no
   * trace of why. From the outside that is indistinguishable from a broken
   * mailer, and it is exactly how a rate limit spent an afternoon looking like
   * an outage. The browser still learns nothing either way; the operator now
   * learns everything.
   */
  const report = (outcome: ResetOutcome, detail?: unknown): ResetOutcome => {
    const line = `[spendbox] password reset for ${email}: ${outcome}`
    if (outcome === 'sent') console.log(line)
    else console.error(line, detail ?? '')
    return outcome
  }

  const admin = supabaseAdmin()

  const { data: profile, error: lookupError } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('email', email)
    .maybeSingle()

  if (lookupError) return report('token-write-failed', lookupError)
  if (!profile) return report('no-such-account')

  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('password_resets')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .gte('created_at', anHourAgo)

  if ((count ?? 0) >= MAX_PER_HOUR) {
    return report('rate-limited', `${count} in the last hour, limit ${MAX_PER_HOUR}`)
  }

  const token = randomBytes(32).toString('hex')

  const { error: insertError } = await admin.from('password_resets').insert({
    user_id: profile.id,
    token_hash: hashOf(token),
    expires_at: new Date(Date.now() + LIFETIME_MINUTES * 60 * 1000).toISOString(),
  })

  // Almost always: migration 0005 has not been run, so the table is not there.
  if (insertError) return report('token-write-failed', insertError)

  const link = `${origin}/reset?token=${token}`
  const name = profile.display_name || 'there'

  try {
    await sendEmail({
      to: email,
      subject: 'Reset your Spendbox password',
      html: emailShell({
        heading: 'Choose a new password',
        body:
          `Hi ${escapeHtml(name)}, here is the link to set a new password on your ` +
          `Spendbox account. It works once and expires in ${LIFETIME_MINUTES} minutes.`,
        buttonLabel: 'Set a new password',
        buttonUrl: link,
        footer:
          'Did not request this? Ignore this email — nothing has changed and your current ' +
          'password still works.',
      }),
      text:
        `Hi ${name},\n\n` +
        `Here is the link to set a new password on your Spendbox account. ` +
        `It works once and expires in ${LIFETIME_MINUTES} minutes.\n\n${link}\n\n` +
        `Did not request this? Ignore this email. Nothing has changed.`,
    })
  } catch (error) {
    return report('send-failed', error)
  }

  return report('sent')
}

/** Escape text going into the HTML body of an email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type ResetCheck =
  | { ok: true; userId: string; resetId: string }
  | { ok: false; problem: string }

const EXPIRED =
  'That reset link has expired or has already been used. Ask for a new one from the sign-in page.'

/**
 * Is this token good, and whose is it?
 *
 * Does not consume it — the reset page calls this to decide whether to show the
 * form at all, and consuming here would burn the link on a page view.
 */
export async function checkResetToken(token: string): Promise<ResetCheck> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { ok: false, problem: EXPIRED }

  const admin = supabaseAdmin()
  const { data } = await admin
    .from('password_resets')
    .select('id, user_id, expires_at, used_at, token_hash')
    .eq('token_hash', hashOf(token))
    .maybeSingle()

  if (!data) return { ok: false, problem: EXPIRED }
  if (data.used_at) return { ok: false, problem: EXPIRED }
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, problem: EXPIRED }

  // The lookup was by hash so this can only match, but comparing in constant
  // time costs nothing and keeps the habit where it belongs.
  const given = Buffer.from(data.token_hash, 'utf8')
  const mine = Buffer.from(hashOf(token), 'utf8')
  if (given.length !== mine.length || !timingSafeEqual(given, mine)) {
    return { ok: false, problem: EXPIRED }
  }

  return { ok: true, userId: data.user_id, resetId: data.id }
}

/**
 * Spend the token and set the new password.
 *
 * The stamp on `used_at` is a conditional update that only matches while the
 * token is still unused, so two tabs submitting the same link cannot both go
 * through. Only the one that wins that update changes the password.
 */
export async function consumeReset(
  token: string,
  password: string,
): Promise<string | null> {
  if (password.length < 6) return 'Use a password of at least 6 characters.'

  const check = await checkResetToken(token)
  if (!check.ok) return check.problem

  const admin = supabaseAdmin()

  const { data: claimed } = await admin
    .from('password_resets')
    .update({ used_at: new Date().toISOString() })
    .eq('id', check.resetId)
    .is('used_at', null)
    .select('id')
    .maybeSingle()

  if (!claimed) return EXPIRED

  const { error } = await admin.auth.admin.updateUserById(check.userId, { password })
  if (error) return error.message

  // The account now has a password, so email-only entry no longer opens it.
  await admin.from('profiles').update({ password_set: true }).eq('id', check.userId)

  // Every other outstanding reset for this person is now stale.
  await admin
    .from('password_resets')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', check.userId)
    .is('used_at', null)

  return null
}
