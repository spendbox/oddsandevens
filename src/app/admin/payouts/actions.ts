'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Tick a payout off once the transfer has actually been sent from Paystack.
 *
 * The authorisation check is here, in the action, not only on the page that
 * renders the button. A server action is a POST endpoint that anyone can find,
 * so hiding the button hides nothing.
 */
export async function markPaid(formData: FormData) {
  const { profile } = await requireProfile()
  if (!isAdmin(profile.email)) throw new Error('Not allowed.')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const admin = supabaseAdmin()
  await admin
    .from('payouts')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')

  revalidatePath('/admin/payouts')
}
