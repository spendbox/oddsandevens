'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from './supabase/server'

/**
 * A connection request carries the reason the two people were matched, so the
 * person receiving it sees "they can help with the B2B acquisition you asked
 * about" rather than a bare notification.
 */
export async function requestConnection(
  addresseeId: string,
  reason: string,
  pursuitId: string | null,
  path: string,
) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase.from('connections').upsert(
    {
      requester_id: user.id,
      addressee_id: addresseeId,
      reason: reason.slice(0, 280),
      pursuit_id: pursuitId,
    },
    { onConflict: 'requester_id,addressee_id' },
  )

  const { data: me } = await supabase
    .from('profiles')
    .select('full_name, handle')
    .eq('id', user.id)
    .maybeSingle()

  await supabase.from('notifications').insert({
    user_id: addresseeId,
    kind: 'connection',
    title: `${me?.full_name ?? 'Someone'} wants to connect`,
    body: reason,
    href: `/people`,
    actor_id: user.id,
  })

  revalidatePath(path)
}

export async function answerConnection(connectionId: string, accept: boolean, path: string) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  await supabase
    .from('connections')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', connectionId)
    .eq('addressee_id', user.id)

  if (accept) {
    const { data: connection } = await supabase
      .from('connections')
      .select('requester_id')
      .eq('id', connectionId)
      .maybeSingle()

    const { data: me } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (connection) {
      await supabase.from('notifications').insert({
        user_id: connection.requester_id,
        kind: 'connection',
        title: `${me?.full_name ?? 'Someone'} accepted your request`,
        body: 'You can message each other now.',
        href: '/messages',
        actor_id: user.id,
      })
    }
  }

  revalidatePath(path)
}
