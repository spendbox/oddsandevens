import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { optionalProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { tidyBoxCode } from '@/lib/codes'
import { PracticeGame } from '@/components/practice-game'
import type { Box } from '@/lib/types'

export const metadata = { title: 'Practice run' }

/**
 * The free example run for a box.
 *
 * Public: somebody who has just been sent a link should be able to see what
 * they are being asked to pay a coin for before they pay it.
 */
export default async function PracticePage({ params }: PageProps<'/b/[code]/try'>) {
  const [{ code }, profile] = await Promise.all([params, optionalProfile()])

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
      <Link
        href={`/b/${box.code}`}
        className="mb-4 flex items-center gap-1 self-start text-sm text-dusk hover:text-mist"
      >
        <ChevronLeft size={15} /> Box {box.code}
      </Link>

      <PracticeGame
        boxCode={box.code}
        canPlay={box.status === 'open' && (profile?.coins ?? 0) >= 1}
      />
    </main>
  )
}
