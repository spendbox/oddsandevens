import { ButtonLink, Card } from '@/components/ui'
import { LegalPage, Section } from '@/components/legal-page'
import { Mascot } from '@/components/mascot'
import { optionalProfile } from '@/lib/session'
import { LEVELS, planFor, stepsFor } from '@/lib/game'
import {
  COINS_PER_PLAY,
  MIN_TOPUP_COINS,
  NAIRA_PER_COIN,
  PRIZE_NAIRA,
  RETRY_PRICES,
  coinsToNaira,
  naira,
  priceLabel,
} from '@/lib/money'

export const metadata = {
  title: 'How it works',
  description: 'Everything about how Spendbox boxes, coins, prizes and payouts work.',
}

export default async function HowItWorksPage() {
  const profile = await optionalProfile()

  return (
    <LegalPage
      profile={profile}
      title="How Spendbox works"
      intro="Boxes, coins, the game, and how the money moves. All of it, in one place."
    >
      <Section heading="Making a box">
        <p>
          Anyone with an account can make a box, and it costs nothing. Every box carries{' '}
          <strong>{naira(PRIZE_NAIRA)}</strong> from the moment it exists.
        </p>
        <p>
          You keep <strong>one open box at a time</strong>. When yours is beaten you can make
          another. You can rename it, describe it and give it a picture whenever you like —
          but a box cannot be deleted, because while it is open it is a standing promise to
          everyone who is playing it.
        </p>
      </Section>

      <Section heading="Playing a box">
        <p>
          Starting a game is <strong>free</strong>. Open any box link, tap Play, and you are on
          level 1 with all {LEVELS} levels and the whole {naira(PRIZE_NAIRA)} in front of you,
          having paid nothing.
        </p>
        <p>
          Coins are for one thing: <strong>carrying on from a level you missed</strong>, instead
          of going back to the start. A coin is {naira(NAIRA_PER_COIN)} and the smallest top-up
          is {MIN_TOPUP_COINS} coins ({naira(coinsToNaira(MIN_TOPUP_COINS))}), bought through
          Paystack. What that costs, level by level, is further down this page.
        </p>
        <p>
          The creator of a box is never charged for anyone playing it. Players pay; creators
          do not.
        </p>
        <p>
          Every box also has a <strong>free practice run</strong> — three levels, no box, no
          prize — so you can see the game before you take a real run at it.
        </p>
      </Section>

      <Section heading="The game itself">
        <p>
          A grid of nine tiles. Tiles light up one at a time; you tap them back in the same
          order. There are {LEVELS} levels, and each one is longer and faster than the last.
        </p>

        <Card className="overflow-hidden !p-0">
          <ul className="divide-y divide-white/6">
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
        </Card>

        <p>
          The clock is stopped while you read the level card and while the pattern plays. It
          starts the moment the last flash goes out — watching is free, only remembering is
          timed.
        </p>
        <p>
          Every run generates its own patterns, so no two games are the same and a box cannot
          be learned by heart.
        </p>
      </Section>

      <Section heading="Replays and retries">
        <p>
          A run at somebody else&apos;s box comes with <strong>one free replay</strong>. Miss a
          level and you can take it again — same level, brand new pattern, no charge.
        </p>
        <p>
          After that you have a choice, and only one side of it costs anything. Carrying on
          from where you are keeps every level you have already cleared, and costs more the
          further up you are — because the further up you are, the more it is saving you.
          Going back to level 1 is free, as often as you like.
        </p>

        <Card className="!p-0">
          <ul className="divide-y divide-white/6">
            {RETRY_PRICES.map((band) => (
              <li key={band.levels} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-mist">Carrying on at level {band.levels}</span>
                <span className="tabular text-sm font-semibold text-gold">
                  {band.coins} coins
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-mist">Starting again from level 1</span>
              <span className="tabular text-sm font-semibold text-lime">
                {priceLabel(COINS_PER_PLAY)}
              </span>
            </li>
          </ul>
        </Card>

        <p>
          Starting again always costs you your cleared levels, and never costs you a coin. Your
          run only ends when you walk away from it — being out of coins can cost you your
          progress, but it can never stop you playing.
        </p>
        <p>
          One exception, and it is the only one: a run at <strong>your own box has no free
          replay</strong>. You are paid {naira(PRIZE_NAIRA)} when your box is beaten, so the
          free go at beating it yourself is the one thing you give up. You can still play it,
          and still pay to carry on from a level, exactly like anybody else.
        </p>
      </Section>

      <Section heading="Who gets paid, and how much">
        <p>
          When somebody clears all {LEVELS} levels, the box is beaten and closes. It can only
          be beaten once — whoever gets there first takes it.
        </p>
        <p>
          Normally the prize is paid <strong>twice</strong>: {naira(PRIZE_NAIRA)} to the player
          who beat it, and {naira(PRIZE_NAIRA)} to whoever created it.
        </p>
        <Card className="border-gold/30 bg-gold/8">
          <p className="text-sm leading-relaxed text-chalk">
            <strong>If you beat your own box, you are paid {naira(PRIZE_NAIRA)} once</strong> —
            not twice. You cannot collect both halves of a box you made yourself.
          </p>
        </Card>
      </Section>

      <Section heading="Getting your money">
        <p>
          Add the bank account you want to be paid into. We check the account number with your
          bank before saving it, so a payout cannot go to a typo — the name you see on your
          account page is the name your bank gave back, not one you typed.
        </p>
        <p>
          Payouts are made by <strong>bank transfer, within one week</strong>. They are sent by
          hand, deliberately: no key on our servers can move money out on its own.
        </p>
      </Section>

      <Section heading="Fair play">
        <p>
          Patterns are generated on our servers and judged there. The clock, the level you are
          on, your replay count and who beat a box are all decided server-side — nothing your
          browser says about any of them is taken at face value.
        </p>
        <p>
          Coins are non-refundable once spent, including on a game you lose. Please only play
          with money you can afford to lose.
        </p>
      </Section>

      <Card className="bg-linear-to-br from-gold/15 via-violet/10 to-cyan/10 text-center">
        <Mascot mood="excited" size={100} className="mx-auto" />
        <p className="mt-2 text-xl font-bold tracking-tight">Ready?</p>
        <p className="mt-1.5 text-sm text-mist">
          Creating a box costs nothing and takes one tap.
        </p>
        <ButtonLink href={profile ? '/home' : '/enter'} tone="gold" size="lg" className="mt-5">
          Create my box — free
        </ButtonLink>
      </Card>
    </LegalPage>
  )
}
