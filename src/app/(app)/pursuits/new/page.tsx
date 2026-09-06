import Link from 'next/link'
import { PursuitCard } from '@/components/pursuit-card'
import { findSimilarPursuits, myPursuits } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { suggestForIntent, titleFromIntent } from '@/lib/stage-suggestions'
import { CreateForm } from './create-form'
import { IntentBox } from './intent-box'

export const metadata = { title: 'Start a pursuit' }

/**
 * Creating a pursuit begins with a sentence, not a form.
 *
 * You type what you want the way you would type it into a search box — "I want
 * to learn AI automation this year" — and the first thing Commons does is try
 * to talk you out of creating anything, by showing you the people already
 * doing it. A pursuit split across four near-identical copies helps nobody.
 * Only when none of them fit do you go on to make one.
 */
export default async function NewPursuit(props: PageProps<'/pursuits/new'>) {
  const params = await props.searchParams
  const intent = typeof params.q === 'string' ? params.q.trim() : ''
  const creating = params.create === '1'

  const { userId } = await requireOnboardedProfile()

  // Step one: say what you want.
  if (!intent) {
    return (
      <Shell step={1}>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
          What do you want to do?
        </h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">
          Write it the way you would say it out loud. Commons will look for the people already
          pursuing it before you go to the trouble of starting something new.
        </p>
        <div className="mt-6">
          <IntentBox />
        </div>
        <ul className="mt-6 space-y-1.5 text-[13px] text-ink-faint">
          <li>· &ldquo;I want to learn AI automation this year&rdquo;</li>
          <li>· &ldquo;Build a profitable SaaS company&rdquo;</li>
          <li>· &ldquo;I need to get out of debt&rdquo;</li>
        </ul>
      </Shell>
    )
  }

  // Step two: look at what already exists.
  if (!creating) {
    const [matches, memberships] = await Promise.all([
      findSimilarPursuits(intent, 6),
      myPursuits(userId),
    ])
    const joined = new Set(memberships.map((membership) => membership.pursuit_id))

    return (
      <Shell step={2}>
        <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">You said</p>
        <h1 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
          &ldquo;{intent}&rdquo;
        </h1>

        {matches.length > 0 ? (
          <>
            <p className="mt-5 text-sm text-ink-soft">
              {matches.length === 1
                ? 'One pursuit already exists for this. Joining it puts you next to people who are further along than you.'
                : `${matches.length} pursuits already exist for this. Joining one puts you next to people who are further along than you.`}
            </p>
            <div className="mt-4 grid gap-3">
              {matches.map((pursuit) => (
                <PursuitCard key={pursuit.id} pursuit={pursuit} joined={joined.has(pursuit.id)} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-ink-soft">
            Nothing here matches that yet. You would be the first — which means the people who want
            the same thing will find it through you.
          </p>
        )}

        <div className="mt-7 border-t border-line pt-6">
          <p className="text-sm font-medium text-ink">
            {matches.length > 0 ? 'None of these fit?' : 'Ready to start it?'}
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">
            The next step suggests the stages people pass through on the way to this. You can change
            all of them.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/pursuits/new?q=${encodeURIComponent(intent)}&create=1`}
              className="btn btn-primary px-5"
            >
              Create this pursuit
            </Link>
            <Link href="/pursuits/new" className="btn btn-quiet">
              Start over
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  // Step three: the shape of the journey, proposed rather than demanded.
  const suggestion = suggestForIntent(intent)

  return (
    <Shell step={3}>
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
        Here is a shape to start from
      </h1>
      <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-muted">
        These are the stages people usually pass through on the way to this. Rename them, remove
        them, add your own — the ones you end up with are what everybody who joins will be placed
        against.
      </p>

      <div className="mt-7">
        <CreateForm
          intent={intent}
          initialTitle={titleFromIntent(intent)}
          suggestion={suggestion}
        />
      </div>
    </Shell>
  )
}

function Shell({ step, children }: { step: 1 | 2 | 3; children: React.ReactNode }) {
  const labels = ['What you want', 'What exists already', 'The journey']

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 lg:py-10">
      <ol className="mb-8 flex items-center gap-2">
        {labels.map((label, index) => {
          const position = index + 1
          const done = position < step
          const current = position === step
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  done
                    ? 'bg-lift text-white'
                    : current
                      ? 'bg-accent text-white'
                      : 'bg-mist text-ink-faint'
                }`}
              >
                {done ? '✓' : position}
              </span>
              <span
                className={`hidden text-[11px] sm:block ${current ? 'font-medium text-ink' : 'text-ink-faint'}`}
              >
                {label}
              </span>
              {position < 3 ? <span className="h-px flex-1 bg-line" /> : null}
            </li>
          )
        })}
      </ol>
      {children}
    </div>
  )
}
