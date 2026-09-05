import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import {
  BellIcon,
  HomeIcon,
  MessageIcon,
  PeopleIcon,
  PlusIcon,
  ProfileIcon,
  PursuitIcon,
  SearchIcon,
} from '@/components/icons'
import { MobileNav, SidebarNav, type NavItem } from '@/components/nav'
import { ServiceWorker } from '@/components/service-worker'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, userId } = await requireProfile()
  const supabase = await supabaseServer()

  const [{ count: unreadNotifications }, { count: pendingConnections }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null),
    supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', userId)
      .eq('status', 'pending'),
  ])

  const items: NavItem[] = [
    { href: '/home', label: 'Home', icon: <HomeIcon /> },
    { href: '/discover', label: 'Discover', icon: <SearchIcon /> },
    { href: '/pursuits', label: 'Pursuits', icon: <PursuitIcon /> },
    { href: '/people', label: 'People', icon: <PeopleIcon />, badge: pendingConnections ?? 0 },
    { href: '/messages', label: 'Messages', icon: <MessageIcon /> },
  ]

  const mobileItems: NavItem[] = [
    items[0],
    items[1],
    items[2],
    { ...items[4], badge: 0 },
  ]

  return (
    <div className="min-h-screen lg:flex">
      <ServiceWorker />

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line px-4 py-5 lg:flex">
        <Link href="/home" className="mb-7 flex items-center gap-2 px-2">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#5b53e8" />
            <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" strokeWidth="2.2" />
            <circle cx="16" cy="16" r="3" fill="#fff" />
          </svg>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Commons</span>
        </Link>

        <SidebarNav
          items={[
            ...items,
            {
              href: '/notifications',
              label: 'Notifications',
              icon: <BellIcon />,
              badge: unreadNotifications ?? 0,
            },
            { href: '/profile', label: 'Profile', icon: <ProfileIcon /> },
          ]}
        />

        <Link href="/pursuits/new" className="btn btn-primary mt-6 w-full py-2.5">
          <PlusIcon />
          Create pursuit
        </Link>

        <div className="mt-auto pt-6">
          <Link
            href="/profile"
            className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 transition-colors hover:bg-mist"
          >
            <Avatar profile={profile} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink">
                {profile.full_name || profile.handle}
              </p>
              <p className="truncate text-[11px] text-ink-muted">View profile</p>
            </div>
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <Link href="/profile" aria-label="Your profile">
          <Avatar profile={profile} size="sm" />
        </Link>
        <Link href="/home" className="flex items-center gap-1.5">
          <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#5b53e8" />
            <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" strokeWidth="2.2" />
            <circle cx="16" cy="16" r="3" fill="#fff" />
          </svg>
          <span className="text-sm font-semibold tracking-[-0.02em]">Commons</span>
        </Link>
        <Link href="/notifications" aria-label="Notifications" className="relative text-ink-soft">
          <BellIcon />
          {unreadNotifications ? (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />
          ) : null}
        </Link>
      </header>

      <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>

      <MobileNav items={mobileItems} />
    </div>
  )
}
