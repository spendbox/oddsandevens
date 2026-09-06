import { SiteHeader } from '@/components/site-header'
import { ENGINE_LIST } from '@/lib/engines'
import { aiConfigured } from '@/lib/claude'
import { requireProfile } from '@/lib/session'
import { BriefBox } from './brief-box'

export const metadata = { title: 'New tool' }

const EXAMPLES = [
  'A calculator that works out import duty on a car coming into Nigeria, from its value, age and engine size',
  'A quiz that tells a small business owner whether they are ready to hire their first employee',
  'An invoice generator for a freelance designer, with my bank details on it',
  'A tracker for my daily expenses, so I can see where the money goes each month',
  'A directory of scholarships open to Nigerian undergraduates',
  'An assistant that answers questions about Nigerian tenancy law for renters in Lagos',
]

export default async function NewToolPage() {
  await requireProfile()
  const ready = aiConfigured()

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-16">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">
          What do you want to build?
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-ink-muted">
          Describe it the way you would explain it to someone. Forge works out what kind of tool it
          is, builds it, and hands it to you to edit.
        </p>

        {!ready ? (
          <div className="mt-6 rounded-[12px] bg-warn-soft px-4 py-3.5">
            <p className="text-[13px] font-semibold text-warn">Forge cannot build tools yet</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              <code className="text-[12px]">ANTHROPIC_API_KEY</code> is not set. Add it in Vercel
              under Settings → Environment Variables (or in <code className="text-[12px]">.env.local</code>{' '}
              locally) and redeploy. You can get one at console.anthropic.com.
            </p>
          </div>
        ) : null}

        <div className="mt-7">
          <BriefBox examples={EXAMPLES} />
        </div>

        <section className="mt-14">
          <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            What Forge can build
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {ENGINE_LIST.map((engine) => (
              <li key={engine.id} className="card p-4">
                <p className="text-sm font-semibold text-ink">
                  {engine.emoji} {engine.name}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{engine.blurb}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-ink-faint">
            You never pick one of these. Describe what you want and Forge chooses — you can change
            it afterwards.
          </p>
        </section>
      </main>
    </>
  )
}
