import Link from 'next/link'
import { naira } from '@/lib/money'
import { Pill } from './ui'
import type { Profile } from '@/lib/types'

/**
 * The bar at the top. On a phone it is a logo, a coin count and a way out —
 * anything more competes with the game for the screen.
 */
export function SiteHeader({ profile }: { profile: Profile | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        <Link href={profile ? '/home' : '/'} className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-bold tracking-tight">Spendbox</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <>
              <Link href="/wallet" aria-label="Your wallet">
                <Pill tone="gold" className="tabular">
                  <span aria-hidden>🪙</span>
                  {profile.coins}
                  <span className="hidden text-gold/70 sm:inline">
                    · {naira(profile.coins * 100)}
                  </span>
                </Pill>
              </Link>
              <Link
                href="/account"
                className="grid size-10 place-items-center rounded-full bg-white/8 text-sm
                           font-bold text-chalk ring-1 ring-inset ring-white/12"
                aria-label="Your account"
              >
                {(profile.display_name || profile.email || '?').charAt(0).toUpperCase()}
              </Link>
            </>
          ) : (
            <Link
              href="/enter"
              className="rounded-2xl bg-white/8 px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-white/12"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="sb-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a855f7" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#150c2e" />
      <g fill="url(#sb-logo)">
        <rect x="12" y="12" width="12" height="12" rx="4" />
        <rect x="40" y="12" width="12" height="12" rx="4" />
        <rect x="26" y="26" width="12" height="12" rx="4" />
        <rect x="12" y="40" width="12" height="12" rx="4" />
        <rect x="40" y="40" width="12" height="12" rx="4" />
      </g>
    </svg>
  )
}
