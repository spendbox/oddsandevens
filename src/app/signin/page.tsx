import Link from 'next/link'
import { Wordmark } from '@/components/ui'
import { signOut } from './actions'
import { SignInForm } from './sign-in-form'

export const metadata = { title: 'Sign in' }

export default async function SignInPage(props: PageProps<'/signin'>) {
  const params = await props.searchParams
  const mode = params.mode === 'signup' ? 'signup' : 'signin'
  const next = typeof params.next === 'string' ? params.next : '/tools'
  const problem = typeof params.problem === 'string' ? params.problem : null

  return (
    <main className="flex min-h-screen flex-col">
      <header className="px-4 py-4 sm:px-6">
        <Wordmark />
      </header>

      <div className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          {problem === 'profile' ? (
            <div className="mb-6 rounded-[12px] bg-warn-soft px-4 py-3.5">
              <p className="text-[13px] font-semibold text-warn">We could not set up your account</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Your sign-in worked, but Forge could not create your profile — which usually means
                the database tables are missing. Run the files in{' '}
                <code className="text-[12px]">supabase/migrations</code>, then sign in again.
              </p>
              <form action={signOut} className="mt-3">
                <button type="submit" className="btn btn-quiet">
                  Sign out
                </button>
              </form>
            </div>
          ) : null}

          <SignInForm mode={mode} next={next} />

          <p className="mt-8 text-center text-xs text-ink-faint">
            <Link href="/" className="hover:text-ink-muted">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
