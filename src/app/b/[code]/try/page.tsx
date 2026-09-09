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
 * Public, and so is the real thing: playing a box costs nothing. This is here
 * for the person who has just been sent a link and wants to know what the game
 * even is before they tap Play — no sign-in, no wallet, no box on the line.
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

      {/* Nothing about the wallet decides this any more: if the box is still
          open, the run at the end of the practice is free to take. */}
      <PracticeGame boxCode={box.code} canPlay={box.status === 'open'} />
    </main>
  )
}
