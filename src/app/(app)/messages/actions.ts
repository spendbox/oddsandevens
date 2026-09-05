'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Conversations are keyed by an ordered pair, so the same two people can only
 * ever have one. The ordering is enforced in the database (user_a < user_b),
 * which is what makes "find or create" safe to call from anywhere.
 */
export async function findOrCreateConversation(otherId: string, selfId: string) {
  const supabase = await supabaseServer()
  const [userA, userB] = selfId < otherId ? [selfId, otherId] : [otherId, selfId]

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created } = await supabase
    .from('conversations')
    .insert({ user_a: userA, user_b: userB })
    .select('id')
    .single()

  return created?.id ?? null
}

export async function sendMessage(formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const body = String(formData.get('body') ?? '').trim()
  if (!body) return

  const handle = String(formData.get('handle'))
  const otherId = String(formData.get('other_id'))

  const conversationId = await findOrCreateConversation(otherId, user.id)
  if (!conversationId) return

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body: body.slice(0, 4000),
  })

  revalidatePath(`/messages/${handle}`)
  revalidatePath('/messages')
}
