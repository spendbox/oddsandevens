import { redirect } from 'next/navigation'
import { Check, CheckCircle2 } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { ButtonLink, Card, Problem } from '@/components/ui'
import { BankForm } from '@/components/bank-form'
import { Mascot } from '@/components/mascot'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { listBanks, paymentsConfigured, type Bank } from '@/lib/paystack'
import { naira } from '@/lib/money'
import type { Payout } from '@/lib/types'

export const metadata = { title: 'Claim your winnings' }
export const dynamic = 'force-dynamic'

/**
 * The two things standing between somebody and their money.
 *
 * People arrive here having played on nothing but an email address, so this is
 * where the account becomes properly theirs. Both steps exist for the same
 * reason: ₦100,000 is about to move, and it has to move to the right person's
 * real bank account.
 *
 * Shown as a checklist rather than a wizard, because somebody who already has a
 * password should not have to walk past a step they finished months ago.
 */
export default async function ClaimPage() {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()

  const { data } = await supabase
    .from('payouts')
    .select('*')
    .eq('user_id', profile.id)
    .eq('status', 'pending')

  const owed = (data ?? []) as Payout[]
  if (owed.length === 0) redirect('/account')

  const total = owed.reduce((sum, payout) => sum + payout.amount_naira, 0)
  // Since everybody signs up with a password, a verified bank account is the
  // only thing left between a winner and their money.
  const hasBank = Boolean(profile.account_verified_at)
  const allDone = hasBank

  let banks: Bank[] = []
  let banksProblem: string | null = null
  if (paymentsConfigured()) {
    try {
      banks = await listBanks()
    } catch {
      banksProblem = 'Could not load the bank list from Paystack just now. Try again shortly.'
    }
  } else {
    banksProblem = 'Payments are not set up on this deployment yet.'
  }

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <div className="text-center">
          <Mascot mood="excited" size={130} className="mx-auto" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Claim your winnings</h1>
          <p className="prize tabular mt-3 text-5xl font-bold">
            {naira(total)}
          </p>
          <p className="mt-3 text-mist">
            Tell us where to send it and it is on its way by bank transfer.
          </p>
        </div>

        {allDone ? (
          <Card className="mt-8 border-lime/40 bg-lime/10 text-center">
            <p className="flex items-center justify-center gap-2 font-semibold text-lime">
              <CheckCircle2 size={20} /> You are all set
            </p>
            <p className="mt-1.5 text-sm text-mist">
              {naira(total)} is queued for transfer to {profile.account_name} at{' '}
              {profile.bank_name}. Payouts are sent by hand, so give it a little time.
            </p>
            <ButtonLink href="/home" tone="ghost" size="sm" className="mt-5">
              Back to your box
            </ButtonLink>
          </Card>
        ) : null}

        <section className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <StepMark done={hasBank} number={1} />
            <div>
              <h2 className="text-xl font-bold tracking-tight">Where to send it</h2>
              <p className="text-sm text-mist">
                We check the account with your bank before saving it, so a payout cannot go
                to a typo.
              </p>
            </div>
          </div>

          {banksProblem ? (
            <Problem>{banksProblem}</Problem>
          ) : (
            <Card>
              <BankForm profile={profile} banks={banks} />
            </Card>
          )}
        </section>
      </main>
    </>
  )
}

function StepMark({ done, number }: { done: boolean; number: number }) {
  return (
    <span
      className={
        'grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ' +
        (done ? 'bg-lime text-ink' : 'bg-white/8 text-mist ring-1 ring-inset ring-white/15')
      }
      aria-hidden
    >
      {done ? <Check size={18} /> : number}
    </span>
  )
}
