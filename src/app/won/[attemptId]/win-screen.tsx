'use client'

import { useEffect, useState } from 'react'
import { PartyPopper, Share2, Trophy } from 'lucide-react'
import { ButtonLink, Card } from '@/components/ui'
import { Mascot } from '@/components/mascot'
import { Confetti } from '@/components/confetti'
import { ShareLink } from '@/components/share-link'
import { LEVELS } from '@/lib/game'
import { naira } from '@/lib/money'
import type { Box } from '@/lib/types'

/**
 * The moment somebody beats a box.
 *
 * Built to be enjoyed for a few seconds before it asks for anything: the number
 * lands first, the claim button arrives after. Rushing straight to a bank form
 * would waste the only genuinely exciting screen in the product.
 */
export function WinScreen({
  box,
  tookThePrize,
  needsClaim,
}: {
  box: Box
  tookThePrize: boolean
  needsClaim: boolean
}) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 900)
    return () => clearTimeout(timer)
  }, [])

  if (!tookThePrize) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="animate-rise text-center">
          <Mascot mood="thinking" size={140} className="mx-auto" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            All ten. Just not first.
          </h1>
          <p className="mt-3 text-mist">
            You cleared every level of this box — {box.winner_name || 'someone else'} got here
            before you. That is a genuinely rare thing to have done.
          </p>

          <div className="mt-8 grid gap-3">
            <ButtonLink href="/home" tone="gold" size="lg">
              Create your own box — free
            </ButtonLink>
            <ButtonLink href="/home" tone="ghost" size="lg">
              Find another box
            </ButtonLink>
          </div>
        </div>
      </main>
    )
  }

  return (
    <>
      <Confetti />

      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
        <div className="text-center">
          <Mascot mood="excited" size={160} className="mx-auto animate-pop" />

          <p className="mt-6 text-sm font-semibold tracking-[0.3em] text-gold uppercase">
            Box beaten
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            You did it.
          </h1>

          <div
            className={
              'mt-6 transition-all duration-700 ' +
              (revealed ? 'scale-100 opacity-100 blur-0' : 'scale-90 opacity-0 blur-sm')
            }
          >
            <p className="prize tabular text-6xl font-bold sm:text-7xl">
              {naira(box.prize_naira)}
            </p>
            <p className="mt-2 text-mist">is yours</p>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-mist">
            All {LEVELS} levels, first to do it.{' '}
            {box.creator_name || 'The creator'} earns {naira(box.prize_naira)} too — that is
            how every box works.
          </p>
        </div>

        {needsClaim ? (
          <Card className="mt-8 border-gold/40 bg-gold/10">
            <p className="font-semibold text-gold">Two steps to get paid</p>
            <p className="mt-1.5 text-sm text-mist">
              Set a password so nobody else can claim this, then tell us the bank account to
              send it to. We check the account with your bank before saving it.
            </p>
            <ButtonLink href="/claim" tone="gold" size="lg" className="mt-5 w-full">
              <Trophy size={18} /> Claim {naira(box.prize_naira)}
            </ButtonLink>
          </Card>
        ) : (
          <Card className="mt-8 border-lime/40 bg-lime/10 text-center">
            <p className="flex items-center justify-center gap-2 font-semibold text-lime">
              <PartyPopper size={17} /> Already set up — nothing to do
            </p>
            <p className="mt-1.5 text-sm text-mist">
              {naira(box.prize_naira)} is queued for transfer to your bank account. Payouts go
              out by hand, so give it a little time.
            </p>
          </Card>
        )}

        <Card className="mt-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Share2 size={15} /> Tell people you beat it
          </p>
          <ShareLink code={box.code} title={`I beat ${box.title || `box ${box.code}`}`} />
        </Card>

        <div className="mt-6 text-center">
          <ButtonLink href="/home" tone="ghost">
            Now create your own box — free
          </ButtonLink>
        </div>
      </main>
    </>
  )
}
