import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import type { Profile } from './types'

/** A handle from an email address: ada.lovelace@x.com becomes adalovelace. */
function handleFrom(email: string | undefined): string {
  const base = (email ?? '').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
  return base.slice(0, 20) || 'member'
}

/**
 * Create the profile row for someone who does not have one yet.
 *
 * Normally the database trigger on auth.users has already done this. Some
 * Supabase projects will not let the SQL editor attach that trigger, so the app
 * does not depend on it: a signed-in user without a profile is recoverable
 * rather than a dead end.
 */
async function createProfile(userId: string, email: string | undefined, name: string) {
  const supabase = await supabaseServer()
  const base = handleFrom(email)

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const handle = attempt === 0 ? base : `${base}${attempt + 1}`
    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: userId, handle, full_name: name })
      .select('*')
      .maybeSingle()

    if (data) return data as Profile

    // 23505 is a duplicate handle — try the next one. Anything else is real.
    if (error?.code !== '23505') break
  }

  // A duplicate on the id itself means the trigger created it between our read
  // and our write, which is a success by another route.
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  return (existing as Profile) ?? null
}

/**
 * The signed-in person and their profile.
 *
 * Always getUser() rather than getSession(): the proxy's check is optimistic,
 * and anything that reads or writes data needs a user the auth server has
 * actually verified.
 */
export async function requireProfile(): Promise<{ profile: Profile; userId: string }> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profile) return { profile: profile as Profile, userId: user.id }

  const created = await createProfile(
    user.id,
    user.email,
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '',
  )

  if (!created) redirect('/login')

  return { profile: created, userId: user.id }
}

/** Same, but sends people who have not finished onboarding to finish it. */
export async function requireOnboardedProfile() {
  const session = await requireProfile()
  if (!session.profile.onboarded) redirect('/onboarding')
  return session
}
