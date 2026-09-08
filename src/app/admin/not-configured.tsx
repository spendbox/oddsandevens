import { KeyRound } from 'lucide-react'
import { Card } from '@/components/ui'

/**
 * Shown when ADMIN_EMAILS has not been set on this deployment.
 *
 * Safe to show to anyone signed in: it contains no data about the site, only
 * setup instructions and the reader's own email address, which they already
 * know. The alternative — a bare 404 — is what sent you here in the first place.
 */
export function AdminNotConfigured({ email }: { email: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <KeyRound size={44} className="text-gold" />
      <h1 className="mt-4 text-3xl font-bold tracking-tight">No admins are set up yet</h1>
      <p className="mt-3 leading-relaxed text-mist">
        The admin dashboard is locked to a list of email addresses, and that list is empty on
        this deployment — so nobody can open it, including you.
      </p>

      <Card className="mt-8">
        <p className="text-sm font-semibold">To let yourself in</p>
        <ol className="mt-3 grid gap-3 text-sm text-mist">
          <li>
            <span className="font-semibold text-chalk">1.</span> In Vercel, open Settings →
            Environment Variables.
          </li>
          <li>
            <span className="font-semibold text-chalk">2.</span> Add a variable named{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-cyan">
              ADMIN_EMAILS
            </code>{' '}
            listing the addresses that should have access:
            <span className="mt-2 block rounded-xl bg-black/40 px-3 py-2 font-mono text-chalk">
              spendbox@gmail.com{email.toLowerCase() !== 'spendbox@gmail.com' ? `,${email}` : ''}
            </span>
            <span className="mt-1.5 block text-xs text-dusk">
              Spendbox&apos;s own address, plus the one you are signed in as. Separate several
              with commas. No <code className="font-mono">NEXT_PUBLIC_</code> prefix — this
              one is server-side only, and it is never sent to a browser.
            </span>
          </li>
          <li>
            <span className="font-semibold text-chalk">3.</span> Redeploy. Environment
            variables are read when the site is built, so an existing deployment will not
            pick it up on its own.
          </li>
        </ol>
      </Card>

      <p className="mt-6 text-sm text-dusk">
        Running locally? Put the same line in <code className="font-mono">.env.local</code> and
        restart <code className="font-mono">next dev</code>.
      </p>
    </main>
  )
}
