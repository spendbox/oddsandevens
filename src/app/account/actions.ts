'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export type AccountState = { problem?: string; saved?: boolean }

/**
 * Save a name and the bank account a win should be sent to.
 *
 * Written through the signed-in user's own client, so the "id = auth.uid()"
 * policy is what limits it to their own row. The coins column is in this table
 * too and is deliberately not touched here — the database trigger would refuse
 * it anyway.
 */
export async function saveAccount(
  _state: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const displayName = String(formData.get('display_name') ?? '').trim().slice(0, 40)
  const bankName = String(formData.get('bank_name') ?? '').trim().slice(0, 60)
  const accountName = String(formData.get('account_name') ?? '').trim().slice(0, 80)
  const accountNumber = String(formData.get('account_number') ?? '').replace(/\D/g, '').slice(0, 10)

  if (accountNumber && accountNumber.length !== 10) {
    return { problem: 'A Nigerian account number is 10 digits.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName || profile.display_name,
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber,
    })
    .eq('id', profile.id)

  if (error) return { problem: 'Could not save that. Try again.' }

  revalidatePath('/account')
  return { saved: true }
}
