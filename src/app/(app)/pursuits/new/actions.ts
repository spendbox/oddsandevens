'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export type CreateState = { error: string | null }

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}

export async function createPursuit(_prev: CreateState, formData: FormData): Promise<CreateState> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Give the pursuit a name.' }

  const stageNames = formData.getAll('stage').map(String)
  const stageDescriptions = formData.getAll('stage_description').map(String)

  const stages = stageNames
    .map((name, index) => ({
      name: name.trim(),
      description: (stageDescriptions[index] ?? '').trim(),
    }))
    .filter((stage) => stage.name)

  if (stages.length < 2) {
    return { error: 'A pursuit needs at least two stages, so people can see where they stand.' }
  }

  // Slugs must be unique; add a suffix rather than failing in front of someone
  // who has just written out a whole journey.
  const base = slugify(title) || 'pursuit'
  let slug = base
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const { data: taken } = await supabase
      .from('pursuits')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!taken) break
    slug = `${base}-${attempt + 1}`
  }

  const { data: pursuit, error } = await supabase
    .from('pursuits')
    .insert({
      slug,
      title: title.slice(0, 120),
      tagline: String(formData.get('tagline') ?? '').trim().slice(0, 200),
      description: String(formData.get('description') ?? '').trim().slice(0, 4000),
      category: String(formData.get('category') ?? 'other'),
      emoji: String(formData.get('emoji') ?? '🎯').slice(0, 8) || '🎯',
      accent: String(formData.get('accent') ?? 'violet'),
      tags: String(formData.get('tags') ?? '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
      created_by: user.id,
    })
    .select('id, slug')
    .single()

  if (error || !pursuit) return { error: error?.message ?? 'Could not create the pursuit.' }

  await supabase.from('stages').insert(
    stages.map((stage, index) => ({
      pursuit_id: pursuit.id,
      name: stage.name.slice(0, 60),
      description: stage.description.slice(0, 200),
      position: index + 1,
    })),
  )

  await supabase.from('memberships').insert({
    pursuit_id: pursuit.id,
    user_id: user.id,
    role: 'steward',
    intent: String(formData.get('member_intent') ?? '').trim().slice(0, 280),
  })

  revalidatePath('/pursuits')
  redirect(`/p/${pursuit.slug}`)
}
