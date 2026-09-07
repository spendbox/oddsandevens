import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Button, Card, Empty, Pill } from '@/components/ui'
import { isAdmin, requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { naira } from '@/lib/money'
import type { Payout } from '@/lib/types'
import { signOut } from '../enter/actions'
import { AccountForm } from './account-form'

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
  const missingBank = payouts.some((p) => p.status === 'pending') && !profile.account_number

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
        <p className="mt-1.5 text-mist">{profile.email}</p>

        {/* --------------------------- winnings ------------------------- */}
        <section className="mt-8">
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
                        {payout.role === 'winner' ? 'You beat it' : 'Your box was beaten'} ·{' '}
                        {new Date(payout.created_at).toLocaleDateString('en-NG', {
                          day: 'numeric',
                          month: 'short',
                        })}
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

          {missingBank ? (
            <p className="mt-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
              Add your bank details below so your winnings can be sent.
            </p>
          ) : null}
        </section>

        {/* --------------------------- details -------------------------- */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Details</h2>
          <Card>
            <AccountForm profile={profile} />
          </Card>
        </section>

        <div className="mt-10 flex items-center justify-between gap-4">
          {isAdmin(profile.email) ? (
            <Link
              href="/admin/payouts"
              className="text-sm font-medium text-cyan underline underline-offset-4"
            >
              Payout queue
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
