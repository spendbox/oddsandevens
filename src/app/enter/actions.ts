'use server'

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { enterWithEmail } from '@/lib/guest'
import { siteOrigin } from '@/lib/site'

/**
 * Getting in.
 *
 * There is one field to start with: an email address. If that address has no
 * password, the player is simply let in — see src/lib/guest.ts for why that is
 * safe and where it stops. If it does have one, the form asks for it.
 *
 * Nobody is ever sent away to check an inbox before they can play. The only
 * email Spendbox sends is a password reset, and only when asked for.
 */

export type EnterState = {
  problem?: string
  /** The form asks for a password once we know the account has one. */
  needsPassword?: boolean
  email?: string
  sentReset?: boolean
}

function safeNext(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  // Only ever redirect inside this site. An open redirect on a sign-in form is
  // how phishing links get their credibility.
  return value.startsWith('/') && !value.startsWith('//') ? value : '/home'
}

/** Step one: an email, and nothing else. */
export async function enter(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = safeNext(formData.get('next'))

  const result = await enterWithEmail(email)

  if (!result.ok) {
    if ('needsPassword' in result) return { needsPassword: true, email }
    return { problem: result.problem, email }
  }

  redirect(next)
}

/** Step two, only for accounts that have a password. */
export async function enterWithPassword(
  _state: EnterState,
  formData: FormData,
): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))

  if (!password) return { needsPassword: true, email, problem: 'Enter your password.' }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return {
      needsPassword: true,
      email,
      problem: error.message.toLowerCase().includes('invalid')
        ? 'That password does not match this account.'
        : error.message,
    }
  }

  redirect(next)
}

/**
 * Send a reset link.
 *
 * Always reports success, whether or not the address exists. Saying "no account
 * with that email" turns this form into a way to find out who has an account
 * here, which is nobody's business.
 */
export async function sendReset(_state: EnterState, formData: FormData): Promise<EnterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email.includes('@')) return { problem: 'Enter your email address first.', email }

  const supabase = await supabaseServer()
  const origin = await siteOrigin()

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset`,
  })

  return { sentReset: true, email }
}

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/')
}
