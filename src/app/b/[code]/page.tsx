import { notFound } from 'next/navigation'
import Image from 'next/image'
import { ChevronDown, Coins, Lock, Pencil, Play, Trophy, Unlock, Zap } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Button, ButtonLink, Card, Pill, Problem } from '@/components/ui'
import { ShareLink } from '@/components/share-link'
import { PrizeBox } from '@/components/prize-box'
import { Mascot } from '@/components/mascot'
import { optionalProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { tidyBoxCode } from '@/lib/codes'
import { LEVELS, planFor, stepsFor } from '@/lib/game'
import { MIN_TOPUP_COINS, NAIRA_PER_COIN, PRIZE_NAIRA, naira } from '@/lib/money'
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

  const isMine = profile?.id === box.creator_id
  const isOpen = box.status === 'open'
  const canAfford = (profile?.coins ?? 0) >= 1
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

          {/* The box itself, rather than a sentence about what is in it. */}
          <div className="mt-6">
            <PrizeBox amount={box.prize_naira} open={!isOpen} />
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
                <strong className="text-chalk">{naira(box.prize_naira)} is yours</strong>.{' '}
                {box.creator_name || 'The creator'} is paid the same.
              </p>

              {problem === 'coins' ? (
                <div className="mt-5">
                  <Problem>You need at least one coin to play. Top up and come back.</Problem>
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
                      <Zap size={18} /> Play · 1 coin
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
                {profile
                  ? `You have ${profile.coins} ${profile.coins === 1 ? 'coin' : 'coins'}. One game costs one.`
                  : `Coins are ${naira(NAIRA_PER_COIN)} each, ${MIN_TOPUP_COINS} minimum.`}
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
                · {naira(box.prize_naira)} each to them and {box.creator_name || 'the creator'}.
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
              Creating a box is free. Share it, and when somebody finally beats it you earn{' '}
              {naira(PRIZE_NAIRA)} — the same as the winner.
            </p>
            <ButtonLink href={profile ? '/home' : '/enter'} tone="gold" className="mt-4">
              Create your box — free
            </ButtonLink>
          </Card>
        ) : null}
      </main>
    </>
  )
}
