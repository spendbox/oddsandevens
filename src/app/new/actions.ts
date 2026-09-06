'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/session'
import { uniqueSlug } from '@/lib/slug'

export type NewToolState = { error: string | null }

/**
 * Starting a tool is deliberately cheap: it writes a draft with the brief and
 * gets out of the way. The building itself happens on the next screen, where
 * there is somewhere to show progress — a two-minute wait on a form submission
 * looks like a hung page.
 */
export async function startTool(_prev: NewToolState, formData: FormData): Promise<NewToolState> {
  const brief = String(formData.get('brief') ?? '').trim()

  if (brief.length < 12) {
    return { error: 'Say a little more about what the tool should do.' }
  }

  const { userId } = await requireProfile()
  const supabase = await supabaseServer()

  // A placeholder title until the plan comes back with a real one.
  const slug = await uniqueSlug(supabase, brief.split(/\s+/).slice(0, 6).join(' '))

  const { data, error } = await supabase
    .from('tools')
    .insert({
      owner_id: userId,
      slug,
      engine: 'calculator',
      title: 'Untitled tool',
      brief: brief.slice(0, 4000),
      spec: {},
      status: 'draft',
    })
    .select('id')
    .maybeSingle()

  if (error || !data) {
    return { error: error?.message ?? 'Could not start the tool. Try again.' }
  }

  revalidatePath('/tools')
  redirect(`/build/${data.id}`)
}
