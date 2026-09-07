import { attemptFromRequest } from '@/lib/api'
import { beginLevel } from '@/lib/play'

/**
 * Start the level the player is on, and hand over its pattern.
 *
 * This is the only place a pattern is ever sent to a browser, and it sends one
 * level's worth. The clock the server will judge against starts here too, which
 * is why the screen does not call this until the player has tapped "start" —
 * nobody should be losing time to a card they have not read yet.
 */
export async function POST(request: Request) {
  const found = await attemptFromRequest(request)
  if (!found.ok) return found.response

  return Response.json(await beginLevel(found.attempt))
}
