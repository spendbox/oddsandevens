import 'server-only'
import { supabaseAdmin } from './supabase/admin'
import {
  LATENCY_GRACE_MS,
  LEVELS,
  makePattern,
  matches,
  planFor,
  showMsFor,
  answerMsFor,
} from './game'
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

function stateOf(attempt: Attempt, message?: string): GameState {
  return {
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

  if (attempt.replays_left <= 0) {
    const ended = await endAttempt(attempt.id, 'failed')
    return stateOf(ended ?? { ...attempt, status: 'failed' }, message)
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

  return stateOf((data as Attempt) ?? attempt, message)
}

/**
 * Start the level the player is on, and send them the pattern for it.
 *
 * Three situations, in order:
 *
 *  - A pattern is already out for this level and its time has not run out.
 *    Send the same one back with the time that is actually left. Reloading the
 *    page mid-level therefore costs the seconds it took to reload, rather than
 *    handing out a fresh pattern and a fresh clock.
 *
 *  - A pattern is out and its time has run out. That is a miss, whether the
 *    player closed the tab, lost signal, or simply sat there. Judge it as one.
 *
 *  - Nothing is out. Generate a new pattern, write down when it went out, and
 *    work out the deadline from that.
 *
 * The deadline is `shown_at + how long the pattern takes to play + the answer
 * time + a latency allowance`, because the clock the player sees only starts
 * once the last flash has gone out.
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

    if (msRemaining > 0) {
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

    return recordMiss(attempt, 'Time ran out on that one.')
  }

  const plan = planFor(attempt.level)
  const pattern = makePattern(attempt.level)
  const shownAt = new Date(now)
  const deadline = new Date(
    now + showMsFor(attempt.level) + answerMsFor(attempt.level) + LATENCY_GRACE_MS,
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

/** Spend the one free replay and put the player back on the same level. */
export async function spendReplay(attempt: Attempt): Promise<GameState> {
  const admin = supabaseAdmin()

  if (attempt.status !== 'playing') return stateOf(attempt)
  if (!attempt.awaiting_replay) return stateOf(attempt)
  if (attempt.replays_left <= 0) {
    const ended = await endAttempt(attempt.id, 'failed')
    return stateOf(ended ?? attempt, 'No replays left.')
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
 */
export async function judge(
  attempt: Attempt,
  level: number,
  taps: unknown,
): Promise<GameState> {
  const admin = supabaseAdmin()

  if (attempt.status !== 'playing') return stateOf(attempt)
  if (attempt.awaiting_replay) return stateOf(attempt, 'Use your replay first.')

  // An answer to a level that isn't the one in play — a stale tab, or a resend.
  if (!attempt.pattern || attempt.pattern_level !== attempt.level || level !== attempt.level) {
    return stateOf(attempt, 'That answer was for a different round.')
  }

  const late = !attempt.deadline_at || Date.now() > new Date(attempt.deadline_at).getTime()
  if (late) return recordMiss(attempt, 'Time ran out on that one.')

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
