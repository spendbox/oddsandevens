import Link from 'next/link'
import { LoginForm } from './login-form'
import { signOut } from './actions'

export const metadata = { title: 'Sign in' }

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams
  const mode = params.mode === 'signup' ? 'signup' : 'signin'
  const next = typeof params.next === 'string' ? params.next : '/home'
  const problem = typeof params.problem === 'string' ? params.problem : null

  return (
    <main className="flex min-h-screen flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#5b53e8" />
            <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" strokeWidth="2.2" />
            <circle cx="16" cy="16" r="3" fill="#fff" />
          </svg>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Commons</span>
        </Link>
      </header>

      <div className="flex flex-1 items-start justify-center px-6 pt-10 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          {problem === 'profile' ? (
            <div className="mb-6 rounded-[12px] bg-warn-soft px-4 py-3.5">
              <p className="text-[13px] font-semibold text-warn">We could not set up your profile</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Your account exists, but Commons could not create your profile — which usually means
                the database tables are missing. Run the three files in{' '}
                <code className="text-[12px]">supabase/migrations</code>, then sign in again.
              </p>
              <form action={signOut} className="mt-3">
                <button type="submit" className="btn btn-quiet">
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
          <LoginForm mode={mode} next={next} />
        </div>
      </div>
    </main>
  )
}
