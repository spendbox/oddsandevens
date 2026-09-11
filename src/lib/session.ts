import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import { supabaseAdmin } from './supabase/admin'
import { supabaseConfigured } from './supabase/env'
import { nameFromEmail } from './accounts'
import { welcomeCoin } from './welcome'
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

  if (created) {
    // The free coin, at the one moment there is such a thing as a new account.
    // It never throws and it never blocks: somebody whose connection has had
    // its share still gets in, they just get in with an empty wallet.
    const given = await welcomeCoin(userId)

    // The row above was read before the coin landed, so it says zero. Handing
    // that back sends somebody who has just been given a coin to a screen
    // telling them they have none, and they reload to find out we were lying —
    // which is worse than not giving them one at all. The database has just
    // added exactly this much to a wallet nothing else can have touched yet.
    return { ...(created as Profile), coins: (created as Profile).coins + given }
  }

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
 *
 * With no Supabase settings there is nobody to be signed in as and /enter would
 * fail the same way, so it goes somewhere that explains itself instead of
 * looping or showing a stack trace.
 */
export async function requireProfile(): Promise<{ profile: Profile; userId: string }> {
  if (!supabaseConfigured()) redirect('/setup')

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

/**
 * The signed-in person, or null. For pages that work either way — a box page.
 *
 * Never throws, which is the whole point of it: the landing page and every box
 * page call this, and those two have to render for a stranger on a bad
 * connection whatever state the deployment is in. A missing setting or a
 * Supabase that will not answer means "nobody is signed in", not "no page".
 */
export async function optionalProfile(): Promise<Profile | null> {
  if (!supabaseConfigured()) return null

  try {
    const supabase = await supabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null
    return await loadOrCreateProfile(user.id, user.email ?? '')
  } catch (error) {
    console.warn(
      '[spendbox] could not work out who is signed in: ' +
        (error instanceof Error ? error.message : String(error)),
    )
    return null
  }
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
