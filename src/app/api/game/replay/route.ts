import { attemptFromRequest } from '@/lib/api'
import { spendReplay } from '@/lib/play'

/**
 * Spend the one free replay and take the level again.
 *
 * The replay only exists after a miss, and there is only ever one. Both of
 * those are checked against the stored row, so calling this by hand — twice,
 * early, or without having missed anything — gets a player nowhere.
 */
export async function POST(request: Request) {
  const found = await attemptFromRequest(request)
  if (!found.ok) return found.response

  return Response.json(await spendReplay(found.attempt))
}
