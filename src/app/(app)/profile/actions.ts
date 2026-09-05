'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

export type ProfileState = { error: string | null; saved: boolean }

export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!fullName) return { error: 'A name is required.', saved: false }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      headline: String(formData.get('headline') ?? '').trim(),
      location: String(formData.get('location') ?? '').trim(),
      bio: String(formData.get('bio') ?? '').trim(),
      skills: String(formData.get('skills') ?? '')
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean)
        .slice(0, 15),
    })
    .eq('id', user.id)

  if (error) return { error: error.message, saved: false }

  revalidatePath('/profile')
  return { error: null, saved: true }
}
