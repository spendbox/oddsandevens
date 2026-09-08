import type { ReactNode } from 'react'
import { SiteHeader } from './site-header'
import { Footer } from './footer'
import type { Profile } from '@/lib/types'

/** The shell every written page shares: header, readable column, footer. */
export function LegalPage({
  profile,
  title,
  intro,
  updated,
  children,
}: {
  profile: Profile | null
  title: string
  intro?: string
  updated?: string
  children: ReactNode
}) {
  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {intro ? <p className="mt-3 text-lg leading-relaxed text-mist">{intro}</p> : null}
        {updated ? <p className="mt-2 text-sm text-dusk">Last updated {updated}</p> : null}

        <div className="mt-10 grid gap-8">{children}</div>
      </main>

      <Footer />
    </>
  )
}

/** One section of a written page. */
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight">{heading}</h2>
      <div className="mt-3 grid gap-3 leading-relaxed text-mist [&_strong]:text-chalk">
        {children}
      </div>
    </section>
  )
}
