import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/ui'
import { ENGINE_LIST } from '@/lib/engines'
import { optionalProfile } from '@/lib/session'

const SHOWCASE = [
  'A calculator for import duty on a car coming into Nigeria',
  'A quiz that scores how ready a business is to hire',
  'An invoice generator with my bank details on it',
  'A tracker for daily expenses',
  'A directory of scholarships for Nigerian students',
  'An assistant that answers tenancy law questions',
]

export default async function Landing() {
  const { profile } = await optionalProfile()
  if (profile) redirect('/tools')

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-1.5">
          <Link href="/signin" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/signin?mode=signup" className="btn btn-primary">
            Start building
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-14 pb-20 sm:px-6 sm:pt-24">
        <h1 className="max-w-3xl text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-ink sm:text-[3.25rem]">
          Describe a tool.
          <br />
          Get a tool.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-base">
          Say what you want in a sentence. Forge builds it, you change whatever you like, and you
          get a link. Share it, or charge for it.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/signin?mode=signup" className="btn btn-primary px-5 py-2.5">
            Build something
          </Link>
          <Link href="/signin" className="btn btn-quiet px-5 py-2.5">
            I have an account
          </Link>
        </div>

        <div className="mt-14 grid gap-2 sm:grid-cols-2">
          {SHOWCASE.map((example) => (
            <div key={example} className="card px-4 py-3">
              <p className="text-[13px] leading-relaxed text-ink-soft">
                <span className="text-ink-faint">&ldquo;</span>
                {example}
                <span className="text-ink-faint">&rdquo;</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-mist">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="max-w-lg text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
            Six kinds of tool, one sentence each.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
            You never choose from this list. Forge reads what you asked for and picks — and you can
            change its mind.
          </p>

          <div className="mt-9 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {ENGINE_LIST.map((engine) => (
              <div key={engine.id}>
                <h3 className="text-sm font-semibold text-ink">
                  {engine.emoji} {engine.name}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{engine.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          {[
            ['Describe it', 'One or two sentences, the way you would explain it to a person.'],
            ['Edit it', 'Ask for changes in plain words, or edit any part of it by hand.'],
            ['Share it', 'Publish and you have a link. Free, or paid — you keep the earnings.'],
          ].map(([title, body], index) => (
            <div key={title}>
              <p className="text-[11px] font-medium text-ink-faint tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-1.5 text-sm font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>

        <Link href="/signin?mode=signup" className="btn btn-primary mt-10 px-5 py-2.5">
          Build something
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-8 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark />
          <p>Turn what you know into something people can use.</p>
        </div>
      </footer>
    </main>
  )
}
