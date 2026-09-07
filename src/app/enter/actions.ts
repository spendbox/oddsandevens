'use server'

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { nameFromEmail } from '@/lib/session'

/**
 * Signing in and signing up, with an email address and a password and nothing
 * else. No confirmation link, no magic link, no waiting on an inbox — somebody
 * who has just been sent a box link should be playing within seconds.
 *
 * That "no confirmation" part is a Supabase setting, not something this code
 * can decide: Authentication → Sign In / Providers → Email → turn off "Confirm
 * email". If it is left on, signUp returns no session and the person is stuck
 * looking at a screen telling them to check an inbox. So this checks for that
 * exact case and says what to do about it, rather than failing silently.
 */

export type EnterState = { problem?: string }

function cleanNext(raw: FormData['get'] extends never ? never : unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  // Only ever redirect inside this site. An open redirect on a sign-in form is
  // how phishing links get their credibility.
  return value.startsWith('/') && !value.startsWith('//') ? value : '/home'
}

export async function signIn(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = cleanNext(formData.get('next'))

  if (!email || !password) return { problem: 'Enter your email and your password.' }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return {
      problem:
        error.message.toLowerCase().includes('invalid')
          ? 'That email and password do not match an account.'
          : error.message,
    }
  }

  redirect(next)
}

export async function signUp(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const next = cleanNext(formData.get('next'))

  if (!email.includes('@')) return { problem: 'That does not look like an email address.' }
  if (password.length < 6) return { problem: 'Use a password of at least 6 characters.' }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  })

  if (error) {
    return {
      problem: error.message.toLowerCase().includes('already')
        ? 'There is already an account with that email. Sign in instead.'
        : error.message,
    }
  }

  if (!data.session) {
    return {
      problem:
        'The account was made, but Supabase is set to require an email confirmation. ' +
        'Turn it off under Authentication → Sign In / Providers → Email → "Confirm email", ' +
        'then sign in.',
    }
  }

  // Give the profile the name they typed rather than one guessed from the
  // email. Done here because loadOrCreateProfile only ever guesses.
  if (data.user) {
    const admin = supabaseAdmin()
    await admin.from('profiles').upsert(
      {
        id: data.user.id,
        email,
        display_name: name || nameFromEmail(email),
      },
      { onConflict: 'id' },
    )
  }

  redirect(next)
}

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/')
}
