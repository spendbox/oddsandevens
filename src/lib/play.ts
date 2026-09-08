import 'server-only'
import { supabaseAdmin } from './supabase/admin'
import {
  COUNT_IN_MS,
  LATENCY_GRACE_MS,
  LEVELS,
  makePattern,
  matches,
  planFor,
  showMsFor,
  answerMsFor,
} from './game'
import { CHEAPEST_RETRY, COINS_PER_PLAY, retryCostFor } from './money'
import type { Attempt, Box, Profile } from './types'

/**
 * The referee.
 *
 * Nothing the browser sends is believed. The browser says which attempt it is
 * playing and which tiles were tapped; everything else — what the pattern was,
 * which level it belongs to, when the clock started, whether the answer arrived
 * in time, whether a replay is available, who beat the box — is decided here,
 * against rows only the server can write.
 *
 * The one thing the server cannot hide is the pattern itself: to show it to a
 * player, it has to be sent to them. So it is sent one level at a time, and
 * never before that level has begun.
 */

export type StartResult =
  | { ok: true; attemptId: string; resumed: boolean; coinsLeft: number }
  | { ok: false; problem: string; coinsLeft?: number }

/** Take a coin and open a run. Or hand back the run already in progress. */
export async function startAttempt(box: Box, profile: Profile): Promise<StartResult> {
  const admin = supabaseAdmin()

  const { data, error } = await admin.rpc('start_attempt', {
    p_box: box.id,
    p_user: profile.id,
    p_name: profile.display_name,
    p_cost: 1,
  })

  if (error) return { ok: false, problem: 'Could not start the game. Try again.' }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { ok: false, problem: 'Could not start the game. Try again.' }

  if (row.problem) {
    return { ok: false, problem: row.problem as string, coinsLeft: row.coins_left ?? undefined }
  }

  return {
    ok: true,
    attemptId: row.attempt_id as string,
    resumed: Boolean(row.resumed),
    coinsLeft: row.coins_left ?? 0,
  }
}

/** Load an attempt, but only for the person who paid for it. */
export async function loadAttempt(attemptId: string, userId: string): Promise<Attempt | null> {
  const admin = supabaseAdmin()

  const { data } = await admin
    .from('attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .maybeSingle()

  return (data as Attempt) ?? null
}

/** What the game screen is told after every server call. */
export type GameState = {
  attemptId: string
  status: 'playing' | 'won' | 'failed'
  level: number
  levelsCleared: number
  replaysLeft: number
  awaitingReplay: boolean
  /** Coins in the wallet, so the miss screen knows what it can offer. */
  coins?: number
  /** Present only while a level is actually running. */
  round?: {
    pattern: number[]
    flashMs: number
    gapMs: number
    answerMs: number
    /** Milliseconds left before the server stops accepting an answer. */
    msRemaining: number
  }
  message?: string
}

function stateOf(attempt: Attempt, message?: string, coins?: number): GameState {
  return {
    coins,
    attemptId: attempt.id,
    status: attempt.status,
    level: attempt.level,
    levelsCleared: attempt.levels_cleared,
    replaysLeft: attempt.replays_left,
    awaitingReplay: attempt.awaiting_replay,
    message,
  }
}

/** End the run, for good. */
async function endAttempt(attemptId: string, status: 'won' | 'failed') {
  const admin = supabaseAdmin()

  const { data } = await admin
    .from('attempts')
    .update({
      status,
      finished_at: new Date().toISOString(),
      pattern: null,
      pattern_level: null,
      shown_at: null,
      deadline_at: null,
      awaiting_replay: false,
    })
    .eq('id', attemptId)
    .select('*')
    .maybeSingle()

  return data as Attempt
}

/**
 * A level was not answered in time or not answered correctly.
 *
 * A replay costs nothing but there is only one, and spending it is the player's
 * choice, so this does not spend it — it parks the run in `awaiting_replay` and
 * lets the screen offer the button. With no replay left, the run is over and
 * the next go costs another coin.
 */
async function recordMiss(attempt: Attempt, message: string): Promise<GameState> {
  const admin = supabaseAdmin()

  // What is in the wallet decides what the miss screen can offer, so it is read
  // here rather than leaving the screen to ask separately and possibly disagree.
  const { data: wallet } = await admin
    .from('profiles')
    .select('coins')
    .eq('id', attempt.user_id)
    .maybeSingle()

  const coins = wallet?.coins ?? 0

  // The free replay is gone. The run stays open while either way forward is
  // still affordable — carrying on from here, or starting again — and the
  // screen offers whichever they can pay for. It only ends when neither is
  // possible, which means the cheaper of the two.
  if (attempt.replays_left <= 0 && coins < Math.min(COINS_PER_PLAY, CHEAPEST_RETRY)) {
    const ended = await endAttempt(attempt.id, 'failed')
    return stateOf(ended ?? { ...attempt, status: 'failed' }, message, coins)
  }

  const { data } = await admin
    .from('attempts')
    .update({
      awaiting_replay: true,
      pattern: null,
      pattern_level: null,
      shown_at: null,
      deadline_at: null,
    })
    .eq('id', attempt.id)
    .select('*')
    .maybeSingle()

  return stateOf((data as Attempt) ?? attempt, message, coins)
}

/**
 * Start the level the player is on, and send them the pattern for it.
 *
 * Three situations, in order:
 *
 *  - A pattern is already out for this level and there is still enough time to
 *    play the whole thing: the count-in, the pattern, and the answer. Send the
 *    same one back — never a fresh one, or reloading would be a way to shop for
 *    an easier pattern — with the time that is actually left.
 *
 *  - A pattern is out and there is not enough time left to play it properly.
 *    That is a miss. It has to be, because the alternative is handing somebody
 *    a level they cannot win: they would count in, watch the pattern, tap it
 *    back perfectly and be told they were out of time, which is exactly the
 *    complaint this whole file exists to avoid. It happens when a page is
 *    reloaded mid-level, when signal drops, and — the one that actually bit —
 *    when the first `begin` request fails and the screen quietly offers the
 *    start button again. A miss says so straight away and leaves the replay,
 *    the paid carry-on and the free one intact.
 *
 *  - Nothing is out. Generate a new pattern, write down when it went out, and
 *    work out the deadline from that.
 *
 * The deadline is `shown_at + the count-in + how long the pattern takes to play
 * + the answer time + a latency allowance`, because the clock the player sees
 * only starts once the last flash has gone out — but the server's has been
 * running since it handed the pattern over.
 */
export async function beginLevel(attempt: Attempt): Promise<GameState> {
  const admin = supabaseAdmin()

  if (attempt.status !== 'playing') return stateOf(attempt)
  if (attempt.awaiting_replay) {
    return stateOf(attempt, 'Use your replay to try this level again.')
  }

  const now = Date.now()

  if (attempt.pattern && attempt.pattern_level === attempt.level && attempt.deadline_at) {
    const msRemaining = new Date(attempt.deadline_at).getTime() - now
    // What the level still needs: three, two, one, the pattern, then the answer
    // window. The latency allowance is deliberately not in this sum — it is
    // there to pay for the network, not to be spent in advance on a round that
    // is already short.
    const needed = COUNT_IN_MS + showMsFor(attempt.level) + answerMsFor(attempt.level)

    if (msRemaining >= needed) {
      const plan = planFor(attempt.level)
      return {
        ...stateOf(attempt),
        round: {
          pattern: attempt.pattern,
          flashMs: plan.flashMs,
          gapMs: plan.gapMs,
          answerMs: plan.answerMs,
          msRemaining,
        },
      }
    }

    return recordMiss(attempt, 'That level ran out while the screen was away.')
  }

  const plan = planFor(attempt.level)
  const pattern = makePattern(attempt.level)
  const shownAt = new Date(now)
  // Everything that happens between here and the player's first tap: the
  // count-in, the pattern playing, then their answer time — plus the latency
  // allowance. Leave any of these out and the clock on screen is a lie.
  const deadline = new Date(
    now +
      COUNT_IN_MS +
      showMsFor(attempt.level) +
      answerMsFor(attempt.level) +
      LATENCY_GRACE_MS,
  )

  const { data } = await admin
    .from('attempts')
    .update({
      pattern,
      pattern_level: attempt.level,
      shown_at: shownAt.toISOString(),
      deadline_at: deadline.toISOString(),
    })
    .eq('id', attempt.id)
    .eq('status', 'playing')
    .select('*')
    .maybeSingle()

  const fresh = (data as Attempt) ?? attempt

  return {
    ...stateOf(fresh),
    round: {
      pattern,
      flashMs: plan.flashMs,
      gapMs: plan.gapMs,
      answerMs: plan.answerMs,
      msRemaining: deadline.getTime() - Date.now(),
    },
  }
}

/**
 * Spend a coin to take the level again, once the free replay is gone.
 *
 * Everything that matters happens inside buy_replay: the balance check, the
 * deduction, the ledger line and clearing the miss are one transaction, so a
 * player can never be charged for a retry they do not get, or get one they were
 * not charged for.
 */
export async function buyRetry(attempt: Attempt): Promise<GameState> {
  const admin = supabaseAdmin()

  if (attempt.status !== 'playing') return stateOf(attempt)
  if (!attempt.awaiting_replay) return stateOf(attempt)

  const { data, error } = await admin.rpc('buy_replay', {
    p_attempt: attempt.id,
    p_user: attempt.user_id,
    p_cost: retryCostFor(attempt.level),
  })

  const row = Array.isArray(data) ? data[0] : data

  if (error || !row) return stateOf(attempt, 'Could not buy a retry. Try again.')

  if (!row.bought) {
    const problem =
      row.problem === 'not enough coins'
        ? `Carrying on from level ${attempt.level} costs ${retryCostFor(attempt.level)} coins. ` +
          `Start again for ${COINS_PER_PLAY}, or top up.`
        : 'Could not carry on from here.'
    return stateOf(attempt, problem)
  }

  const fresh = (await loadAttempt(attempt.id, attempt.user_id)) ?? attempt
  return beginLevel(fresh)
}

/** Spend the one free replay and put the player back on the same level. */
export async function spendReplay(attempt: Attempt): Promise<GameState> {
  const admin = supabaseAdmin()

  if (attempt.status !== 'playing') return stateOf(attempt)
  if (!attempt.awaiting_replay) return stateOf(attempt)
  if (attempt.replays_left <= 0) {
    return stateOf(attempt, 'No free replays left — a retry costs a coin.')
  }

  // `replays_left = replays_left - 1` guarded by the same condition it depends
  // on, so a double-tap on the replay button cannot spend two replays.
  const { data } = await admin
    .from('attempts')
    .update({ replays_left: attempt.replays_left - 1, awaiting_replay: false })
    .eq('id', attempt.id)
    .eq('awaiting_replay', true)
    .eq('replays_left', attempt.replays_left)
    .select('*')
    .maybeSingle()

  const fresh = (data as Attempt) ?? (await loadAttempt(attempt.id, attempt.user_id)) ?? attempt
  return beginLevel(fresh)
}

/**
 * Judge an answer.
 *
 * The tiles tapped are compared against the pattern this server generated, and
 * the moment the request arrived is compared against the deadline this server
 * set. Neither number comes from the browser, so a doctored clock, a replayed
 * request or a hand-written fetch all lose the same way an honest slow thumb
 * does.
 *
 * `arrivedAt` is when the request reached this server, stamped by the route
 * before it went and asked Supabase who was calling. It is not Date.now() here,
 * and the difference is two round trips the player would otherwise be charged
 * for having their session checked.
 */
export async function judge(
  attempt: Attempt,
  level: number,
  taps: unknown,
  arrivedAt: number = Date.now(),
): Promise<GameState> {
  const admin = supabaseAdmin()

  if (attempt.status !== 'playing') return stateOf(attempt)
  if (attempt.awaiting_replay) return stateOf(attempt, 'Use your replay first.')

  // An answer to a level that isn't the one in play — a stale tab, or a resend.
  if (!attempt.pattern || attempt.pattern_level !== attempt.level || level !== attempt.level) {
    return stateOf(attempt, 'That answer was for a different round.')
  }

  const late = !attempt.deadline_at || arrivedAt > new Date(attempt.deadline_at).getTime()

  if (late) {
    // Say so in the log, with the numbers. Being told you are out of time
    // having answered inside it is the worst thing this game can do to
    // somebody, and it is not something to diagnose by guesswork a second
    // time: how late, at which level, and whether the answer was actually
    // right are the three facts that separate a slow thumb from a clock this
    // server is getting wrong.
    const over = attempt.deadline_at
      ? arrivedAt - new Date(attempt.deadline_at).getTime()
      : null
    console.warn(
      `[spendbox] late answer on attempt ${attempt.id} at level ${attempt.level}: ` +
        `${over === null ? 'no deadline was set' : `${over}ms past the deadline`}, ` +
        `answer was ${matches(attempt.pattern, taps) ? 'correct' : 'wrong'}`,
    )
    return recordMiss(attempt, 'Time ran out on that one.')
  }

  if (!matches(attempt.pattern, taps)) {
    return recordMiss(attempt, 'That was not the pattern.')
  }

  const cleared = attempt.level
  const isLastLevel = cleared >= LEVELS

  // Show the creator, and everyone looking at the box, how far people get.
  await admin.from('boxes').update({ best_level: cleared }).eq('id', attempt.box_id).lt('best_level', cleared)

  if (!isLastLevel) {
    const { data } = await admin
      .from('attempts')
      .update({
        level: cleared + 1,
        levels_cleared: cleared,
        pattern: null,
        pattern_level: null,
        shown_at: null,
        deadline_at: null,
      })
      .eq('id', attempt.id)
      .eq('status', 'playing')
      .select('*')
      .maybeSingle()

    return stateOf((data as Attempt) ?? attempt, `Level ${cleared} cleared.`)
  }

  // Ten out of ten. Whether that is worth ₦200,000 depends on whether anyone
  // else got here first, and claim_win is the only thing that can say.
  const { data: won } = await admin.rpc('claim_win', {
    p_box: attempt.box_id,
    p_user: attempt.user_id,
    p_name: attempt.player_name,
  })

  const { data } = await admin
    .from('attempts')
    .update({
      status: 'won',
      level: LEVELS,
      levels_cleared: LEVELS,
      finished_at: new Date().toISOString(),
      pattern: null,
      pattern_level: null,
      shown_at: null,
      deadline_at: null,
    })
    .eq('id', attempt.id)
    .select('*')
    .maybeSingle()

  return stateOf(
    (data as Attempt) ?? { ...attempt, status: 'won' },
    won === true
      ? 'You beat the box.'
      : 'You cleared all ten — but somebody else got there first.',
  )
}

/**
 * Give up on this run and open a fresh one at level 1.
 *
 * The alternative to paying to carry on. Ends the current attempt properly —
 * as failed, because that is what it is — and then starts a new one through
 * exactly the same path as pressing play on the box page, so it costs the same
 * coin and is subject to the same checks.
 *
 * The order matters: the attempt has to be closed before the new one is asked
 * for, because a player is only allowed one live attempt per box and
 * start_attempt would otherwise hand back the very run they are trying to
 * leave.
 */
export async function restartAttempt(
  attempt: Attempt,
  profile: Profile,
): Promise<GameState & { attemptId: string }> {
  const admin = supabaseAdmin()

  if (attempt.status === 'playing') await endAttempt(attempt.id, 'failed')

  const { data } = await admin.from('boxes').select('*').eq('id', attempt.box_id).maybeSingle()
  const box = data as Box | null

  if (!box) {
    return { ...stateOf({ ...attempt, status: 'failed' }), attemptId: attempt.id }
  }

  const started = await startAttempt(box, profile)

  if (!started.ok) {
    return {
      ...stateOf({ ...attempt, status: 'failed' }, started.problem, started.coinsLeft),
      attemptId: attempt.id,
    }
  }

  const fresh = await loadAttempt(started.attemptId, profile.id)

  return {
    ...stateOf(
      fresh ?? { ...attempt, id: started.attemptId, status: 'playing', level: 1, levels_cleared: 0 },
      undefined,
      started.coinsLeft,
    ),
    attemptId: started.attemptId,
  }
}
