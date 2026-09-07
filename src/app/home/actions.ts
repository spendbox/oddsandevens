'use server'

import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { makeBoxCode } from '@/lib/codes'
import { PRIZE_NAIRA } from '@/lib/money'

/**
 * Make a box. Free, and the only thing it asks for is a name — and even that is
 * optional.
 *
 * The insert goes through the signed-in user's own client, not the service-role
 * one, so the "creator_id = auth.uid()" policy is doing the checking. There is
 * nothing here worth bypassing it for.
 */
export async function createBox(formData: FormData) {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const title = String(formData.get('title') ?? '').trim().slice(0, 60)

  // The code column is unique, so a clash is just a retry. Six characters from
  // a 31-letter alphabet makes that vanishingly rare, but "rare" is not "never".
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeBoxCode()

    const { data, error } = await supabase
      .from('boxes')
      .insert({
        code,
        creator_id: profile.id,
        creator_name: profile.display_name,
        title,
        prize_naira: PRIZE_NAIRA,
      })
      .select('code')
      .maybeSingle()

    if (data) redirect(`/b/${data.code}`)
    if (error?.code !== '23505') break
  }

  redirect('/home?problem=box')
}
