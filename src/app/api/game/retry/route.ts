import { attemptFromRequest } from '@/lib/api'
import { buyRetry } from '@/lib/play'

/**
 * Spend a coin to take this level again.
 *
 * Only reachable after a miss with the free replay already gone — both of which
 * are checked against the stored row inside buy_replay, not here, so calling
 * this by hand at any other moment buys nothing and costs nothing.
 */
export async function POST(request: Request) {
  const found = await attemptFromRequest(request)
  if (!found.ok) return found.response

  return Response.json(await buyRetry(found.attempt))
}
