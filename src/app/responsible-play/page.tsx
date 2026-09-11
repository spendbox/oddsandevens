import { Card } from '@/components/ui'
import { LegalPage, Section } from '@/components/legal-page'
import { optionalProfile } from '@/lib/session'
import { CONTACT_EMAIL } from '@/lib/contact'
import { COINS_PER_PLAY, coinWord, coinsToNaira, naira, retryCostFor } from '@/lib/money'
import { liveCoinPrice } from '@/lib/settings'

export const metadata = { title: 'Responsible play' }

/**
 * What a run costs, worked out rather than written down.
 *
 * The page has to name a real figure — "it adds up" persuades nobody, a number
 * does — and a number typed into prose is the one thing on this site guaranteed
 * to go stale, because the price of a coin is a setting an admin can move and
 * the price of carrying on is a curve. So the example is assembled from the
 * same functions the game charges from: one go, the free replay spent, then
 * carrying on twice in the middle of the ladder.
 */
const EXAMPLE_COINS = COINS_PER_PLAY + retryCostFor(5) + retryCostFor(6)

export default async function ResponsiblePlayPage() {
  const [profile, coinPrice] = await Promise.all([optionalProfile(), liveCoinPrice()])

  return (
    <LegalPage
      profile={profile}
      title="Responsible play"
      intro="Spendbox costs real money. Here is how to keep it fun."
    >
      <Section heading="What this actually costs">
        <p>
          Every attempt is money spent, whether you win or not. A run that ends at level 6 —
          one go, the free replay used, then carrying on twice — has cost{' '}
          {coinWord(EXAMPLE_COINS)}: that is {naira(coinsToNaira(EXAMPLE_COINS, coinPrice))},
          gone.
        </p>
        <p>
          Most boxes are never beaten. Level 10 asks for thirteen flashes recalled in five
          seconds, and it is meant to be hard. Play as though you will not win, because
          usually you will not.
        </p>
      </Section>

      <Section heading="Before you top up">
        <Card className="border-gold/30 bg-gold/8">
          <ul className="grid gap-2 text-sm leading-relaxed text-chalk">
            <li>Decide what you are willing to lose today, before you buy coins.</li>
            <li>Buy that amount once. Do not top up again to chase a level.</li>
            <li>Stop when the coins are gone. That was the decision, already made.</li>
            <li>Never play with money meant for rent, food, school fees or anyone else.</li>
            <li>Never borrow money to play.</li>
          </ul>
        </Card>
      </Section>

      <Section heading="Signs to take seriously">
        <p>
          Playing to win back what you have lost. Hiding how much you spend. Topping up more
          often than you meant to. Feeling anxious rather than entertained when you play.
        </p>
        <p>
          If any of that sounds familiar, stop and talk to somebody you trust. In Nigeria, the
          Mentally Aware Nigeria Initiative and the Nigerian Mental Health helplines can help
          with the pressure that sits underneath it.
        </p>
      </Section>

      <Section heading="Taking a break">
        <p>
          Email{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-cyan underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>{' '}
          and ask us to close your account. We will do it, and we will not ask you to
          reconsider.
        </p>
      </Section>

      <Section heading="Under 18">
        <p>
          You must be 18 or over to play for money. If you are not, do not create an account.
        </p>
      </Section>
    </LegalPage>
  )
}
