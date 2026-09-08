import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import { supabaseAdmin } from './supabase/admin'
import { nameFromEmail } from './accounts'
import type { Profile } from './types'

/**
 * Fetch the profile for a signed-in user, creating it the first time.
 *
 * Written with the service-role client rather than a database trigger on
 * auth.users: some Supabase projects will not let the SQL editor attach that
 * trigger, and a signed-in person with no profile row should be something the
 * app recovers from, not a dead end.
 */
async function loadOrCreateProfile(userId: string, email: string): Promise<Profile | null> {
  const admin = supabaseAdmin()

  const { data: existing } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (existing) return existing as Profile

  const { data: created } = await admin
    .from('profiles')
    .insert({ id: userId, email, display_name: nameFromEmail(email) })
    .select('*')
    .maybeSingle()

  if (created) return created as Profile

  // Lost a race with another tab creating the same row. Read it back.
  const { data: raced } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  return (raced as Profile) ?? null
}

/**
 * The signed-in person, or a redirect to the sign-in page.
 *
 * Always getUser() rather than getSession(): the proxy's check is optimistic
 * and a cookie can say anything, so the one that asks Supabase is the one that
 * counts.
 */
export async function requireProfile(): Promise<{ profile: Profile; userId: string }> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/enter')

  const profile = await loadOrCreateProfile(user.id, user.email ?? '')

  // Without a profile there is nothing to render, and /enter would bounce
  // straight back here. Land somewhere that explains itself instead.
  if (!profile) redirect('/enter?problem=profile')

  return { profile, userId: user.id }
}

/** The signed-in person, or null. For pages that work either way — a box page. */
export async function optionalProfile(): Promise<Profile | null> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null
  return loadOrCreateProfile(user.id, user.email ?? '')
}

/**
 * Who is allowed into /admin.
 *
 * ADMIN_EMAILS is a comma-separated list, server-side only. An empty list means
 * nobody, because an unset variable must never open a door.
 *
 * That default is right and also the single most confusing thing about this
 * app to deploy: forget the variable and /admin returns a 404 that looks
 * exactly like the page not existing. So the two cases are told apart —
 * `adminsConfigured()` says whether anybody is on the list at all, and the page
 * explains itself when the answer is no.
 */
function adminList(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

/** Has anybody been named as an admin? */
export function adminsConfigured(): boolean {
  return adminList().length > 0
}

export function isAdmin(email: string): boolean {
  return adminList().includes(email.trim().toLowerCase())
}
