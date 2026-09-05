import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import type { Profile } from './types'

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

  // The database trigger creates a profile on sign-up, so a missing one means
  // something went wrong rather than "new user". Sending them to onboarding is
  // the recoverable path.
  if (!profile) redirect('/onboarding')

  return { profile: profile as Profile, userId: user.id }
}

/** Same, but sends people who have not finished onboarding to finish it. */
export async function requireOnboardedProfile() {
  const session = await requireProfile()
  if (!session.profile.onboarded) redirect('/onboarding')
  return session
}
