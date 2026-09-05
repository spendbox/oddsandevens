'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export type OnboardingState = { error: string | null }

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!fullName) return { error: 'Tell us what to call you.' }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      headline: String(formData.get('headline') ?? '').trim(),
      location: String(formData.get('location') ?? '').trim(),
      bio: String(formData.get('bio') ?? '').trim(),
      skills: parseList(formData.get('skills')),
      interests: parseList(formData.get('interests')),
      onboarded: true,
    })
    .eq('id', user.id)

  if (error) return { error: error.message }

  // Join whatever they picked on the way in, so the app is never empty on
  // first sight.
  const chosen = formData.getAll('pursuit').map(String).filter(Boolean)
  if (chosen.length > 0) {
    await supabase.from('memberships').insert(
      chosen.map((pursuitId) => ({
        pursuit_id: pursuitId,
        user_id: user.id,
        progress: 0,
      })),
    )
  }

  revalidatePath('/', 'layout')
  redirect('/home')
}
