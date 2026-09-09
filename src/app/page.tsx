import { Coins, Link2, Package, Zap } from 'lucide-react'
import { ButtonLink, Card } from '@/components/ui'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'
import { DemoGrid } from '@/components/demo-grid'
import { Mascot } from '@/components/mascot'
import { CardDeck } from '@/components/card-deck'
import { LevelExample } from '@/components/level-example'
import { optionalProfile } from '@/lib/session'
import { siteStats } from '@/lib/stats'
import { LEVELS } from '@/lib/game'
import { NAIRA_PER_COIN, PRIZE_NAIRA, naira } from '@/lib/money'

/** The three levels worth showing: the first, the middle, and the wall. */
const SHOWN_LEVELS = [1, 5, 10]

/**
 * Rendered per request, never at build time.
 *
 * It shows who is signed in and two live counters, so a prerendered copy would
 * be wrong for everybody. It also has to be said out loud: `optionalProfile()`
 * and `siteStats()` run in the same Promise.all, and a build-time render used
 * to reach the database before the cookie read had marked the route dynamic —
 * which turned a missing key into a failed deploy of the whole site.
 */
export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const [profile, stats] = await Promise.all([optionalProfile(), siteStats()])
  const start = profile ? '/home' : '/enter'

  return (
    <>
      <SiteHeader profile={profile} />

      <main className="relative pb-24">
        <div
          aria-hidden
          className="arcade-floor pointer-events-none absolute inset-x-0 top-0 h-[70vh]"
        />

        {/* ---------------------------- the hook ------------------------- */}
        <section className="relative mx-auto grid max-w-5xl items-center gap-10 px-4 py-12 sm:py-16 md:grid-cols-2 md:gap-14">
          <div className="animate-rise">
            <h1 className=" text-[2.7rem] leading-[1.03] font-bold tracking-tight sm:text-6xl">
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
                <Zap size={18} /> Create my box — free
              </ButtonLink>
              <ButtonLink href="/how-it-works" size="lg" tone="ghost">
                How it works
              </ButtonLink>
            </div>
          </div>

          <div className="animate-rise [animation-delay:120ms]">
            <DemoGrid />
          </div>
        </section>

        {/* ---------------------------- the proof ------------------------ */}
        <section className="relative mx-auto max-w-5xl px-4 pb-8">
          {/* Sized to the widest thing that can land here. "₦4,000,000" at
              text-3xl is 184px, which does not fit a half-width card on a
              360px phone — it widened the whole document by 16px. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Card className="text-center !px-3 sm:!px-6">
              <p className="tabular text-2xl leading-none font-bold text-violet-soft sm:text-4xl">
                {stats.boxes.toLocaleString('en-NG')}
              </p>
              <p className="mt-2 text-xs text-mist sm:text-sm">boxes created</p>
            </Card>
            <Card className="text-center !px-3 sm:!px-6">
              <p className="prize tabular text-2xl leading-none font-bold sm:text-4xl">
                {naira(stats.paidOut)}
              </p>
              <p className="mt-2 text-xs text-mist sm:text-sm">paid out so far</p>
            </Card>
          </div>
        </section>

        {/* ---------------------------- the deck ------------------------- */}
        <section className="relative py-8">
          <div className="mx-auto mb-5 max-w-5xl px-4">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Create. Share. Earn.
            </h2>
            <p className="mt-2 text-mist">Swipe through — it is three steps.</p>
          </div>

          <div className="mx-auto max-w-5xl">
            <CardDeck label="How Spendbox works">
              <Card className="h-full">
                <Package size={30} className="text-gold" />
                <p className="mt-3 text-xs font-semibold tracking-[0.2em] text-gold uppercase">
                  Create
                </p>
                <h3 className="mt-1 text-lg font-semibold">Free, in one tap</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist">
                  Your box carries {naira(PRIZE_NAIRA)} from the moment it exists. You are
                  never charged for making it, or for anyone playing it.
                </p>
                <div className="mt-5">
                  <Mascot mood="happy" size={90} />
                </div>
              </Card>

              <Card className="h-full">
                <Link2 size={30} className="text-cyan" />
                <p className="mt-3 text-xs font-semibold tracking-[0.2em] text-cyan uppercase">
                  Share
                </p>
                <h3 className="mt-1 text-lg font-semibold">Send the link anywhere</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist">
                  WhatsApp, X, a group chat. We even draw you three flyers to post. Anyone who
                  opens it can play for free, so the link is worth sending.
                </p>
                <div className="mt-5">
                  <Mascot mood="thinking" size={90} />
                </div>
              </Card>

              <Card className="h-full">
                <Coins size={30} className="text-lime" />
                <p className="mt-3 text-xs font-semibold tracking-[0.2em] text-lime uppercase">
                  Earn
                </p>
                <h3 className="mt-1 text-lg font-semibold">You get paid too</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist">
                  Somebody beats it and takes {naira(PRIZE_NAIRA)}. You take{' '}
                  {naira(PRIZE_NAIRA)} for having made the box. Paid by transfer within a
                  week.
                </p>
                <div className="mt-5">
                  <Mascot mood="excited" size={90} />
                </div>
              </Card>
            </CardDeck>
          </div>
        </section>

        {/* ---------------------------- the climb ------------------------ */}
        <section className="relative py-8">
          <div className="mx-auto mb-5 max-w-5xl px-4">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              What players are up against
            </h2>
            <p className="mt-2 max-w-2xl text-mist">
              Ten patterns on a grid of nine tiles, each longer and faster than the last.
              These are playing at their real speed — watch level {LEVELS}.
            </p>
          </div>

          <div className="mx-auto max-w-5xl">
            <CardDeck label="Example levels">
              {SHOWN_LEVELS.map((level) => (
                <Card key={level} className="h-full">
                  <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-dusk uppercase">
                    {level === 1 ? 'Where it starts' : level === LEVELS ? 'The wall' : 'Halfway'}
                  </p>
                  <LevelExample level={level} />
                  <p className="mt-5 text-sm leading-relaxed text-mist">
                    {level === 1
                      ? 'Four flashes and two seconds. Almost everybody clears this one.'
                      : level === LEVELS
                        ? 'Thirteen flashes in five seconds. This is what guards your prize.'
                        : 'Eight flashes, three seconds, and the flashes are getting quicker.'}
                  </p>
                </Card>
              ))}
            </CardDeck>
          </div>

          <p className="mx-auto mt-5 max-w-5xl px-4 text-sm text-dusk">
            Playing is free and so is starting over. Coins are only for carrying on from a level
            that beat you, instead of going back to level 1.
          </p>
        </section>

        {/* ---------------------------- the ask -------------------------- */}
        <section className="relative mx-auto max-w-5xl px-4 py-8">
          <Card className="bg-linear-to-br from-gold/18 via-violet/12 to-cyan/10 text-center">
            <Mascot mood="excited" size={110} className="mx-auto" />
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Create your box free. Share it. Earn.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-mist">
              It takes one tap and costs nothing. Playing someone else&apos;s box costs nothing
              either — coins, at {naira(NAIRA_PER_COIN)} each, only buy you the right to carry
              on from a level you missed.
            </p>
            <ButtonLink href={start} tone="gold" size="lg" className="mt-6">
              <Zap size={18} /> Create my box — free
            </ButtonLink>
          </Card>
        </section>
      </main>

      <Footer />
    </>
  )
}
