'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { segment: '', label: 'Home' },
  { segment: 'discussions', label: 'Discussions' },
  { segment: 'progress', label: 'Progress' },
  { segment: 'people', label: 'People' },
  { segment: 'help', label: 'Help' },
  { segment: 'resources', label: 'Resources' },
  { segment: 'events', label: 'Events' },
]

export function PursuitTabs({ slug }: { slug: string }) {
  const pathname = usePathname()
  const base = `/p/${slug}`

  return (
    <nav className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Pursuit sections">
      <div className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base
          const active = pathname === href
          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative px-3 py-2.5 text-[13px] font-medium transition-colors ${
                active ? 'text-ink' : 'text-ink-muted hover:text-ink-soft'
              }`}
            >
              {tab.label}
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
