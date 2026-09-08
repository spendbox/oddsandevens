import { PendingDot } from '@/components/pending-dot'
import Link from 'next/link'
import { Coins, Gamepad2, Package, PartyPopper, Trophy, Unlock, Wallet, X } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { ButtonLink, Card, Pill, Problem } from '@/components/ui'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { LEVELS } from '@/lib/game'
import { PRIZE_NAIRA, coinsToNaira, naira } from '@/lib/money'
import type { Attempt, Box, Payout } from '@/lib/types'
import { CreateBox } from './create-box'
import { ShareLink } from '@/components/share-link'
import { FlyerStudio } from '@/components/flyer-studio'
import { AttemptsChart } from '@/components/attempts-chart'
import { attemptsByDay } from '@/lib/activity'
import { Footer } from '@/components/footer'

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
  const activity = openBox ? await attemptsByDay(openBox.id) : []
  const finishedBoxes = myBoxes.filter((box) => box.status !== 'open')

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="text-3xl font-bold tracking-tight">
          Hey {profile.display_name || 'there'}
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
        {params.problem === 'full' ? (
          <div className="mt-4">
            <Problem>
              Spendbox has as many boxes running as it can support right now. Check back
              soon — one frees up every time a box is beaten.
            </Problem>
          </div>
        ) : null}

        {owed.length > 0 ? (
          <Card className="mt-6 border-gold/40 bg-gold/10">
            <p className="flex items-center gap-2 font-semibold text-gold">
              <PartyPopper size={18} /> You are owed {naira(owed.reduce((sum, payout) => sum + payout.amount_naira, 0))}
            </p>
            <p className="mt-1.5 text-sm text-mist">
              Two quick steps and it is on its way to your bank account.
            </p>
            <ButtonLink href="/claim" tone="gold" size="sm" className="mt-4">
              Claim it
            </ButtonLink>
          </Card>
        ) : null}

        {/* Wallet and box, side by side. One costs money and one is free, and
            both are things somebody lands on this page wanting to do. */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card
            className={
              'flex flex-col ' +
              (profile.coins < 1
                ? 'border-cyan/35 bg-cyan/10'
                : 'bg-linear-to-br from-cyan/10 to-violet/10')
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-cyan uppercase">
                  Your wallet
                </p>
                <p className="tabular mt-2 text-4xl font-bold">
                  {profile.coins}
                  <span className="ml-2 text-base font-medium text-mist">
                    {profile.coins === 1 ? 'coin' : 'coins'}
                  </span>
                </p>
                <p className="mt-1 text-sm text-mist">
                  {profile.coins < 1
                    ? 'You need a coin to play someone else\u2019s box.'
                    : `Worth ${naira(coinsToNaira(profile.coins))} · ${profile.coins} ${profile.coins === 1 ? 'game' : 'games'}`}
                </p>
              </div>
              <Wallet size={26} className="shrink-0 text-cyan" />
            </div>

            <ButtonLink href="/wallet" size="md" className="mt-5 w-full sm:w-auto">
              <Coins size={17} /> Top up
            </ButtonLink>

          </Card>

          {openBox ? (
            <Card className="flex flex-col bg-linear-to-br from-gold/12 to-violet/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
                    Your box
                  </p>
                  <p className="tabular mt-2 text-4xl font-bold text-gold">
                    {naira(openBox.prize_naira)}
                  </p>
                  <p className="mt-1 truncate text-sm text-mist">
                    {openBox.title || `Box ${openBox.code}`}
                  </p>
                </div>
                <Package size={26} className="shrink-0 text-gold" />
              </div>

              <ButtonLink
                href={`/b/${openBox.code}`}
                tone="gold"
                size="md"
                className="mt-5 w-full sm:w-auto"
              >
                Open it
              </ButtonLink>

              <p className="mt-3 text-xs text-dusk">
                {openBox.attempts_count} {openBox.attempts_count === 1 ? 'try' : 'tries'} so
                far · best level {openBox.best_level} of {LEVELS}
              </p>
            </Card>
          ) : null}
        </div>

        {/* ---------------- one box at a time --------------------------- */}
        <section className="mt-8">
          {openBox ? (
            <Card className="bg-linear-to-br from-gold/12 via-violet/10 to-cyan/8">
              <Pill tone="lime">
                <Unlock size={13} /> Your box is live
              </Pill>

              <div className="mt-5 rounded-2xl bg-black/25 p-4 ring-1 ring-inset ring-white/8">
                <p className="mb-1 text-sm font-semibold">People trying your box</p>
                <p className="mb-4 text-xs text-dusk">
                  Every attempt, by the day it happened.
                </p>
                <AttemptsChart data={activity} />
              </div>

              <p className="mt-5 mb-3 text-sm font-semibold">Share it and start earning</p>
              <ShareLink code={openBox.code} title={openBox.title || `Box ${openBox.code}`} />

              <div className="mt-5">
                <p className="mb-3 text-sm font-semibold">Flyers you can post</p>
                <FlyerStudio box={openBox} />
              </div>

              <p className="mt-5 text-xs text-dusk">
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
                      <Trophy size={22} className="shrink-0 text-gold" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {box.title || `Box ${box.code}`}
                          <PendingDot />
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
                      {attempt.status === 'won' ? (
                        <Trophy size={16} className="text-gold" />
                      ) : attempt.status === 'failed' ? (
                        <X size={16} className="text-rose" />
                      ) : (
                        <Gamepad2 size={16} className="text-cyan" />
                      )}
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
                        <PendingDot />
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

      <Footer />
    </>
  )
}
