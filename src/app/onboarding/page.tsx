import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Pursuit } from '@/lib/types'
import { OnboardingForm } from './onboarding-form'

export const metadata = { title: 'Set up your profile' }

export default async function OnboardingPage() {
  const { profile } = await requireProfile()
  if (profile.onboarded) redirect('/home')

  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('pursuits')
    .select('*')
    .order('member_count', { ascending: false })
    .limit(8)

  return (
    <main className="mx-auto max-w-lg px-6 py-10 sm:py-16">
      <OnboardingForm profile={profile} pursuits={(data ?? []) as Pursuit[]} />
    </main>
  )
}
