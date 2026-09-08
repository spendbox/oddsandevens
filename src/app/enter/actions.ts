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

/**
 * Every step of the form, behind one action.
 *
 * Deliberately not four separate actions with four separate useActionState
 * hooks. That is how it was, and it had a bug worth remembering: each hook kept
 * its own last result, so after going back to change the email the sign-in
 * hook was still reporting "you are on the password step" and the screen never
 * moved. With one action there is exactly one answer to "which step is this",
 * and no stale one to disagree with it.
 */
export async function enterStep(_state: EnterState, formData: FormData): Promise<EnterState> {
  const intent = String(formData.get('intent') ?? 'check')
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))

  // Going back to the first step. Nothing to validate; nothing to remember.
  if (intent === 'back') return { step: 'email' }

  if (intent === 'reset') {
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
      // Reports its own outcome to the server log, every branch of it.
      await sendResetLink(email, origin)
    } catch (error) {
      // The browser is told nothing either way — saying "that failed" would
      // reveal that the address has an account. But it goes to the server log,
      // because the alternative is what actually happened: EMAIL_FROM was on a
      // domain we do not own, Resend rejected every send, and nothing anywhere
      // said so.
      console.error('[spendbox] password reset email failed:', error)
    }

    return { step: 'password', email, sentReset: true }
  }

  if (intent === 'check') {
    if (!email.includes('@') || email.length < 4) {
      return { step: 'email', email, problem: 'That does not look like an email address.' }
    }
    return { step: (await accountExists(email)) ? 'password' : 'create', email }
  }

  const supabase = await supabaseServer()

  if (intent === 'signin') {
    if (!password) return { step: 'password', email, problem: 'Enter your password.' }

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

  // Signing up.
  if (password.length < 6) {
    return { step: 'create', email, problem: 'Use a password of at least 6 characters.' }
  }

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

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/')
}
