import { attemptFromRequest } from '@/lib/api'
import { judge } from '@/lib/play'

/**
 * Here are the tiles I tapped.
 *
 * Everything about whether that was right — the pattern, the level it belonged
 * to, the deadline — is read from the database, not from this request. The
 * request contributes the taps and nothing else.
 */
export async function POST(request: Request) {
  const found = await attemptFromRequest(request)
  if (!found.ok) return found.response

  const level = Number(found.body.level)
  const taps = found.body.taps

  return Response.json(await judge(found.attempt, level, taps, found.arrivedAt))
}
