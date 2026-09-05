'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export type AuthState = { error: string | null }

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    next: String(formData.get('next') ?? '/home'),
  }
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, next } = readCredentials(formData)

  if (!email || !password) return { error: 'Enter your email and password.' }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return {
      error:
        error.message === 'Invalid login credentials'
          ? 'That email and password do not match an account.'
          : error.message,
    }
  }

  revalidatePath('/', 'layout')
  redirect(next.startsWith('/') ? next : '/home')
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password, name } = readCredentials(formData)

  if (!email || !password) return { error: 'Enter an email and a password.' }
  if (password.length < 8) return { error: 'Use at least 8 characters for your password.' }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  })

  if (error) return { error: error.message }

  // With email confirmation switched on there is no session yet, so say so
  // rather than dropping the person on a login screen with no explanation.
  if (!data.session) {
    return { error: 'Check your email to confirm your account, then sign in.' }
  }

  revalidatePath('/', 'layout')
  redirect('/onboarding')
}

export async function signOut() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
