import { ButtonLink, Card, Pill } from '@/components/ui'
import { SiteHeader } from '@/components/site-header'
import { DemoGrid } from '@/components/demo-grid'
import { optionalProfile } from '@/lib/session'
import { LEVELS, planFor, stepsFor } from '@/lib/game'
import { MIN_TOPUP_COINS, NAIRA_PER_COIN, PRIZE_NAIRA, naira } from '@/lib/money'

export default async function LandingPage() {
  const profile = await optionalProfile()

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="mx-auto max-w-5xl px-4 pb-24">
        {/* ---------------------------------------------------------------- */}
        <section className="grid items-center gap-10 py-12 sm:py-16 md:grid-cols-2 md:gap-14">
          <div className="animate-rise">
            <Pill tone="gold">
              <span aria-hidden>💰</span> {naira(PRIZE_NAIRA)} a box
            </Pill>

            <h1 className="mt-5 text-[2.6rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
              Beat the pattern.
              <br />
              <span className="bg-linear-to-r from-violet via-cyan to-lime bg-clip-text text-transparent">
                Take the box.
              </span>
            </h1>

            <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">
              Ten patterns, each faster than the last, on a grid of nine tiles.
              Clear all ten and <strong className="text-chalk">you take {naira(PRIZE_NAIRA)}</strong> —
              and so does whoever made the box.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={profile ? '/home' : '/enter'} size="lg" tone="gold">
                {profile ? 'Open a box' : 'Start free'}
              </ButtonLink>
              <ButtonLink href="#how" size="lg" tone="ghost">
                How it works
              </ButtonLink>
            </div>

            <p className="mt-5 text-sm text-dusk">
              Making a box is free. Playing one costs 1 coin ({naira(NAIRA_PER_COIN)}).
            </p>
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            <DemoGrid />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section id="how" className="scroll-mt-20 py-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                emoji: '📦',
                title: 'Drop a box',
                body: `Free, and it takes one tap. Every box carries ${naira(PRIZE_NAIRA)}.`,
              },
              {
                emoji: '🔗',
                title: 'Share the link',
                body: 'Anyone who opens it can try. Each try costs the player one coin.',
              },
              {
                emoji: '🏆',
                title: 'Somebody beats it',
                body: `They get ${naira(PRIZE_NAIRA)}. You get ${naira(PRIZE_NAIRA)}. The box closes.`,
              },
            ].map((step) => (
              <Card key={step.title}>
                <div className="text-3xl" aria-hidden>
                  {step.emoji}
                </div>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mist">{step.body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="py-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">The ten levels</h2>
          <p className="mt-2 max-w-2xl text-mist">
            The pattern gets longer, the flashes get quicker, and the clock only just keeps up.
            Every run is generated fresh, so nobody can learn a box by heart.
          </p>

          <Card className="mt-6 overflow-hidden !p-0">
            <ul className="divide-y divide-white/6">
              {Array.from({ length: LEVELS }, (_, index) => {
                const level = index + 1
                const plan = planFor(level)
                const share = (level / LEVELS) * 100

                return (
                  <li key={level} className="flex items-center gap-4 px-5 py-3">
                    <span className="tabular w-14 shrink-0 text-sm font-semibold text-dusk">
                      Lv {level}
                    </span>

                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/6">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-cyan via-violet to-rose"
                        style={{ width: `${share}%` }}
                      />
                    </div>

                    <span className="tabular w-32 shrink-0 text-right text-sm text-mist sm:w-40">
                      {stepsFor(level)} flashes ·{' '}
                      <span className="text-chalk">{plan.answerMs / 1000}s</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>

          <p className="mt-3 text-sm text-dusk">
            One free replay per game, in case a thumb slips. After that, another go costs
            another coin.
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="py-8">
          <Card className="bg-linear-to-br from-violet/20 to-cyan/10">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="flex-1">
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Coins are {naira(NAIRA_PER_COIN)} each
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-mist">
                  Fill your wallet with at least {MIN_TOPUP_COINS} coins through Paystack. One
                  coin is one attempt at any box. Winnings are paid out by hand, by transfer.
                </p>
              </div>
              <ButtonLink href={profile ? '/wallet' : '/enter'} tone="gold" size="lg">
                {profile ? 'Top up' : 'Get started'}
              </ButtonLink>
            </div>
          </Card>
        </section>

        <footer className="border-t border-white/8 pt-8 text-sm text-dusk">
          <p>
            Spendbox is a game of skill played for money. Coins are non-refundable once spent.
            Please only play with money you can afford to lose.
          </p>
        </footer>
      </main>
    </>
  )
}
