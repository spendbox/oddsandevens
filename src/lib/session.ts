import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'
import type { Profile } from './types'

function handleFrom(email: string | undefined): string {
  const base = (email ?? '').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()
  return base.slice(0, 20) || 'maker'
}

/**
 * Create the profile for someone who does not have one yet.
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
    if (error?.code !== '23505') break
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  return (existing as Profile) ?? null
}

/** The signed-in person. Always getUser(): the proxy's check is optimistic. */
export async function requireProfile(): Promise<{ profile: Profile; userId: string }> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/signin')

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

  // Without a profile there is nothing to render, and /signin would bounce
  // straight back here. Land somewhere that explains itself instead.
  if (!created) redirect('/signin?problem=profile')

  return { profile: created, userId: user.id }
}

/** The signed-in person, or null. For pages that work either way. */
export async function optionalProfile(): Promise<{ profile: Profile | null; userId: string | null }> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { profile: null, userId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return { profile: (profile as Profile) ?? null, userId: user.id }
}
