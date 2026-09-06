import type { SupabaseClient } from '@supabase/supabase-js'

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'tool'
  )
}

/** A slug nobody else has. The link is the product, so it has to be unique. */
export async function uniqueSlug(supabase: SupabaseClient, title: string): Promise<string> {
  const base = slugify(title)

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data } = await supabase.from('tools').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }

  return `${base}-${Math.random().toString(36).slice(2, 7)}`
}
