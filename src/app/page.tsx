import { ButtonLink, Card, Pill } from '@/components/ui'
import { SiteHeader } from '@/components/site-header'
import { DemoGrid } from '@/components/demo-grid'
import { optionalProfile } from '@/lib/session'
import { LEVELS, planFor, stepsFor } from '@/lib/game'
import { MIN_TOPUP_COINS, NAIRA_PER_COIN, PRIZE_NAIRA, naira } from '@/lib/money'

export default async function LandingPage() {
  const profile = await optionalProfile()
  const start = profile ? '/home' : '/enter'

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="relative mx-auto max-w-5xl px-4 pb-24">
        <div aria-hidden className="arcade-floor pointer-events-none absolute inset-x-0 top-0 h-[70vh]" />

        {/* ---------------------------------------------------------------- */}
        <section className="relative grid items-center gap-10 py-12 sm:py-16 md:grid-cols-2 md:gap-14">
          <div className="animate-rise">
            <Pill tone="gold">
              <span aria-hidden>💰</span> Free to create · {naira(PRIZE_NAIRA)} a box
            </Pill>

            <h1 className="mt-5 text-[2.7rem] leading-[1.03] font-bold tracking-tight sm:text-6xl">
              Create your box <span className="prize">free</span>.
              <br />
              <span className="text-mist">Share it. Earn.</span>
            </h1>

            <p className="mt-5 max-w-md text-lg leading-relaxed text-mist">
              Making a box costs you nothing. Send the link to anyone. When somebody finally
              beats it, they win {naira(PRIZE_NAIRA)} —{' '}
              <strong className="text-chalk">and so do you.</strong>
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={start} size="lg" tone="gold">
                Create my box — free
              </ButtonLink>
              <ButtonLink href="#how" size="lg" tone="ghost">
                How it works
              </ButtonLink>
            </div>

            <p className="mt-5 text-sm text-dusk">
              No sign-up form. Your email is all it takes to start.
            </p>
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            <DemoGrid />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section id="how" className="relative scroll-mt-20 py-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Create. Share. Earn.
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                step: 'Create',
                emoji: '📦',
                title: 'Free, in one tap',
                body: `Your box carries ${naira(PRIZE_NAIRA)} from the moment it exists. You are never charged for making it, or for anyone playing it.`,
              },
              {
                step: 'Share',
                emoji: '🔗',
                title: 'Send the link anywhere',
                body: 'WhatsApp, X, a group chat. Anyone who opens it can try — each attempt costs the player one coin, not you.',
              },
              {
                step: 'Earn',
                emoji: '💰',
                title: 'You get paid too',
                body: `Somebody beats it and takes ${naira(PRIZE_NAIRA)}. You take ${naira(PRIZE_NAIRA)} for having made the box.`,
              },
            ].map((step, index) => (
              <Card key={step.step} className="relative overflow-hidden">
                <span
                  aria-hidden
                  className="absolute -top-3 -right-1 text-7xl font-bold text-white/4"
                >
                  {index + 1}
                </span>
                <div className="relative">
                  <div className="text-3xl" aria-hidden>
                    {step.emoji}
                  </div>
                  <p className="mt-3 text-xs font-semibold tracking-[0.2em] text-gold uppercase">
                    {step.step}
                  </p>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-mist">{step.body}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="relative py-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            What players are up against
          </h2>
          <p className="mt-2 max-w-2xl text-mist">
            Ten patterns on a grid of nine tiles. Each one is longer and faster than the last,
            and the clock only just keeps up. Every run is generated fresh, so nobody can
            learn a box by heart.
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
            One free replay per game, in case a thumb slips. Every box has a free practice run,
            so nobody pays to find out how it works.
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="relative py-8">
          <Card className="bg-linear-to-br from-gold/18 via-violet/12 to-cyan/10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Create your box free. Share it. Earn.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-mist">
              It takes one tap and costs nothing. Playing someone else&apos;s box costs{' '}
              {naira(NAIRA_PER_COIN)} a go, {MIN_TOPUP_COINS} coins minimum.
            </p>
            <ButtonLink href={start} tone="gold" size="lg" className="mt-6">
              Create my box — free
            </ButtonLink>
          </Card>
        </section>

        <footer className="relative border-t border-white/8 pt-8 text-sm text-dusk">
          <p>
            Spendbox is a game of skill played for money. Coins are non-refundable once spent.
            Please only play with money you can afford to lose.
          </p>
        </footer>
      </main>
    </>
  )
}
