import { ButtonLink, Card } from '@/components/ui'
import { LegalPage, Section } from '@/components/legal-page'
import { Mascot } from '@/components/mascot'
import { optionalProfile } from '@/lib/session'
import { LEVELS, planFor, stepsFor } from '@/lib/game'
import {
  MIN_TOPUP_COINS,
  NAIRA_PER_COIN,
  PRIZE_NAIRA,
  coinsToNaira,
  naira,
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
          everyone who has already paid to play it.
        </p>
      </Section>

      <Section heading="Playing a box">
        <p>
          Each attempt costs <strong>one coin</strong>. A coin is {naira(NAIRA_PER_COIN)}, and
          the smallest top-up is {MIN_TOPUP_COINS} coins ({naira(coinsToNaira(MIN_TOPUP_COINS))}
          ). Coins are bought through Paystack.
        </p>
        <p>
          The creator of a box is never charged for anyone playing it. Players pay; creators
          do not.
        </p>
        <p>
          Every box has a <strong>free practice run</strong> — three levels, no coin, no prize
          — so nobody has to pay to find out what the game is.
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
          Every game comes with <strong>one free replay</strong>. Miss a level and you can take
          it again — same level, brand new pattern, no charge.
        </p>
        <p>
          After that, a retry costs <strong>one coin</strong> and you keep every level you have
          already cleared. Your run only ends when you are out of coins or you walk away.
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
