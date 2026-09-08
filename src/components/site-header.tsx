import Link from 'next/link'
import { Coins, User } from 'lucide-react'
import { naira } from '@/lib/money'
import { Pill } from './ui'
import { PendingDot } from './pending-dot'
import { Logo } from './logo'
import type { Profile } from '@/lib/types'

/**
 * The bar at the top. On a phone it is a logo, a coin count and a way out —
 * anything more competes with the game for the screen.
 */
export function SiteHeader({ profile }: { profile: Profile | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        <Link
          href={profile ? '/home' : '/'}
          className="flex items-center gap-2.5 transition active:scale-95"
        >
          <Logo />
          <span className="text-lg font-bold tracking-tight">Spendbox</span>
          <PendingDot />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <>
              <Link
                href="/wallet"
                aria-label="Your wallet"
                className="transition active:scale-95"
              >
                <Pill tone="gold" className="tabular">
                  <Coins size={13} />
                  {profile.coins}
                  <span className="hidden text-gold/70 sm:inline">
                    · {naira(profile.coins * 100)}
                  </span>
                  <PendingDot />
                </Pill>
              </Link>
              <Link
                href="/account"
                className="grid size-10 place-items-center rounded-full bg-white/8 text-sm
                           font-bold text-chalk ring-1 ring-inset ring-white/12 transition
                           active:scale-90 active:bg-white/16"
                aria-label="Your account"
              >
                <User size={17} />
                <PendingDot />
              </Link>
            </>
          ) : (
            <Link
              href="/enter"
              className="inline-flex items-center rounded-2xl bg-white/8 px-4 py-2 text-sm
                         font-semibold ring-1 ring-inset ring-white/12 transition
                         active:scale-95 active:bg-white/16"
            >
              Sign in
              <PendingDot />
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export { Logo }
