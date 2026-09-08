import 'server-only'
import { supabaseAdmin } from './supabase/admin'

/**
 * Accounts, and the two questions the sign-in form asks about one.
 *
 * Everybody signs up with an email and a password. Nobody is asked for a
 * username: a name is something you set later if you want other players to see
 * one, not a hurdle between somebody and the box link they just tapped.
 */

/** Is there already an account on this address? */
export async function accountExists(email: string): Promise<boolean> {
  const admin = supabaseAdmin()

  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  return Boolean(data)
}

/**
 * Change somebody's password.
 *
 * Goes through the admin API rather than the user's own client because the
 * account page offers it to somebody who is already signed in and should not
 * have to re-enter the old one to set a new one.
 */
export async function setPassword(userId: string, password: string): Promise<string | null> {
  if (password.length < 6) return 'Use a password of at least 6 characters.'

  const admin = supabaseAdmin()
  const { error } = await admin.auth.admin.updateUserById(userId, { password })

  if (error) return error.message

  await admin.from('profiles').update({ password_set: true }).eq('id', userId)
  return null
}

/** A friendly starting name from an email address. Changed later if they care. */
export function nameFromEmail(email: string | undefined | null): string {
  const local = (email ?? '').split('@')[0].replace(/[^a-z0-9]/gi, ' ').trim()
  if (!local) return 'Player'
  return local.charAt(0).toUpperCase() + local.slice(1, 20)
}
