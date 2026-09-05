import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { EmptyState, timeAgo } from '@/components/ui'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export const metadata = { title: 'Notifications' }

const KIND_ICON: Record<string, string> = {
  progress: '📈',
  reply: '💬',
  ask: '🤝',
  connection: '👋',
}

export default async function Notifications() {
  const { userId } = await requireOnboardedProfile()
  const supabase = await supabaseServer()

  const { data } = await supabase
    .from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60)

  const notifications = (data ?? []) as unknown as {
    id: string
    kind: string
    title: string
    body: string
    href: string | null
    read_at: string | null
    created_at: string
    actor: Profile | null
  }[]

  // Reading the page is what marks them read.
  const unread = notifications.filter((item) => !item.read_at).map((item) => item.id)
  if (unread.length > 0) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unread)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
        Notifications
      </h1>

      <div className="mt-6">
        {notifications.length > 0 ? (
          <ul className="card divide-y divide-line">
            {notifications.map((notification) => {
              const content = (
                <div
                  className={`flex items-start gap-3 px-4 py-3.5 ${
                    notification.read_at ? '' : 'bg-accent-soft/40'
                  }`}
                >
                  {notification.actor ? (
                    <Avatar profile={notification.actor} size="sm" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist text-sm">
                      {KIND_ICON[notification.kind] ?? '🔔'}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{notification.title}</p>
                    {notification.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
                        {notification.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {timeAgo(notification.created_at)}
                    </p>
                  </div>
                </div>
              )

              return (
                <li key={notification.id}>
                  {notification.href ? (
                    <Link href={notification.href} className="block transition-colors hover:bg-mist">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon="🔔"
            title="Nothing yet"
            body="When someone answers you, moves past your stage, or matches what you asked for, it shows here."
          />
        )}
      </div>
    </div>
  )
}
