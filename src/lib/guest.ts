import 'server-only'
import { supabaseAdmin } from './supabase/admin'
import { supabaseServer } from './supabase/server'
import { nameFromEmail } from './session'
import type { Profile } from './types'

/**
 * Getting somebody into a game with nothing but an email address.
 *
 * Somebody who taps a shared box link is here to play, not to fill in a form.
 * So an email alone is enough — and what it creates is not a second-class
 * "guest": it is a real account, with a real wallet and a real history, that
 * happens not to have a password yet. Everything they do is tracked from the
 * first tap, so when they later set a password nothing has to be migrated or
 * merged. It is the same account it always was.
 *
 * ── The rule that makes this safe ──────────────────────────────────────────
 *
 * An email is only enough while the account has no password. The moment
 * somebody sets one — which claiming a prize requires — email-only entry stops
 * working for that account and the password becomes the only way in. So an
 * account with a prize attached to it can never be opened by a stranger typing
 * the address.
 *
 * What remains, and is worth knowing: between topping up and setting a
 * password, unspent coins sit in an account that anyone who guesses the email
 * could open. The app pushes hard toward setting a password once there is a
 * balance, and requires one before any money comes out, but that window is the
 * price of letting people play without signing up.
 */

export type EntryResult =
  | { ok: true; profile: Profile; isNew: boolean }
  | { ok: false; needsPassword: true }
  | { ok: false; problem: string }

/** Does this email already belong to somebody, and have they set a password? */
async function findAccount(
  email: string,
): Promise<{ id: string; passwordSet: boolean } | null> {
  const admin = supabaseAdmin()

  const { data } = await admin
    .from('profiles')
    .select('id, password_set')
    .eq('email', email)
    .maybeSingle()

  if (!data) return null
  return { id: data.id, passwordSet: data.password_set }
}

/**
 * Sign somebody in without a password.
 *
 * Supabase has no "just make me a session" call, so this uses the one thing
 * that does exactly that: an admin-generated magic link, whose token is then
 * verified here on the server rather than being emailed anywhere. The player
 * never sees it and no mail is sent — it is a session hand-off between two
 * halves of our own backend.
 */
async function openSessionFor(email: string): Promise<boolean> {
  const admin = supabaseAdmin()

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (error || !data.properties?.hashed_token) return false

  const supabase = await supabaseServer()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })

  return !verifyError
}

/**
 * The front door. Hand it an email and it either seats the player or says why
 * it cannot.
 */
export async function enterWithEmail(rawEmail: string): Promise<EntryResult> {
  const email = rawEmail.trim().toLowerCase()

  if (!email.includes('@') || email.length < 4) {
    return { ok: false, problem: 'That does not look like an email address.' }
  }

  const existing = await findAccount(email)

  // They have a password, so the password is the way in. Nothing else will do.
  if (existing?.passwordSet) return { ok: false, needsPassword: true }

  const admin = supabaseAdmin()
  let userId = existing?.id ?? null
  const isNew = !existing

  if (!userId) {
    // email_confirm: true because there is no confirmation step in Spendbox by
    // design — see the note in the README about the Supabase setting.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })

    if (error || !data.user) {
      // Almost always: an auth user exists with no profile row beside it. Look
      // them up rather than telling a real player they cannot come in.
      const { data: page } = await admin.auth.admin.listUsers()
      const found = page?.users.find((user) => user.email?.toLowerCase() === email)
      if (!found) return { ok: false, problem: 'Could not start a game for that email.' }
      userId = found.id
    } else {
      userId = data.user.id
    }

    await admin.from('profiles').upsert(
      { id: userId, email, display_name: nameFromEmail(email), password_set: false },
      { onConflict: 'id' },
    )
  }

  if (!(await openSessionFor(email))) {
    return { ok: false, problem: 'Could not start a session. Try once more.' }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return { ok: false, problem: 'Could not load your player profile.' }

  return { ok: true, profile: profile as Profile, isNew }
}

/**
 * Turn a passwordless account into one with a password.
 *
 * This is the step that claiming a prize goes through, and the step that closes
 * email-only entry for this account for good. Both halves matter, so the flag
 * is written immediately after Supabase accepts the password.
 */
export async function setPassword(userId: string, password: string): Promise<string | null> {
  if (password.length < 6) return 'Use a password of at least 6 characters.'

  const admin = supabaseAdmin()
  const { error } = await admin.auth.admin.updateUserById(userId, { password })

  if (error) return error.message

  await admin.from('profiles').update({ password_set: true }).eq('id', userId)
  return null
}
