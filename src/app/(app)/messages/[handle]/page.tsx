import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { timeAgo } from '@/components/ui'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import { MessageComposer } from './composer'

export default async function Thread(props: PageProps<'/messages/[handle]'>) {
  const { handle } = await props.params
  const { userId } = await requireOnboardedProfile()
  const supabase = await supabaseServer()

  const { data: other } = await supabase
    .from('profiles')
    .select('*')
    .eq('handle', handle)
    .maybeSingle()

  if (!other) notFound()

  const person = other as Profile
  const [userA, userB] = userId < person.id ? [userId, person.id] : [person.id, userId]

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle()

  const { data: messages } = conversation
    ? await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at')
        .limit(200)
    : { data: [] as never[] }

  const thread = (messages ?? []) as { id: string; sender_id: string; body: string; created_at: string }[]

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-2xl flex-col px-4 sm:px-6 lg:min-h-screen">
      <header className="flex items-center gap-3 border-b border-line py-4">
        <Link href="/messages" aria-label="Back to messages" className="text-ink-muted hover:text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <Link href={`/u/${person.handle}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar profile={person} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{person.full_name}</p>
            <p className="truncate text-[11px] text-ink-muted">{person.headline}</p>
          </div>
        </Link>
      </header>

      <div className="flex-1 space-y-3 py-5">
        {thread.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-muted">
            No messages yet. Say why you got in touch.
          </p>
        ) : (
          thread.map((message) => {
            const mine = message.sender_id === userId
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-[14px] px-3.5 py-2.5 ${
                    mine ? 'bg-accent text-white' : 'bg-mist text-ink'
                  }`}
                >
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.body}</p>
                  <p
                    className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-ink-faint'}`}
                  >
                    {timeAgo(message.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white py-3">
        <MessageComposer handle={person.handle} otherId={person.id} />
      </div>
    </div>
  )
}
