import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { ButtonLink, Card, Pill, Problem } from '@/components/ui'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { LEVELS } from '@/lib/game'
import { MIN_TOPUP_COINS, PRIZE_NAIRA, naira } from '@/lib/money'
import type { Attempt, Box, Payout } from '@/lib/types'
import { CreateBox } from './create-box'
import { ShareLink } from '@/components/share-link'

export const metadata = { title: 'Your box' }

export default async function HomePage({ searchParams }: PageProps<'/home'>) {
  const { profile } = await requireProfile()
  const supabase = await supabaseServer()
  const params = await searchParams

  const [{ data: boxes }, { data: attempts }, { data: payouts }] = await Promise.all([
    supabase.from('boxes').select('*').eq('creator_id', profile.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('attempts').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(8),
    supabase.from('payouts').select('*').eq('user_id', profile.id).eq('status', 'pending'),
  ])

  const myBoxes = (boxes ?? []) as Box[]
  const myAttempts = (attempts ?? []) as Attempt[]
  const owed = (payouts ?? []) as Payout[]

  const openBox = myBoxes.find((box) => box.status === 'open') ?? null
  const finishedBoxes = myBoxes.filter((box) => box.status !== 'open')

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="text-3xl font-bold tracking-tight">
          Hey {profile.display_name || 'there'} 👋
        </h1>
        <p className="mt-1.5 text-mist">
          Create a box free, share it, earn {naira(PRIZE_NAIRA)} when someone beats it.
        </p>

        {params.problem === 'box' ? (
          <div className="mt-4">
            <Problem>We could not make that box. Try once more.</Problem>
          </div>
        ) : null}
        {params.problem === 'already' ? (
          <div className="mt-4">
            <Problem>You already have a box open. One at a time.</Problem>
          </div>
        ) : null}

        {owed.length > 0 ? (
          <Card className="mt-6 border-gold/40 bg-gold/10">
            <p className="font-semibold text-gold">
              🎉 You are owed {naira(owed.reduce((sum, payout) => sum + payout.amount_naira, 0))}
            </p>
            <p className="mt-1.5 text-sm text-mist">
              Two quick steps and it is on its way to your bank account.
            </p>
            <ButtonLink href="/claim" tone="gold" size="sm" className="mt-4">
              Claim it
            </ButtonLink>
          </Card>
        ) : null}

        {profile.coins < 1 ? (
          <Card className="mt-6 border-cyan/30 bg-cyan/8">
            <p className="font-semibold text-cyan">Your wallet is empty</p>
            <p className="mt-1.5 text-sm text-mist">
              You need a coin to play someone&apos;s box. The smallest top-up is{' '}
              {MIN_TOPUP_COINS} coins — and creating your own box is always free.
            </p>
            <ButtonLink href="/wallet" size="sm" className="mt-4">
              Fill your wallet
            </ButtonLink>
          </Card>
        ) : null}

        {/* ---------------- one box at a time --------------------------- */}
        <section className="mt-8">
          {openBox ? (
            <Card className="bg-linear-to-br from-gold/12 via-violet/10 to-cyan/8">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Pill tone="lime">🔓 Your box is live</Pill>
                  <h2 className="mt-3 truncate text-2xl font-bold tracking-tight">
                    {openBox.title || `Box ${openBox.code}`}
                  </h2>
                  <p className="tabular mt-1 text-sm text-mist">
                    {openBox.attempts_count}{' '}
                    {openBox.attempts_count === 1 ? 'person has tried' : 'people have tried'} ·
                    best level {openBox.best_level} of {LEVELS}
                  </p>
                </div>
                <p className="tabular shrink-0 text-2xl font-bold text-gold">
                  {naira(openBox.prize_naira)}
                </p>
              </div>

              <p className="mt-5 mb-3 text-sm font-semibold">Share it and start earning</p>
              <ShareLink code={openBox.code} title={openBox.title || `Box ${openBox.code}`} />

              <ButtonLink href={`/b/${openBox.code}`} tone="ghost" size="sm" className="mt-4">
                Open your box page
              </ButtonLink>

              <p className="mt-4 text-xs text-dusk">
                You can create your next box once this one has been beaten.
              </p>
            </Card>
          ) : (
            <CreateBox />
          )}
        </section>

        {/* ---------------- boxes that have been beaten ----------------- */}
        {finishedBoxes.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-bold tracking-tight">Your past boxes</h2>
            <Card className="overflow-hidden !p-0">
              <ul className="divide-y divide-white/6">
                {finishedBoxes.map((box) => (
                  <li key={box.id}>
                    <Link
                      href={`/b/${box.code}`}
                      className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/4"
                    >
                      <span className="text-2xl" aria-hidden>
                        🏆
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {box.title || `Box ${box.code}`}
                        </p>
                        <p className="text-xs text-dusk">
                          Beaten by {box.winner_name || 'a player'} · {box.attempts_count}{' '}
                          attempts
                        </p>
                      </div>
                      <span className="tabular shrink-0 text-sm font-bold text-gold">
                        {naira(box.prize_naira)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        {/* ---------------- games this person has played ---------------- */}
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
