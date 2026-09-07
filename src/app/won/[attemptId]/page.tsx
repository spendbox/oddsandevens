import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { loadAttempt } from '@/lib/play'
import type { Box } from '@/lib/types'
import { WinScreen } from './win-screen'

export const metadata = { title: 'You beat the box' }
export const dynamic = 'force-dynamic'

/**
 * The congratulations page.
 *
 * A real route rather than a state inside the game, so it survives a reload,
 * can be linked to, and is still there tomorrow when they want to show somebody.
 * Beating a box is the rarest thing that happens on Spendbox and it should not
 * live in a variable that a refresh throws away.
 */
export default async function WonPage({ params }: PageProps<'/won/[attemptId]'>) {
  const [{ attemptId }, { profile }] = await Promise.all([params, requireProfile()])

  const attempt = await loadAttempt(attemptId, profile.id)
  if (!attempt || attempt.status !== 'won') notFound()

  const admin = supabaseAdmin()
  const { data } = await admin.from('boxes').select('*').eq('id', attempt.box_id).maybeSingle()
  const box = data as Box | null
  if (!box) notFound()

  // Clearing all ten does not always mean the prize: somebody else may have got
  // to this box first. The page has to be honest about which happened.
  const tookThePrize = box.winner_id === profile.id

  return (
    <>
      <SiteHeader profile={profile} />
      <WinScreen
        box={box}
        tookThePrize={tookThePrize}
        needsClaim={!profile.password_set || !profile.account_verified_at}
      />
    </>
  )
}
