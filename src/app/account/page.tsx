import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Button, ButtonLink, Card, Empty, Pill, Problem } from '@/components/ui'
import { BankForm } from '@/components/bank-form'
import { PasswordSetup } from '@/components/password-setup'
import { NameForm } from './name-form'
import { isAdmin, requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { listBanks, paymentsConfigured, type Bank } from '@/lib/paystack'
import { naira } from '@/lib/money'
import type { Payout } from '@/lib/types'
import { signOut } from '../enter/actions'

export const metadata = { title: 'Your account' }

export default async function AccountPage() {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const { data } = await supabase
    .from('payouts')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })

  const payouts = (data ?? []) as Payout[]
  const owed = payouts.filter((payout) => payout.status === 'pending')

  // The bank list is Paystack's, and the page must still render without it.
  let banks: Bank[] = []
  let banksProblem: string | null = null
  if (paymentsConfigured()) {
    try {
      banks = await listBanks()
    } catch {
      banksProblem = 'Could not load the bank list from Paystack just now.'
    }
  } else {
    banksProblem = 'Payments are not set up on this deployment yet.'
  }

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
        <p className="mt-1.5 text-mist">{profile.email}</p>

        {owed.length > 0 ? (
          <Card className="mt-6 border-gold/40 bg-gold/10">
            <p className="font-semibold text-gold">
              You are owed {naira(owed.reduce((sum, payout) => sum + payout.amount_naira, 0))}
            </p>
            <p className="mt-1.5 text-sm text-mist">
              Finish the two steps below and it will be transferred to you.
            </p>
            <ButtonLink href="/claim" tone="gold" size="sm" className="mt-4">
              Claim it
            </ButtonLink>
          </Card>
        ) : null}

        {/* ------------------------------ winnings ---------------------- */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Winnings</h2>

          {payouts.length === 0 ? (
            <Empty title="Nothing owed yet">
              Beat a box, or have one of yours beaten, and it turns up here.
            </Empty>
          ) : (
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {payouts.map((payout) => (
                  <li key={payout.id} className="flex items-center gap-3 px-5 py-4">
                    <span className="text-2xl" aria-hidden>
                      {payout.role === 'winner' ? '🏆' : '📦'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{payout.note}</p>
                      <p className="text-xs text-dusk">
                        {payout.role === 'winner' ? 'You beat it' : 'Your box was beaten'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular font-bold text-gold">{naira(payout.amount_naira)}</p>
                      <Pill tone={payout.status === 'paid' ? 'lime' : 'quiet'} className="mt-1">
                        {payout.status === 'paid' ? 'Paid' : 'Pending'}
                      </Pill>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {/* ------------------------------ name -------------------------- */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Your name</h2>
          <Card>
            <NameForm defaultName={profile.display_name} />
          </Card>
        </section>

        {/* ------------------------------ password ---------------------- */}
        <section className="mt-10">
          <h2 className="mb-2 text-xl font-bold tracking-tight">
            Password {profile.password_set ? null : <Pill tone="gold">Not set</Pill>}
          </h2>
          <p className="mb-4 text-sm text-mist">
            {profile.password_set
              ? 'Your password is how you sign in on any device.'
              : 'You have been playing with just your email. Set a password and this account ' +
                'is locked to you — and you can sign in from anywhere.'}
          </p>
          <Card>
            <PasswordSetup hasPassword={profile.password_set} />
          </Card>
        </section>

        {/* ------------------------------ bank -------------------------- */}
        <section className="mt-10">
          <h2 className="mb-2 text-xl font-bold tracking-tight">Where winnings go</h2>
          <p className="mb-4 text-sm text-mist">
            Checked against your bank before it is saved, so a payout cannot go to a typo.
          </p>

          {banksProblem ? (
            <Problem>{banksProblem}</Problem>
          ) : (
            <Card>
              <BankForm profile={profile} banks={banks} />
            </Card>
          )}
        </section>

        <div className="mt-12 flex items-center justify-between gap-4">
          {isAdmin(profile.email) ? (
            <Link
              href="/admin"
              className="text-sm font-medium text-cyan underline underline-offset-4"
            >
              Admin dashboard
            </Link>
          ) : (
            <span />
          )}

          <form action={signOut}>
            <Button type="submit" tone="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </main>
    </>
  )
}
