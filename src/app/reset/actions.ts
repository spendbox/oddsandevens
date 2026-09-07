'use server'

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type ResetState = { problem?: string; done?: boolean }

/**
 * Finish a password reset.
 *
 * Supabase has already signed this person in by the time they get here — that
 * is what clicking the emailed link does — so the only check needed is that
 * somebody is actually signed in. Without that, this would be a form for
 * changing a stranger's password.
 */
export async function chooseNewPassword(
  _state: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const password = String(formData.get('password') ?? '')
  if (password.length < 6) return { problem: 'Use a password of at least 6 characters.' }

  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      problem:
        'That reset link has expired. Ask for a new one from the sign-in page.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { problem: error.message }

  // The account now has a password, so email-only entry no longer opens it.
  const admin = supabaseAdmin()
  await admin.from('profiles').update({ password_set: true }).eq('id', user.id)

  redirect('/home')
}
