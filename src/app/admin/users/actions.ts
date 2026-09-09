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

/**
 * Move the ceiling on how many boxes may exist across the whole platform.
 *
 * Two things here are deliberate, and both come from this control having spent
 * a while looking like it worked while doing nothing.
 *
 * The saved number is the one the database hands back, never the one that was
 * typed. `set_max_boxes` returns the value it actually stored, so if the write
 * lands somewhere other than expected the screen shows the truth rather than
 * an echo of the form.
 *
 * And a failure says what failed. This is an operator's screen: "could not
 * save that limit" sends whoever runs the site looking at the browser, when
 * the answer is nearly always a migration that has not been applied. The real
 * message goes to the server log and a readable version of it goes on screen.
 */
export async function setBoxLimit(
  _state: LimitState,
  formData: FormData,
): Promise<LimitState> {
  const { profile } = await requireProfile()
  if (!isAdmin(profile.email)) return { problem: 'Not allowed.' }

  const raw = Number(formData.get('max_boxes'))
  if (!Number.isFinite(raw) || raw < 0) return { problem: 'Give a whole number, zero or more.' }

  const wanted = Math.floor(raw)
  const admin = supabaseAdmin()
  const { data, error } = await admin.rpc('set_max_boxes', { p_max: wanted })

  if (error) {
    console.error('[admin] set_max_boxes failed', error)
    return { problem: limitProblem(error) }
  }

  // The function returns the stored value. If some older version of it is
  // deployed and returns nothing, fall back to what was asked for rather than
  // showing a blank — but say nothing stronger than that.
  const saved = typeof data === 'number' ? data : wanted

  revalidatePath('/admin')
  revalidatePath('/admin/users')
  revalidatePath('/home')
  return { saved }
}

/**
 * Turn a Postgres or PostgREST failure into something an operator can act on.
 *
 * The two that actually happen both mean the same thing — the settings
 * migrations have not been run against this database — and they are invisible
 * from the outside: the table read comes back empty, the save comes back with
 * a code nobody recognises, and the screen shows a limit of nothing that will
 * not change however many times it is typed in.
 */
function limitProblem(error: { code?: string; message?: string }): string {
  const code = error.code ?? ''
  const message = error.message ?? ''

  // PGRST202: PostgREST cannot find the function. 42883: Postgres cannot.
  // 42P01 / PGRST205: the settings table itself is not there.
  const missing =
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === '42P01' ||
    /could not find the (function|table)/i.test(message)

  if (missing) {
    return (
      'This database has no box limit to change yet. Run the migrations in ' +
      'supabase/migrations — 0008_settings_and_limits.sql and ' +
      '0009_box_limit_default.sql — then try again.'
    )
  }

  return `Could not save that limit: ${message || 'the database refused it.'}`
}
