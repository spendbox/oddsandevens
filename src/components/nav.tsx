'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
}

function isActive(pathname: string, href: string) {
  if (href === '/home') return pathname === '/home'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-accent-soft font-medium text-accent'
                : 'text-ink-soft hover:bg-mist hover:text-ink'
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  const [first, second, ...rest] = items
  const [third, fourth] = rest

  const tab = (item: NavItem) => {
    const active = isActive(pathname, item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
          active ? 'text-accent' : 'text-ink-muted'
        }`}
      >
        <span className="relative">
          {item.icon}
          {item.badge ? (
            <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />
          ) : null}
        </span>
        {item.label}
      </Link>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-sm lg:hidden">
      <div className="mx-auto flex max-w-md items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
        {tab(first)}
        {tab(second)}
        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/pursuits/new"
            aria-label="Create a pursuit"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </div>
        {third ? tab(third) : null}
        {fourth ? tab(fourth) : null}
      </div>
    </nav>
  )
}
