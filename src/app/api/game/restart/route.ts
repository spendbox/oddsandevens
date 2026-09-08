import { attemptFromRequest } from '@/lib/api'
import { restartAttempt } from '@/lib/play'
import { requireProfile } from '@/lib/session'

/**
 * End this run and start a fresh one at level 1.
 *
 * Costs the same as pressing play on the box page, because underneath it is
 * the same call — the coin comes out inside start_attempt, in the same
 * transaction that opens the new run.
 */
export async function POST(request: Request) {
  const found = await attemptFromRequest(request)
  if (!found.ok) return found.response

  const { profile } = await requireProfile()

  return Response.json(await restartAttempt(found.attempt, profile))
}
