import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { Button, Card, Empty, Pill } from '@/components/ui'
import { isAdmin, requireProfile } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { naira } from '@/lib/money'
import type { Payout, Profile } from '@/lib/types'
import { markPaid } from './actions'

export const metadata = { title: 'Payout queue' }
export const dynamic = 'force-dynamic'

/**
 * The list of transfers to make by hand.
 *
 * Paying out through Paystack's dashboard rather than through code is a
 * deliberate choice: it means no key on this server can move money on its own.
 * The cost is this page, which is the worklist for whoever does it.
 */
export default async function PayoutQueuePage() {
  const { profile } = await requireProfile()

  // Not "403": somebody who is not an admin should not learn this page exists.
  if (!isAdmin(profile.email)) notFound()

  const admin = supabaseAdmin()

  const { data: rows } = await admin
    .from('payouts')
    .select('*')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200)

  const payouts = (rows ?? []) as Payout[]

  const { data: people } = await admin
    .from('profiles')
    .select('id, email, display_name, bank_name, account_number, account_name')
    .in('id', payouts.length > 0 ? payouts.map((payout) => payout.user_id) : ['none'])

  const byId = new Map(
    ((people ?? []) as Profile[]).map((person) => [person.id, person]),
  )

  const pending = payouts.filter((payout) => payout.status === 'pending')
  const owed = pending.reduce((total, payout) => total + payout.amount_naira, 0)

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="text-3xl font-bold tracking-tight">Payout queue</h1>
        <p className="mt-1.5 text-mist">
          {pending.length} pending · {naira(owed)} to send. Make the transfer in Paystack, then
          tick it off here.
        </p>

        {payouts.length === 0 ? (
          <div className="mt-8">
            <Empty title="Nothing to pay">No box has been beaten yet.</Empty>
          </div>
        ) : (
          <ul className="mt-8 grid gap-3">
            {payouts.map((payout) => {
              const person = byId.get(payout.user_id)

              return (
                <li key={payout.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold">{person?.display_name || 'Unknown player'}</p>
                        <p className="truncate text-sm text-mist">{person?.email}</p>
                        <p className="mt-1 text-xs text-dusk">{payout.note}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-lg font-bold text-gold">
                          {naira(payout.amount_naira)}
                        </p>
                        <Pill tone={payout.status === 'paid' ? 'lime' : 'gold'} className="mt-1">
                          {payout.status === 'paid' ? 'Paid' : payout.role}
                        </Pill>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl bg-black/30 px-4 py-3 text-sm">
                      {person?.account_number ? (
                        <p className="tabular">
                          <span className="text-chalk">{person.account_number}</span>
                          <span className="text-dusk"> · </span>
                          <span className="text-mist">{person.bank_name || 'bank not given'}</span>
                          <span className="text-dusk"> · </span>
                          <span className="text-mist">{person.account_name || 'name not given'}</span>
                        </p>
                      ) : (
                        <p className="text-rose">
                          No bank details yet — they need to add them before you can pay.
                        </p>
                      )}
                    </div>

                    {payout.status === 'pending' ? (
                      <form action={markPaid} className="mt-4">
                        <input type="hidden" name="id" value={payout.id} />
                        <Button
                          type="submit"
                          tone="ghost"
                          size="sm"
                          disabled={!person?.account_number}
                        >
                          Mark as paid
                        </Button>
                      </form>
                    ) : (
                      <p className="mt-3 text-xs text-dusk">
                        Paid{' '}
                        {payout.paid_at
                          ? new Date(payout.paid_at).toLocaleDateString('en-NG', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : ''}
                      </p>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
