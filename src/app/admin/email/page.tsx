import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CircleAlert, CircleCheck } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { Card, Empty, Pill } from '@/components/ui'
import { adminsConfigured, isAdmin, requireProfile } from '@/lib/session'
import { AdminNotConfigured } from '../not-configured'
import { probeEmailSetup } from './actions'
import { TestForm } from './test-form'

export const metadata = { title: 'Email' }
export const dynamic = 'force-dynamic'

/**
 * Why an email did or did not go out.
 *
 * Password resets are deliberately silent to the browser — telling somebody
 * "no account with that address" turns the form into a way to find out who has
 * one. That silence has to stop somewhere, and this is where: every dependency
 * shown, a real send on demand, and the last few attempts listed.
 */
export default async function AdminEmailPage() {
  const { profile } = await requireProfile()

  if (!adminsConfigured()) return <AdminNotConfigured email={profile.email} />
  if (!isAdmin(profile.email)) notFound()

  const probe = await probeEmailSetup()

  const domain = probe.from?.match(/@([^\s>]+)/)?.[1] ?? null

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm text-dusk hover:text-mist"
        >
          <ChevronLeft size={15} /> Admin
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Email</h1>
          <Pill tone="rose">Staff only</Pill>
        </div>
        <p className="mt-1.5 text-mist">
          Everything a password reset needs, and a way to test it for real.
        </p>

        {/* ---------------------------- the checks ---------------------- */}
        <Card className="mt-8">
          <p className="mb-4 text-sm font-semibold">Setup</p>
          <ul className="grid gap-3 text-sm">
            <Check
              ok={probe.hasKey}
              label="RESEND_API_KEY is set"
              detail={probe.hasKey ? 'Present' : 'Missing — add it in Vercel and redeploy.'}
            />
            <Check
              ok={Boolean(probe.from)}
              label="EMAIL_FROM is set"
              detail={probe.from ?? 'Missing — add it in Vercel and redeploy.'}
            />
            <Check
              ok={Boolean(domain)}
              label="Sending domain"
              detail={
                domain
                  ? `${domain} — this must be verified in Resend, and must be a domain you own.`
                  : 'Could not read a domain out of EMAIL_FROM.'
              }
            />
            <Check
              ok={probe.tableReady}
              label="password_resets table exists"
              detail={
                probe.tableReady
                  ? 'Ready'
                  : `${probe.tableProblem ?? 'Not reachable'} — run migration 0005.`
              }
            />
          </ul>
        </Card>

        {/* ---------------------------- the test ------------------------ */}
        <Card className="mt-4">
          <p className="mb-1 text-sm font-semibold">Send a real one</p>
          <p className="mb-4 text-xs text-dusk">
            This goes through exactly the same path as a password reset. If Resend refuses
            it, its own words appear below.
          </p>
          <TestForm defaultTo={profile.email} />
        </Card>

        {/* ---------------------------- history ------------------------- */}
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold tracking-tight">Recent reset requests</h2>
          {probe.recent.length === 0 ? (
            <Empty title="No reset has been requested yet">
              A row appears here the moment somebody asks for one — whether or not the email
              then sends.
            </Empty>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {probe.recent.map((row, index) => (
                  <li key={index} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{row.email}</p>
                      <p className="text-xs text-dusk">
                        {new Date(row.created_at).toLocaleString('en-NG')}
                      </p>
                    </div>
                    <Pill tone={row.used_at ? 'lime' : 'quiet'}>
                      {row.used_at ? 'used' : 'unused'}
                    </Pill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="mt-3 text-xs text-dusk">
            A row here with no email in the inbox means the token was written and the send
            failed. No row at all means it stopped earlier — no such account, or the limit of
            six an hour. Both are in the server logs now.
          </p>
        </section>
      </main>

      <Footer />
    </>
  )
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      {ok ? (
        <CircleCheck size={18} className="mt-0.5 shrink-0 text-lime" />
      ) : (
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose" />
      )}
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className={'text-xs ' + (ok ? 'text-dusk' : 'text-rose')}>{detail}</p>
      </div>
    </li>
  )
}
