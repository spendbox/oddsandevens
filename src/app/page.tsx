import Link from 'next/link'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

const EXAMPLES = [
  { emoji: '🚀', title: 'Build a Profitable SaaS Company', people: '8,421' },
  { emoji: '📍', title: 'Move to Canada', people: '3,120' },
  { emoji: '🏃', title: 'Run a Half Marathon', people: '2,847' },
  { emoji: '🐍', title: 'Learn Python Properly', people: '5,209' },
]

const SURFACES = [
  ['Discuss', 'Questions and hard-won answers, kept instead of scrolled past.'],
  ['Progress', 'See who is ahead of you, level with you, and just behind.'],
  ['People', 'Introductions with a reason attached, not a member list.'],
  ['Help', 'Post what you need. Post what you can give. Get matched.'],
  ['Learn', 'One knowledge base per outcome, built by everyone in it.'],
  ['Do', 'Challenges, meetups and sessions that make people finish.'],
]

export default async function Landing() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/home')

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Commons</span>
        </div>
        <Link href="/login" className="btn btn-quiet">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-14 pb-20 sm:pt-24">
        <p className="mb-5 text-xs font-medium tracking-wide text-accent uppercase">
          An intent network
        </p>
        <h1 className="max-w-3xl text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] text-ink sm:text-[3.25rem]">
          Find the people pursuing
          <br />
          what you are pursuing.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft sm:text-base">
          Most networks connect you to people you already know. Commons connects you to people who
          want the same outcome you do — and shows you exactly why each of them is worth your time.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/login?mode=signup" className="btn btn-primary px-5 py-2.5">
            Start a pursuit
          </Link>
          <Link href="/login" className="btn btn-quiet px-5 py-2.5">
            I already have an account
          </Link>
        </div>

        <div className="mt-14 grid gap-2.5 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <div key={example.title} className="card card-hover flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-mist text-base">
                {example.emoji}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{example.title}</p>
                <p className="text-xs text-ink-muted">{example.people} pursuing this</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-mist">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="max-w-lg text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
            A pursuit is a workspace, not a group chat.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">
            Every pursuit is built around six things, so the work of getting somewhere does not get
            buried under the conversation about getting there.
          </p>

          <div className="mt-9 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {SURFACES.map(([title, body], index) => (
              <div key={title}>
                <p className="text-[11px] font-medium text-ink-faint tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-1.5 text-sm font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <blockquote className="max-w-2xl">
          <p className="text-lg leading-relaxed font-medium tracking-[-0.01em] text-ink sm:text-xl">
            &ldquo;You don&rsquo;t join <em>Learn Python</em> to talk about Python. You join because
            something should actually help you learn it — and then help you teach the next
            person.&rdquo;
          </p>
        </blockquote>
        <Link href="/login?mode=signup" className="btn btn-primary mt-8 px-5 py-2.5">
          Join Commons
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Mark small />
            <span>Commons</span>
          </div>
          <p>People connect around outcomes, not follows.</p>
        </div>
      </footer>
    </main>
  )
}

function Mark({ small }: { small?: boolean }) {
  const size = small ? 16 : 22
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#5b53e8" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="3" fill="#fff" />
    </svg>
  )
}
