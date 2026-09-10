'use server'

import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { makeBoxCode } from '@/lib/codes'
import { livePrize } from '@/lib/settings'

/**
 * Make a box. Free, and the person keeps one at a time.
 *
 * The one-at-a-time rule is a partial unique index on the boxes table, not a
 * check here: two taps arriving together are a race, and the database is the
 * only thing that reliably wins it. A 23505 on the creator index means they
 * already have one open, which is not an error worth alarming anybody about —
 * send them to the box they already have.
 *
 * The prize is sent along with the insert and then overruled by the trigger in
 * 0012_editable_prize.sql, which stamps on whatever the settings row says. Both
 * halves are deliberate: this insert goes through the caller's own client, so
 * the amount in the payload is not something to be trusted with a six-figure
 * promise, and a database that has not had 0012 applied still needs a sensible
 * number to fall back on. It is the same arrangement as the price of a game
 * being passed into start_attempt rather than assumed there.
 */
export async function createBox(formData: FormData) {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const title = String(formData.get('title') ?? '').trim().slice(0, 60)

  // What a box is worth right now, per the settings row — the constant in
  // money.ts only if that cannot be read. The trigger has the last word either
  // way.
  const prize = await livePrize()

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeBoxCode()

    const { data, error } = await supabase
      .from('boxes')
      .insert({
        code,
        creator_id: profile.id,
        creator_name: profile.display_name,
        title,
        prize_naira: prize,
      })
      .select('code')
      .maybeSingle()

    if (data) redirect(`/b/${data.code}?fresh=1`)

    // The cap is enforced by a trigger, which raises a check_violation. It is
    // not the creator's fault and there is nothing for them to retry, so it
    // gets its own message rather than "try once more".
    if (error?.message?.includes('box limit reached')) redirect('/home?problem=full')

    if (error?.code === '23505') {
      // Which unique index tripped? The creator one means they already have a
      // live box; the code one is a collision worth retrying.
      if (error.message.includes('boxes_one_open_per_creator')) {
        const { data: existing } = await supabase
          .from('boxes')
          .select('code')
          .eq('creator_id', profile.id)
          .eq('status', 'open')
          .maybeSingle()

        if (existing) redirect(`/b/${existing.code}`)
        redirect('/home?problem=already')
      }
      continue
    }

    break
  }

  redirect('/home?problem=box')
}
