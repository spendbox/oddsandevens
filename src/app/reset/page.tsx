import Link from 'next/link'
import { Card } from '@/components/ui'
import { Logo } from '@/components/site-header'
import { ResetForm } from './reset-form'

export const metadata = { title: 'Choose a new password' }
export const dynamic = 'force-dynamic'

/**
 * Where the emailed reset link lands.
 *
 * Supabase signs the person in as part of following the link, so this page just
 * asks for the new password. If the link has expired there is no session, and
 * the form says so rather than failing silently.
 */
export default function ResetPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center justify-center gap-3">
        <Logo size={40} />
        <span className="text-2xl font-bold tracking-tight">Spendbox</span>
      </Link>

      <Card>
        <h1 className="mb-1 text-xl font-bold tracking-tight">Choose a new password</h1>
        <p className="mb-6 text-sm text-mist">
          This is the password you will use to sign in and to claim anything you win.
        </p>
        <ResetForm />
      </Card>
    </main>
  )
}
