import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { EmptyState, timeAgo } from '@/components/ui'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const metadata = { title: 'Messages' }

export default async function Messages() {
  const { userId } = await requireOnboardedProfile()
  const supabase = await supabaseServer()

  const { data: conversations } = await supabase
    .from('conversations')
    .select(
      'id, last_message_at, a:profiles!conversations_user_a_fkey(*), b:profiles!conversations_user_b_fkey(*)',
    )
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('last_message_at', { ascending: false })
    .limit(50)

  const rows = (conversations ?? []) as unknown as {
    id: string
    last_message_at: string
    a: Profile
    b: Profile
  }[]

  const threads = await Promise.all(
    rows.map(async (row) => {
      const other = row.a.id === userId ? row.b : row.a
      const { data: last } = await supabase
        .from('messages')
        .select('body, sender_id, created_at')
        .eq('conversation_id', row.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return { other, last, at: row.last_message_at }
    }),
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">Messages</h1>
      <p className="mt-1 text-sm text-ink-muted">
        One-to-one. The pursuit discussion is where things worth keeping go.
      </p>

      <div className="mt-6">
        {threads.length > 0 ? (
          <ul className="card divide-y divide-line">
            {threads.map((thread) => (
              <li key={thread.other.id}>
                <Link
                  href={`/messages/${thread.other.handle}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-mist"
                >
                  <Avatar profile={thread.other} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {thread.other.full_name}
                      </p>
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {timeAgo(thread.at)}
                      </span>
                    </div>
                    <p className="truncate text-[12px] text-ink-muted">
                      {thread.last
                        ? `${thread.last.sender_id === userId ? 'You: ' : ''}${thread.last.body}`
                        : 'No messages yet'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="💬"
            title="No conversations yet"
            body="Connect with someone from one of your pursuits and you can talk here."
          >
            <Link href="/people" className="btn btn-primary">
              See people
            </Link>
          </EmptyState>
        )}
      </div>
    </div>
  )
}
