'use server'

import { redirect } from 'next/navigation'
import { consumeReset } from '@/lib/reset'

export type ResetState = { problem?: string }

/**
 * Finish a password reset.
 *
 * The token in the form is the only thing that says who this is. There is no
 * session here — unlike Supabase's own flow, following our link does not sign
 * anybody in, so a reset link that leaks cannot be used to read an account, only
 * to set a password on it once and then be spent.
 */
export async function chooseNewPassword(
  _state: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const again = String(formData.get('password_again') ?? '')

  if (password !== again) return { problem: 'Those two passwords are not the same.' }

  const problem = await consumeReset(token, password)
  if (problem) return { problem }

  redirect('/enter?reset=1')
}
