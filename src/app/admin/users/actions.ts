'use server'

import { revalidatePath } from 'next/cache'
import { isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { MAX_PRIZE_NAIRA, MAX_WELCOME_COINS, naira } from '@/lib/money'

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
        `They have an open box (${openBoxes.map((box) => box.code).join(', ')}). People are ` +
        'playing it, and some have spent coins on it, so it cannot be deleted out from ' +
        'under them. Wait until it is beaten, then delete the account.',
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

export type PrizeState = { problem?: string; saved?: number }

/**
 * Change what a box is worth.
 *
 * The prize used to be a constant in `money.ts`, which meant moving it was a
 * deploy — the same problem the box limit had, and worse, because this is the
 * number the whole platform is built around. It lives in the settings row now
 * and a trigger stamps it onto every box as it is created, so what is stored
 * here is what the next box is worth, whatever anything else says.
 *
 * Three things this deliberately does not do.
 *
 * It does not touch boxes that already exist. An open box is a standing promise
 * to everyone who has paid to play it and the amount is the promise; the screen
 * says so, and says how many boxes are still carrying the old figure.
 *
 * It does not accept a number above `MAX_PRIZE_NAIRA`. A beaten box pays its
 * prize twice, so a stray zero is a seven-figure liability created by a
 * keystroke that nothing downstream would question.
 *
 * And, like the box limit, it reports the number the database hands back rather
 * than the one that was typed — `set_prize` returns what it stored — so a write
 * that lands somewhere unexpected shows the truth instead of an echo.
 */
export async function setPrize(_state: PrizeState, formData: FormData): Promise<PrizeState> {
  const { profile } = await requireProfile()
  if (!isAdmin(profile.email)) return { problem: 'Not allowed.' }

  // Typed with commas or a naira sign more often than not. Strip them rather
  // than refusing an amount that was perfectly clear.
  const typed = String(formData.get('prize_naira') ?? '').replace(/[₦,\s]/g, '')
  const raw = Number(typed)

  if (!typed || !Number.isFinite(raw) || raw <= 0) {
    return { problem: 'Give an amount in naira, more than zero.' }
  }

  if (raw > MAX_PRIZE_NAIRA) {
    return {
      problem:
        `${naira(MAX_PRIZE_NAIRA)} is the most that can be set here, and that is a guard ` +
        'against a stray zero rather than a rule — every box pays its prize twice when it ' +
        `is beaten, so ${naira(raw)} would be a ${naira(raw * 2)} promise. Raise ` +
        'MAX_PRIZE_NAIRA in src/lib/money.ts if you really mean it.',
    }
  }

  const wanted = Math.floor(raw)
  const admin = supabaseAdmin()
  const { data, error } = await admin.rpc('set_prize', { p_naira: wanted })

  if (error) {
    console.error('[admin] set_prize failed', error)
    return { problem: prizeProblem(error) }
  }

  const saved = typeof data === 'number' ? data : wanted

  // Every public page quotes the prize, and all of them read it through
  // livePrize(). They are all stale the moment this write lands.
  for (const path of ['/', '/home', '/enter', '/how-it-works', '/terms', '/admin', '/admin/users']) {
    revalidatePath(path)
  }

  return { saved }
}

/** The same translation as `limitProblem`, for the same two failures. */
function prizeProblem(error: { code?: string; message?: string }): string {
  const code = error.code ?? ''
  const message = error.message ?? ''

  const missing =
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === '42P01' ||
    code === '42703' ||
    /could not find the (function|table|column)/i.test(message)

  if (missing) {
    return (
      'This database has no editable prize yet. Run the migration in ' +
      'supabase/migrations — 0012_editable_prize.sql — then try again.'
    )
  }

  return `Could not save that prize: ${message || 'the database refused it.'}`
}

export type WelcomeState = {
  problem?: string
  saved?: { coins: number; maxPerIp: number }
}

/**
 * Change the free coin, and how many one connection may claim.
 *
 * Two numbers in one form because they are one decision. The coin is what a new
 * player is given so that their first go at a box costs them nothing; the limit
 * is the only thing standing between that and somebody making forty accounts on
 * one phone for forty free shots at the prize. Moving one without seeing the
 * other is how a giveaway gets expensive.
 *
 * The limit is the number that will need moving in a hurry, and always upwards.
 * Shared connections are normal here — a household, a hostel, a shop's wifi,
 * a whole mobile network behind one address — so the failure this setting will
 * actually produce is honest players being told their connection has had its
 * share. That is why it is a setting and not a constant, and why zero is
 * refused: switching the coin off is `coins` = 0, which says what it means.
 *
 * Like the prize, what comes back on screen is what the database stored, never
 * what was typed.
 */
export async function setWelcomeRules(
  _state: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  const { profile } = await requireProfile()
  if (!isAdmin(profile.email)) return { problem: 'Not allowed.' }

  const coins = Number(String(formData.get('welcome_coins') ?? '').trim())
  const perIp = Number(String(formData.get('welcome_max_per_ip') ?? '').trim())

  if (!Number.isFinite(coins) || coins < 0) {
    return { problem: 'Give a number of free coins, zero or more. Zero switches it off.' }
  }

  if (coins > MAX_WELCOME_COINS) {
    return {
      problem:
        `${MAX_WELCOME_COINS} is the most that can be given here. That is a guard against ` +
        'a stray zero, not a rule — every account ever made gets this many.',
    }
  }

  if (!Number.isFinite(perIp) || perIp < 1) {
    return {
      problem:
        'One connection has to be allowed at least one free coin. To stop giving them out ' +
        'at all, set the free coins to zero instead.',
    }
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin.rpc('set_welcome_rules', {
    p_coins: Math.floor(coins),
    p_max_per_ip: Math.floor(perIp),
  })

  if (error) {
    console.error('[admin] set_welcome_rules failed', error)
    return { problem: welcomeProblem(error) }
  }

  // The function returns one row: what is stored.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { coins?: number; max_per_ip?: number }
    | null

  const saved = {
    coins: typeof row?.coins === 'number' ? row.coins : Math.floor(coins),
    maxPerIp: typeof row?.max_per_ip === 'number' ? row.max_per_ip : Math.floor(perIp),
  }

  // /enter quotes the free coin on the sign-up step, and reads it through
  // liveWelcomeCoins(). It is stale the moment this write lands.
  for (const path of ['/enter', '/admin', '/admin/users', '/admin/transactions']) {
    revalidatePath(path)
  }

  return { saved }
}

/** The same translation as `prizeProblem`, one migration later. */
function welcomeProblem(error: { code?: string; message?: string }): string {
  const code = error.code ?? ''
  const message = error.message ?? ''

  const missing =
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === '42P01' ||
    code === '42703' ||
    /could not find the (function|table|column)/i.test(message)

  if (missing) {
    return (
      'This database has no free coin yet. Run the migration in supabase/migrations — ' +
      '0014_welcome_coin.sql — then try again. It also gives every player who is already ' +
      'here their coin.'
    )
  }

  return `Could not save that: ${message || 'the database refused it.'}`
}
