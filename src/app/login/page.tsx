import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in' }

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams
  const mode = params.mode === 'signup' ? 'signup' : 'signin'
  const next = typeof params.next === 'string' ? params.next : '/home'

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
          <LoginForm mode={mode} next={next} />
        </div>
      </div>
    </main>
  )
}
