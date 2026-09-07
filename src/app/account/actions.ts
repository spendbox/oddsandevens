'use server'

import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { resolveAccount, PaystackError } from '@/lib/paystack'
import { setPassword } from '@/lib/guest'

export type AccountState = { problem?: string; saved?: boolean }

export async function saveDisplayName(
  _state: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const displayName = String(formData.get('display_name') ?? '').trim().slice(0, 40)
  if (!displayName) return { problem: 'Give yourself a name.' }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', profile.id)

  if (error) return { problem: 'Could not save that. Try again.' }

  revalidatePath('/account')
  return { saved: true }
}

export type BankState = {
  problem?: string
  /** The name the bank gave back, shown for confirmation before it is used. */
  accountName?: string
  saved?: boolean
}

/**
 * Check a bank account really exists, then save it.
 *
 * The account name is never taken from the player. It comes back from
 * Paystack's name enquiry against NIBSS — the bank's own answer to "who owns
 * this number?" — and that is what gets stored. A mistyped digit fails here,
 * loudly, rather than six weeks later when a ₦100,000 transfer goes to a
 * stranger and cannot be recalled.
 */
export async function verifyAndSaveBank(
  _state: BankState,
  formData: FormData,
): Promise<BankState> {
  const { profile } = await requireProfile()

  const bankCode = String(formData.get('bank_code') ?? '').trim()
  const bankName = String(formData.get('bank_name') ?? '').trim().slice(0, 80)
  const accountNumber = String(formData.get('account_number') ?? '').replace(/\D/g, '')

  if (!bankCode) return { problem: 'Choose your bank.' }
  if (accountNumber.length !== 10) {
    return { problem: 'A Nigerian account number is exactly 10 digits.' }
  }

  let accountName: string
  try {
    const resolved = await resolveAccount({ accountNumber, bankCode })
    accountName = resolved.account_name
  } catch (error) {
    if (error instanceof PaystackError) {
      return {
        problem:
          'That account number was not recognised by the bank. Check the number and the ' +
          'bank you picked, then try again.',
      }
    }
    return { problem: 'Could not reach Paystack to check that account. Try again.' }
  }

  // Written with the service-role client because account_verified_at is a claim
  // about what Paystack said, and a browser must not be able to set it.
  const admin = supabaseAdmin()
  const { error } = await admin
    .from('profiles')
    .update({
      bank_code: bankCode,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      account_verified_at: new Date().toISOString(),
    })
    .eq('id', profile.id)

  if (error) return { problem: 'Could not save those details. Try again.' }

  revalidatePath('/account')
  revalidatePath('/claim')
  return { saved: true, accountName }
}

export type PasswordState = { problem?: string; saved?: boolean }

/**
 * Give this account a password.
 *
 * For somebody who has been playing on their email alone, this is the moment
 * the account becomes properly theirs: from here on, the email by itself will
 * not open it. Claiming a prize requires this for exactly that reason.
 */
export async function choosePassword(
  _state: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const { profile } = await requireProfile()

  const password = String(formData.get('password') ?? '')
  const again = String(formData.get('password_again') ?? '')

  if (password !== again) return { problem: 'Those two passwords are not the same.' }

  const problem = await setPassword(profile.id, password)
  if (problem) return { problem }

  revalidatePath('/account')
  revalidatePath('/claim')
  return { saved: true }
}
