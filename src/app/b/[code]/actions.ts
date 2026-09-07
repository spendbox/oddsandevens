'use server'

import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { startAttempt } from '@/lib/play'
import { tidyBoxCode } from '@/lib/codes'
import type { Box } from '@/lib/types'

/**
 * Pay a coin and open the game.
 *
 * The failure worth being careful about is charging somebody who then does not
 * get a game. startAttempt does the charge and the attempt in one database
 * transaction, so there is no gap here to fall into: either an attempt id comes
 * back, or the coin was never taken.
 */
export async function play(formData: FormData) {
  const code = tidyBoxCode(String(formData.get('code') ?? ''))
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const { data } = await supabase.from('boxes').select('*').eq('code', code).maybeSingle()
  const box = data as Box | null

  if (!box) redirect('/home')

  const result = await startAttempt(box, profile)

  if (!result.ok) {
    const reason = result.problem === 'not enough coins' ? 'coins' : 'closed'
    redirect(`/b/${box.code}?problem=${reason}`)
  }

  redirect(`/play/${result.attemptId}`)
}
