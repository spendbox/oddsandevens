import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { ButtonLink, Card, Empty, Pill, Problem } from '@/components/ui'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { LEVELS } from '@/lib/game'
import { MIN_TOPUP_COINS, naira } from '@/lib/money'
import type { Attempt, Box, Payout } from '@/lib/types'
import { CreateBox } from './create-box'

export const metadata = { title: 'Your boxes' }

export default async function HomePage({ searchParams }: PageProps<'/home'>) {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()
  const params = await searchParams

  // Three independent reads; no reason to wait for them one at a time.
  const [{ data: boxes }, { data: attempts }, { data: payouts }] = await Promise.all([
    supabase.from('boxes').select('*').eq('creator_id', profile.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('attempts').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(8),
    supabase.from('payouts').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
  ])

  const myBoxes = (boxes ?? []) as Box[]
  const myAttempts = (attempts ?? []) as Attempt[]
  const myPayouts = (payouts ?? []) as Payout[]
  const owed = myPayouts.filter((payout) => payout.status === 'pending')

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="text-3xl font-bold tracking-tight">
          Hey {profile.display_name || 'there'} 👋
        </h1>

        {params.problem === 'box' ? (
          <div className="mt-4">
            <Problem>We could not make that box. Try once more.</Problem>
          </div>
        ) : null}

        {/* Money owed comes first. It is the best news on the page. */}
        {owed.length > 0 ? (
          <Card className="mt-6 border-gold/40 bg-gold/10">
            <p className="text-sm font-semibold text-gold">
              🎉 You are owed {naira(owed.reduce((total, payout) => total + payout.amount_naira, 0))}
            </p>
            <p className="mt-1.5 text-sm text-mist">
              Payouts are sent by bank transfer, by hand. Add your account details so we know
              where to send it.
            </p>
            <ButtonLink href="/account" tone="gold" size="sm" className="mt-4">
              Add bank details
            </ButtonLink>
          </Card>
        ) : null}

        {profile.coins < 1 ? (
          <Card className="mt-6 border-cyan/30 bg-cyan/8">
            <p className="text-sm font-semibold text-cyan">Your wallet is empty</p>
            <p className="mt-1.5 text-sm text-mist">
              You need a coin to play a box. The smallest top-up is {MIN_TOPUP_COINS} coins.
            </p>
            <ButtonLink href="/wallet" size="sm" className="mt-4">
              Fill your wallet
            </ButtonLink>
          </Card>
        ) : null}

        <div className="mt-6">
          <CreateBox />
        </div>

        {/* ---------------------------------------------------------------- */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Your boxes</h2>

          {myBoxes.length === 0 ? (
            <Empty title="No boxes yet">
              Drop one above, then send the link to anybody who fancies their chances.
            </Empty>
          ) : (
            <ul className="grid gap-3">
              {myBoxes.map((box) => (
                <li key={box.id}>
                  <Link
                    href={`/b/${box.code}`}
                    className="pane block rounded-3xl p-5 transition hover:border-violet/45"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {box.title || `Box ${box.code}`}
                        </p>
                        <p className="tabular mt-1 text-sm text-mist">
                          {box.attempts_count}{' '}
                          {box.attempts_count === 1 ? 'attempt' : 'attempts'} · best level{' '}
                          {box.best_level} of {LEVELS}
                        </p>
                      </div>

                      {box.status === 'won' ? (
                        <Pill tone="gold">Won by {box.winner_name || 'a player'}</Pill>
                      ) : (
                        <Pill tone="lime">Open · {naira(box.prize_naira)}</Pill>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {myAttempts.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-bold tracking-tight">Your recent games</h2>

            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {myAttempts.map((attempt) => (
                  <li key={attempt.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-white/6 text-sm"
                      aria-hidden
                    >
                      {attempt.status === 'won' ? '🏆' : attempt.status === 'failed' ? '💥' : '🎮'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {attempt.status === 'won'
                          ? 'Cleared all ten'
                          : attempt.status === 'playing'
                            ? `Playing level ${attempt.level}`
                            : `Got to level ${attempt.levels_cleared + 1}`}
                      </p>
                      <p className="text-xs text-dusk">
                        {new Date(attempt.created_at).toLocaleDateString('en-NG', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>

                    {attempt.status === 'playing' ? (
                      <Link
                        href={`/play/${attempt.id}`}
                        className="text-sm font-semibold text-cyan underline underline-offset-4"
                      >
                        Resume
                      </Link>
                    ) : (
                      <span className="tabular text-sm text-mist">
                        {attempt.levels_cleared}/{LEVELS}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}
      </main>
    </>
  )
}
