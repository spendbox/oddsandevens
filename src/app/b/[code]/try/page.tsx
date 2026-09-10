import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { tidyBoxCode } from '@/lib/codes'
import { PracticeGame } from '@/components/practice-game'
import type { Box } from '@/lib/types'

export const metadata = { title: 'Practice run' }

/**
 * The free example run for a box.
 *
 * Public, like the box page itself, and free where the real thing is not. It is
 * here for the person who has just been sent a link and wants to know what the
 * game even is before they spend a coin on it — no sign-in, no wallet, no box on
 * the line. Nobody should have to pay to find out what they are being asked to
 * play.
 */
export default async function PracticePage({ params }: PageProps<'/b/[code]/try'>) {
  const { code } = await params

  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('boxes')
    .select('code, status')
    .eq('code', tidyBoxCode(code))
    .maybeSingle()

  const box = data as Pick<Box, 'code' | 'status'> | null
  if (!box) notFound()

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <BackLink href={`/b/${box.code}`} className="mb-4 self-start">
        Box {box.code}
      </BackLink>

      {/* `canPlay` is about the box, not the wallet: the button at the end of
          the practice is a link to the box page, and that page is the one place
          that knows what a go costs and whether this player can cover it. */}
      <PracticeGame boxCode={box.code} canPlay={box.status === 'open'} />
    </main>
  )
}
