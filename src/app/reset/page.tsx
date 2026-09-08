import { PendingDot } from '@/components/pending-dot'
import Link from 'next/link'
import { ButtonLink, Card, Problem } from '@/components/ui'
import { Logo } from '@/components/site-header'
import { checkResetToken } from '@/lib/reset'
import { ResetForm } from './reset-form'

export const metadata = { title: 'Choose a new password' }
export const dynamic = 'force-dynamic'

/**
 * Where the emailed reset link lands.
 *
 * The token is checked before the form is drawn, so somebody arriving with a
 * spent or expired link is told so immediately rather than after filling in two
 * password fields.
 */
export default async function ResetPage({ searchParams }: PageProps<'/reset'>) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const check = await checkResetToken(token)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center justify-center gap-3">
        <Logo size={40} />
        <span className="text-2xl font-bold tracking-tight">Spendbox</span>
        <PendingDot />
      </Link>

      <Card>
        {check.ok ? (
          <>
            <h1 className="mb-1 text-xl font-bold tracking-tight">Choose a new password</h1>
            <p className="mb-6 text-sm text-mist">
              This is the password you will use to sign in and to claim anything you win.
            </p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <h1 className="mb-3 text-xl font-bold tracking-tight">This link has expired</h1>
            <Problem>{check.problem}</Problem>
            <ButtonLink href="/enter" size="lg" className="mt-5 w-full">
              Back to sign in
            </ButtonLink>
          </>
        )}
      </Card>
    </main>
  )
}
