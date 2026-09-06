'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export type AuthState = { error: string | null }

/** Turn Supabase's wording into something the person reading it can act on. */
function readable(message: string): string {
  const text = message.toLowerCase()

  if (text.includes('fetch failed') || text.includes('failed to fetch') || text.includes('network')) {
    return (
      'Could not reach the Supabase project. This is a settings problem, not your password. ' +
      'Check NEXT_PUBLIC_SUPABASE_URL matches the Project URL in Supabase (Project Settings → API), ' +
      'that the project is not paused, and redeploy afterwards — the value is read when the site is built.'
    )
  }
  if (text.includes('invalid api key') || text.includes('no api key')) {
    return 'Supabase rejected the API key. Copy the "anon"/"publishable" key from Project Settings → API into NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.'
  }
  if (text.includes('email not confirmed')) {
    return 'This account has not confirmed its email. To skip confirmation entirely, turn off Supabase → Authentication → Sign In / Providers → Email → "Confirm email", then sign in again.'
  }
  if (text.includes('invalid login credentials')) return 'That email and password do not match an account.'
  if (text.includes('already registered')) return 'There is already an account with that email. Sign in instead.'
  if (text.includes('database error saving new user')) {
    return 'Supabase could not create the account. This usually means the Forge tables are missing — run the files in supabase/migrations, then try again.'
  }
  return message
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/tools')

  if (!email || !password) return { error: 'Enter your email and password.' }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: readable(error.message) }

  revalidatePath('/', 'layout')
  redirect(next.startsWith('/') ? next : '/tools')
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const name = String(formData.get('name') ?? '').trim()

  if (!email || !password) return { error: 'Enter an email and a password.' }
  if (password.length < 8) return { error: 'Use at least 8 characters for your password.' }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  })

  if (error) return { error: readable(error.message) }

  if (data.session) {
    revalidatePath('/', 'layout')
    redirect('/new')
  }

  // No session came back. Some projects still let the account sign in straight
  // away, so try rather than assuming the worst.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (!signInError) {
    revalidatePath('/', 'layout')
    redirect('/new')
  }

  return {
    error:
      'Your account was created, but Supabase is set to require email confirmation before you can ' +
      'sign in. Turn it off in Supabase → Authentication → Sign In / Providers → Email → uncheck ' +
      '"Confirm email" and save. Then come back and sign in — no need to sign up again.',
  }
}

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
