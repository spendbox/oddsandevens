import 'server-only'
import { supabaseServer } from './supabase/server'
import { loadAttempt } from './play'
import type { Attempt } from './types'

/**
 * The four lines every game route starts with: who is asking, and is this
 * really their game?
 *
 * The attempt is looked up with the user id in the WHERE clause, so a player
 * who guesses somebody else's attempt id gets the same answer as one who
 * invents a random one — nothing at all.
 *
 * `arrivedAt` is stamped on the first line, before any of that happens, and it
 * is the moment an answer is judged against. Checking who is asking costs two
 * round trips to Supabase — one to the auth endpoint, one for the attempt row —
 * and those used to run before the clock was read, so a player was charged
 * several hundred milliseconds for the server authenticating them. It is not
 * their time to spend.
 */
export async function attemptFromRequest(
  request: Request,
): Promise<
  | { ok: true; attempt: Attempt; body: Record<string, unknown>; arrivedAt: number }
  | { ok: false; response: Response }
> {
  const arrivedAt = Date.now()
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, response: Response.json({ problem: 'Sign in first.' }, { status: 401 }) }
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : ''

  if (!attemptId) {
    return { ok: false, response: Response.json({ problem: 'No game given.' }, { status: 400 }) }
  }

  const attempt = await loadAttempt(attemptId, user.id)

  if (!attempt) {
    return { ok: false, response: Response.json({ problem: 'No such game.' }, { status: 404 }) }
  }

  return { ok: true, attempt, body: body ?? {}, arrivedAt }
}
