'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type DeleteState = { problem?: string; done?: string }

/**
 * Delete a player, properly.
 *
 * "Properly" is doing the checks first. Deleting a profile cascades: their
 * boxes go, their attempts go, and — the one that matters — their payout rows
 * go. So this refuses in two cases rather than quietly destroying something:
 *
 *  - They have an open box. Other people have paid coins to play it, and it
 *    carries a ₦100,000 promise. Deleting the person deletes the box out from
 *    under everyone mid-game.
 *  - They are owed money. Removing the row does not settle the debt, it just
 *    erases the record of it.
 *
 * Both are resolvable — pay the payout, wait for the box to be beaten — and the
 * message says which one is in the way. An admin who genuinely means it can act
 * on the blocker and come back.
 */
export async function deletePlayer(
  _state: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const { profile } = await requireProfile()
  if (!isAdmin(profile.email)) return { problem: 'Not allowed.' }

  const id = String(formData.get('id') ?? '')
  const confirm = String(formData.get('confirm') ?? '').trim()

  if (!id) return { problem: 'No player given.' }
  if (id === profile.id) return { problem: 'You cannot delete your own admin account here.' }

  const admin = supabaseAdmin()

  const { data: target } = await admin
    .from('profiles')
    .select('id, email, display_name')
    .eq('id', id)
    .maybeSingle()

  if (!target) return { problem: 'That player no longer exists.' }

  // Typing the address is the confirmation. A delete this destructive should
  // not be one mis-tap away.
  if (confirm.toLowerCase() !== String(target.email).toLowerCase()) {
    return { problem: 'Type the player’s email exactly to confirm.' }
  }

  const [{ data: openBoxes }, { data: owed }] = await Promise.all([
    admin.from('boxes').select('code').eq('creator_id', id).eq('status', 'open'),
    admin.from('payouts').select('amount_naira').eq('user_id', id).eq('status', 'pending'),
  ])

  if (openBoxes && openBoxes.length > 0) {
    return {
      problem:
        `They have an open box (${openBoxes.map((box) => box.code).join(', ')}). People have ` +
        'paid to play it, so it cannot be deleted out from under them. Wait until it is ' +
        'beaten, then delete the account.',
    }
  }

  if (owed && owed.length > 0) {
    return {
      problem:
        'They are still owed a payout. Settle it and mark it paid first — deleting the ' +
        'account would erase the record of the debt rather than clear it.',
    }
  }

  // The auth user is the root; profiles cascades from it, and everything else
  // cascades from profiles.
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return { problem: `Could not delete them: ${error.message}` }

  await admin.from('profiles').delete().eq('id', id)

  revalidatePath('/admin/users')
  return { done: `${target.display_name || target.email} has been deleted.` }
}

export type LimitState = { problem?: string; saved?: number }

/** Move the ceiling on how many boxes may exist across the whole platform. */
export async function setBoxLimit(
  _state: LimitState,
  formData: FormData,
): Promise<LimitState> {
  const { profile } = await requireProfile()
  if (!isAdmin(profile.email)) return { problem: 'Not allowed.' }

  const raw = Number(formData.get('max_boxes'))
  if (!Number.isFinite(raw) || raw < 0) return { problem: 'Give a whole number, zero or more.' }

  const admin = supabaseAdmin()
  const { error } = await admin.rpc('set_max_boxes', { p_max: Math.floor(raw) })

  if (error) return { problem: 'Could not save that limit.' }

  revalidatePath('/admin')
  revalidatePath('/admin/users')
  revalidatePath('/home')
  return { saved: Math.floor(raw) }
}
