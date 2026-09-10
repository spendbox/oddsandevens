import { notFound } from 'next/navigation'
import Image from 'next/image'
import { ChevronDown, Coins, Lock, Pencil, Play, Trophy, Unlock, Zap } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { Button, ButtonLink, Card, Pill, Problem } from '@/components/ui'
import { ShareLink } from '@/components/share-link'
import { FlyerStudio } from '@/components/flyer-studio'
import { TileReel } from '@/components/tile-reel'
import { Mascot } from '@/components/mascot'
import { optionalProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { tidyBoxCode } from '@/lib/codes'
import { LEVELS, planFor, stepsFor } from '@/lib/game'
import {
  CHEAPEST_RETRY,
  COINS_PER_PLAY,
  NAIRA_PER_COIN,
  coinWord,
  freeReplaysFor,
  naira,
  priceLabel,
} from '@/lib/money'
import { livePrize } from '@/lib/settings'
import type { Box } from '@/lib/types'
import { play } from './actions'

async function loadBox(rawCode: string): Promise<Box | null> {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('boxes')
    .select('*')
    .eq('code', tidyBoxCode(rawCode))
    .maybeSingle()

  return (data as Box) ?? null
}

export async function generateMetadata({ params }: PageProps<'/b/[code]'>) {
  const { code } = await params
  const box = await loadBox(code)
  if (!box) return { title: 'Box not found' }

  return {
    title: box.title || `Box ${box.code}`,
    description:
      box.description || `${naira(box.prize_naira)} says you cannot beat ten patterns in a row.`,
    openGraph: box.image_url ? { images: [box.image_url] } : undefined,
  }
}

export default async function BoxPage({ params, searchParams }: PageProps<'/b/[code]'>) {
  const [{ code }, query, profile] = await Promise.all([params, searchParams, optionalProfile()])

  const box = await loadBox(code)
  if (!box) notFound()

  // What THIS box is worth is on the box row and nowhere else — it was fixed
  // when the box was made and is what its players were promised. The live
  // setting is only for the card at the bottom, which is an invitation to make
  // a new one.
  const newBoxPrize = await livePrize()

  const isMine = profile?.id === box.creator_id
  const isOpen = box.status === 'open'
  // A go costs coins, so this decides which button is shown: play, or top up.
  // The balance also decides the sentence underneath, because what a player
  // will next want coins for is carrying on from a level they miss, and that is
  // worth knowing before they are standing at it rather than after.
  const canAfford = (profile?.coins ?? 0) >= COINS_PER_PLAY
  const canCarryOn = (profile?.coins ?? 0) >= CHEAPEST_RETRY
  // A run at your own box comes with no free replay — the same rule the server
  // applies when it opens the run, read from the same function, so the screen
  // cannot promise something the game will not give.
  const freeReplays = freeReplaysFor(isMine)
  const problem = typeof query.problem === 'string' ? query.problem : null

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {/* ---------------- the creator's own picture -------------------- */}
        {box.image_url ? (
          <div className="relative mb-6 h-44 w-full overflow-hidden rounded-3xl sm:h-56">
            <Image
              src={box.image_url}
              alt={box.title || `Box ${box.code}`}
              fill
              sizes="(max-width: 640px) 100vw, 42rem"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/20 to-transparent" />
          </div>
        ) : null}

        <div className="animate-rise text-center">
          <Pill tone={isOpen ? 'lime' : 'quiet'}>
            {isOpen ? <Unlock size={13} /> : <Lock size={13} />}
            {isOpen ? 'Open' : 'Already won'} · Box {box.code}
          </Pill>

          {/* The grid, doing the thing the player will be asked to do. An
              illustration of a box was decoration; this is the game. */}
          <div className="mt-6">
            <TileReel amount={box.prize_naira} dim={!isOpen} />
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            {box.title || `Box ${box.code}`}
          </h1>
          <p className="mt-1 text-sm text-dusk">by {box.creator_name || 'a player'}</p>

          {box.description ? (
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-mist">{box.description}</p>
          ) : null}
        </div>

        {/* ---------------- what happens next ---------------------------- */}
        <Card className="mt-8">
          {isOpen ? (
            <>
              <p className="text-center text-mist">
                Clear all {LEVELS} patterns and{' '}
                <strong className="text-chalk">{naira(box.prize_naira)} is yours</strong>.
              </p>

              {problem === 'coins' ? (
                <div className="mt-5">
                  <Problem>
                    A go is {coinWord(COINS_PER_PLAY)}, and your wallet was short — top up and
                    the box is waiting.
                  </Problem>
                </div>
              ) : null}
              {problem === 'closed' ? (
                <div className="mt-5">
                  <Problem>Somebody beat this box while you were looking at it.</Problem>
                </div>
              ) : null}

              <div className="mt-6">
                {!profile ? (
                  <ButtonLink
                    href={`/enter?next=${encodeURIComponent(`/b/${box.code}`)}`}
                    tone="gold"
                    size="lg"
                    className="w-full"
                  >
                    <Zap size={18} /> Sign in to play
                  </ButtonLink>
                ) : canAfford ? (
                  <form action={play}>
                    <input type="hidden" name="code" value={box.code} />
                    <Button type="submit" tone="gold" size="lg" className="w-full">
                      <Zap size={18} /> Play · {priceLabel(COINS_PER_PLAY).toLowerCase()}
                    </Button>
                  </form>
                ) : (
                  <ButtonLink href="/wallet" tone="gold" size="lg" className="w-full">
                    <Coins size={18} /> Get coins to play
                  </ButtonLink>
                )}
              </div>

              <ButtonLink
                href={`/b/${box.code}/try`}
                tone="ghost"
                size="lg"
                className="mt-3 w-full"
              >
                <Play size={17} /> Try it free first
              </ButtonLink>

              <p className="mt-4 text-center text-sm text-dusk">
                {!profile
                  ? `A go is ${priceLabel(COINS_PER_PLAY).toLowerCase()} — coins are ${naira(NAIRA_PER_COIN)} each. Carrying on from a level you miss costs more.`
                  : freeReplays < 1
                    ? `A go is ${priceLabel(COINS_PER_PLAY).toLowerCase()}. Your own box gives you no free replay, so a level you miss ` +
                      'costs coins to carry on from, or another go to start over.'
                    : canCarryOn
                      ? `A go is ${priceLabel(COINS_PER_PLAY).toLowerCase()}, with one free replay. You have ${coinWord(profile.coins)} in hand.`
                      : `A go is ${priceLabel(COINS_PER_PLAY).toLowerCase()}, with one free replay. After that, carrying on from a level you miss is from ${coinWord(CHEAPEST_RETRY)}.`}
              </p>
            </>
          ) : (
            <div className="text-center">
              <Mascot mood="happy" size={110} className="mx-auto" />
              <p className="mt-3 text-lg font-semibold">
                {box.winner_name || 'A player'} beat this box
              </p>
              <p className="mt-1.5 text-sm text-mist">
                {box.won_at
                  ? new Date(box.won_at).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : null}{' '}
                · {naira(box.prize_naira)} to them, and {naira(box.prize_naira)} to whoever
                made it.
              </p>

              <div className="mt-6 grid gap-3">
                <ButtonLink href={profile ? '/home' : '/enter'} tone="gold" size="lg">
                  <Trophy size={18} /> Create your own box — free
                </ButtonLink>
                <ButtonLink href={`/b/${box.code}/try`} tone="ghost">
                  <Play size={16} /> See how it was played
                </ButtonLink>
              </div>
            </div>
          )}
        </Card>

        {/* ---------------- how the box has held up ---------------------- */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Card className="text-center">
            <p className="tabular text-3xl font-bold">{box.attempts_count}</p>
            <p className="mt-1 text-sm text-mist">
              {box.attempts_count === 1 ? 'attempt' : 'attempts'}
            </p>
          </Card>
          <Card className="text-center">
            <p className="tabular text-3xl font-bold">
              {box.best_level}
              <span className="text-lg text-dusk">/{LEVELS}</span>
            </p>
            <p className="mt-1 text-sm text-mist">best level reached</p>
          </Card>
        </div>

        {isMine ? (
          <Card className="mt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Your box — send it to someone</p>
              <ButtonLink href={`/b/${box.code}/edit`} tone="ghost" size="sm">
                <Pencil size={14} /> Customise
              </ButtonLink>
            </div>
            <ShareLink code={box.code} title={box.title || `Box ${box.code}`} />

            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold">Flyers you can post</p>
              <FlyerStudio box={box} />
            </div>
          </Card>
        ) : null}

        {/* ---------------- the climb, folded away by default ------------ */}
        <details className="pane group mt-4 overflow-hidden rounded-3xl">
          <summary
            className="flex cursor-pointer list-none items-center justify-between px-5 py-4
                       text-sm font-semibold transition hover:bg-white/4"
          >
            What you are up against
            <ChevronDown
              size={18}
              className="text-mist transition-transform group-open:rotate-180"
            />
          </summary>

          <ul className="divide-y divide-white/6 border-t border-white/6">
            {Array.from({ length: LEVELS }, (_, index) => {
              const level = index + 1
              const plan = planFor(level)

              return (
                <li
                  key={level}
                  className="flex items-center justify-between px-5 py-2.5 text-sm"
                >
                  <span className="tabular text-dusk">Level {level}</span>
                  <span className="tabular text-mist">
                    {stepsFor(level)} flashes in{' '}
                    <span className="text-chalk">{plan.answerMs / 1000}s</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </details>

        <p className="mt-6 text-center text-sm text-dusk">
          Every game generates its own patterns. No two runs are the same.
        </p>

        {!isMine ? (
          <Card className="mt-6 bg-linear-to-br from-gold/12 to-violet/10 text-center">
            <Mascot mood="excited" size={96} className="mx-auto" />
            <p className="mt-2 font-semibold">Want one of these of your own?</p>
            <p className="mt-1.5 text-sm text-mist">
              Creating a box is free. Share it, and when somebody finally beats it you
              earn {naira(newBoxPrize)}.
            </p>
            <ButtonLink href={profile ? '/home' : '/enter'} tone="gold" className="mt-4">
              Create your box — free
            </ButtonLink>
          </Card>
        ) : null}
      </main>

      <Footer />
    </>
  )
}
