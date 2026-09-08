'use server'

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { accountExists, nameFromEmail } from '@/lib/accounts'
import { emailConfigured } from '@/lib/email'
import { sendResetLink } from '@/lib/reset'
import { siteOrigin } from '@/lib/site'

/**
 * Signing in and signing up — an email and a password, and nothing else.
 *
 * Asked in two steps rather than as a tabbed form. Nobody arriving at a game
 * knows or cares whether they already have an account here; they know their
 * email address. So the first step takes that, works out which of the two this
 * is, and the second step asks for the right thing: your password, or a
 * password to choose.
 *
 * No username is ever asked for. A display name is derived from the address and
 * can be changed later on the account page, because a name field at the door is
 * a hurdle between somebody and the box link they just tapped.
 *
 * There is no confirmation email. That is a Supabase setting, not something
 * this code decides: Authentication → Sign In / Providers → Email → turn off
 * "Confirm email". If it is left on, signUp returns no session and the person
 * is stuck, so that exact case is detected and explained.
 */

export type EnterState = {
  problem?: string
  /** Which step the form is on, and for whom. */
  step?: 'email' | 'password' | 'create'
  email?: string
  sentReset?: boolean
}

function safeNext(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  // Only ever redirect inside this site. An open redirect on a sign-in form is
  // how phishing links get their credibility.
  return value.startsWith('/') && !value.startsWith('//') ? value : '/home'
}

/** Step one: who are you? */
export async function checkEmail(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email.includes('@') || email.length < 4) {
    return { step: 'email', problem: 'That does not look like an email address.' }
  }

  return { step: (await accountExists(email)) ? 'password' : 'create', email }
}

/** Step two, for somebody who already has an account. */
export async function signIn(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))

  if (!password) return { step: 'password', email, problem: 'Enter your password.' }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return {
      step: 'password',
      email,
      problem: error.message.toLowerCase().includes('invalid')
        ? 'That password does not match this account.'
        : error.message,
    }
  }

  redirect(next)
}

/** Step two, for somebody new. */
export async function signUp(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))

  if (password.length < 6) {
    return { step: 'create', email, problem: 'Use a password of at least 6 characters.' }
  }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return {
      step: 'create',
      email,
      problem: error.message.toLowerCase().includes('already')
        ? 'There is already an account with that email. Go back and sign in instead.'
        : error.message,
    }
  }

  if (!data.session) {
    return {
      step: 'create',
      email,
      problem:
        'The account was made, but Supabase is set to require an email confirmation. ' +
        'Turn it off under Authentication → Sign In / Providers → Email → "Confirm email", ' +
        'then sign in.',
    }
  }

  if (data.user) {
    const admin = supabaseAdmin()
    await admin.from('profiles').upsert(
      { id: data.user.id, email, display_name: nameFromEmail(email), password_set: true },
      { onConflict: 'id' },
    )
  }

  redirect(next)
}

/**
 * Send a reset link, through Resend.
 *
 * Always reports success, whether or not the address exists, whether or not
 * mail actually went out. Saying "no account with that email" turns this form
 * into a way to find out who has an account here, which is nobody's business.
 */
export async function sendReset(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email.includes('@')) return { step: 'email', problem: 'Enter your email address first.' }

  if (!emailConfigured()) {
    return {
      step: 'password',
      email,
      problem:
        'Password resets are not set up on this deployment: RESEND_API_KEY and EMAIL_FROM ' +
        'are missing.',
    }
  }

  const origin = await siteOrigin()

  try {
    await sendResetLink(email, origin)
  } catch {
    // Swallowed deliberately. A Resend outage must not turn into a message that
    // tells the sender whether that address has an account.
  }

  return { step: 'password', email, sentReset: true }
}

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/')
}
