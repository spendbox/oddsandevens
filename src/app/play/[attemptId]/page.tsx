import { notFound, redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadAttempt } from '@/lib/play'
import type { Box } from '@/lib/types'
import { Game } from './game'

export const metadata = { title: 'Playing' }

// A game in progress must never be served from a cache — not the browser's,
// not the CDN's. Every render reads where this player actually is.
export const dynamic = 'force-dynamic'

export default async function PlayPage({ params }: PageProps<'/play/[attemptId]'>) {
  const [{ attemptId }, { profile }] = await Promise.all([params, requireProfile()])

  const attempt = await loadAttempt(attemptId, profile.id)
  if (!attempt) notFound()

  const admin = supabaseAdmin()
  const { data } = await admin.from('boxes').select('*').eq('id', attempt.box_id).maybeSingle()
  const box = data as Box | null
  if (!box) redirect('/home')

  // The pattern for the level in play is deliberately not passed down here. The
  // screen asks for it when the player taps start, so that the clock the server
  // is keeping does not begin while somebody is still reading the page.
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <Game
        box={box}
        initial={{
          attemptId: attempt.id,
          status: attempt.status,
          level: attempt.level,
          levelsCleared: attempt.levels_cleared,
          replaysLeft: attempt.replays_left,
          awaitingReplay: attempt.awaiting_replay,
        }}
      />
    </main>
  )
}
