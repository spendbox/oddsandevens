import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Lock } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Card } from '@/components/ui'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { tidyBoxCode } from '@/lib/codes'
import type { Box } from '@/lib/types'
import { EditForm } from './edit-form'

export const metadata = { title: 'Edit your box' }

export default async function EditBoxPage({ params }: PageProps<'/b/[code]/edit'>) {
  const [{ code }, { profile }] = await Promise.all([params, requireProfile()])

  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('boxes')
    .select('*')
    .eq('code', tidyBoxCode(code))
    .maybeSingle()

  const box = data as Box | null

  // Somebody else's box is not "forbidden", it is simply not a page they have.
  if (!box || box.creator_id !== profile.id) notFound()

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-lg px-4 py-8 pb-24">
        <Link
          href={`/b/${box.code}`}
          className="flex items-center gap-1 text-sm text-dusk hover:text-mist"
        >
          <ChevronLeft size={15} /> Box {box.code}
        </Link>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">Customise your box</h1>
        <p className="mt-1.5 text-mist">
          A shared link competes with everything else in a group chat. A picture and a
          sentence are what make it worth tapping.
        </p>

        <Card className="mt-8">
          <EditForm box={box} />
        </Card>

        <Card className="mt-4 border-white/8 bg-white/3">
          <p className="flex items-center gap-2 text-sm font-semibold text-mist">
            <Lock size={15} /> A box cannot be deleted
          </p>
          <p className="mt-1.5 text-sm text-dusk">
            While it is open it is a standing {new Intl.NumberFormat('en-NG', {
              style: 'currency',
              currency: 'NGN',
              maximumFractionDigits: 0,
            }).format(box.prize_naira)}{' '}
            promise to everyone who has spent a coin on it. Boxes end by being beaten.
          </p>
        </Card>
      </main>
    </>
  )
}
