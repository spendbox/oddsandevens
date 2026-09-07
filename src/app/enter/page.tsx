import Link from 'next/link'
import { Card } from '@/components/ui'
import { Logo } from '@/components/site-header'
import { EnterForm } from './enter-form'

export const metadata = { title: 'Sign in' }

export default async function EnterPage({
  searchParams,
}: PageProps<'/enter'>) {
  const params = await searchParams
  const raw = params.next
  const next = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/home'
  const problem = typeof params.problem === 'string' ? params.problem : null

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center justify-center gap-3">
        <Logo size={40} />
        <span className="text-2xl font-bold tracking-tight">Spendbox</span>
      </Link>

      {problem === 'profile' ? (
        <p className="mb-4 rounded-2xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
          We could not set up your player profile. Check that the Spendbox tables exist in
          Supabase and that SUPABASE_SERVICE_ROLE_KEY is set, then try again.
        </p>
      ) : null}

      <Card>
        <EnterForm next={next} />
      </Card>

      <p className="mt-6 text-center text-sm text-dusk">
        Play for coins. Coins cost real money. Only spend what you can afford to lose.
      </p>
    </main>
  )
}
