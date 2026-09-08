import { LegalPage, Section } from '@/components/legal-page'
import { optionalProfile } from '@/lib/session'
import { CONTACT_EMAIL } from '@/lib/contact'
import { MIN_TOPUP_COINS, NAIRA_PER_COIN, PRIZE_NAIRA, naira } from '@/lib/money'
import { LEVELS } from '@/lib/game'

export const metadata = { title: 'Terms and conditions' }

export default async function TermsPage() {
  const profile = await optionalProfile()

  return (
    <LegalPage
      profile={profile}
      title="Terms and conditions"
      intro="The rules of using Spendbox, in plain language."
      updated="8 September 2026"
    >
      <Section heading="1. What Spendbox is">
        <p>
          Spendbox is a game of skill. Players pay coins to attempt a pattern-matching game,
          and a prize is paid when somebody completes it. Nothing here is a lottery, a raffle
          or a game of chance: the outcome depends entirely on the player&apos;s memory and
          speed.
        </p>
      </Section>

      <Section heading="2. Your account">
        <p>
          You need an email address and a password. You are responsible for keeping your
          password to yourself, and for everything done through your account.
        </p>
        <p>
          One person, one account. Accounts created to abuse the platform — including several
          accounts controlled by the same person — may be closed and any pending payouts
          withheld.
        </p>
        <p>You must be 18 or older to play for money.</p>
      </Section>

      <Section heading="3. Coins">
        <p>
          A coin costs {naira(NAIRA_PER_COIN)}. The smallest top-up is {MIN_TOPUP_COINS}{' '}
          coins. Coins are bought through Paystack and credited only once Paystack confirms
          the payment.
        </p>
        <p>
          <strong>Coins are non-refundable once spent</strong>, including on an attempt you
          lose. Unspent coins have no cash value and cannot be transferred or withdrawn.
        </p>
      </Section>

      <Section heading="4. Boxes and prizes">
        <p>
          Creating a box is free. Every box carries a prize of {naira(PRIZE_NAIRA)}. A box can
          be beaten once, by the first player to clear all {LEVELS} levels.
        </p>
        <p>
          When a box is beaten, {naira(PRIZE_NAIRA)} is owed to the winning player and{' '}
          {naira(PRIZE_NAIRA)} to the person who created it.{' '}
          <strong>
            If the creator beats their own box, the prize is paid once, not twice.
          </strong>
        </p>
        <p>
          A box cannot be deleted while it is open. Its name, description and picture can be
          changed by its creator at any time; the prize cannot.
        </p>
      </Section>

      <Section heading="5. Payouts">
        <p>
          Payouts are made by bank transfer to a Nigerian bank account you provide, and are
          sent <strong>within one week</strong> of the box being beaten.
        </p>
        <p>
          We verify your account number with your bank before saving it. We pay the account
          name your bank returns. If you give details we cannot verify, we cannot pay you.
        </p>
        <p>
          We may withhold a payout where we reasonably believe the result was obtained by
          fraud, by interfering with the game, or in breach of these terms.
        </p>
      </Section>

      <Section heading="6. Fair play">
        <p>
          Do not attempt to interfere with the game — including automating play, tampering
          with requests, or exploiting a defect. Doing so may result in your account being
          closed and pending payouts withheld.
        </p>
        <p>
          If you find a defect, tell us at{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-cyan underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>{' '}
          rather than using it.
        </p>
      </Section>

      <Section heading="7. Availability">
        <p>
          We do not promise the service will always be available or free of defects. Where a
          game is interrupted by a fault on our side, we will restore the coin spent on it.
        </p>
      </Section>

      <Section heading="8. Changes and closing your account">
        <p>
          We may change these terms. Where a change materially affects you we will say so on
          the site. Continuing to play after a change means you accept it.
        </p>
        <p>
          You can ask us to close your account at any time by emailing{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-cyan underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
          . Any box you have open stays open until it is beaten, because other people have
          paid to play it.
        </p>
      </Section>

      <Section heading="9. Contact">
        <p>
          Questions, disputes and complaints:{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-cyan underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
          . We aim to answer within three working days.
        </p>
      </Section>

      <Section heading="10. A note on this document">
        <p>
          These terms are written to be read and understood, not to be exhaustive. They are
          not legal advice and have not been reviewed by a lawyer. If you are operating
          Spendbox commercially, have them reviewed against Nigerian consumer and gaming law
          before you take real money.
        </p>
      </Section>
    </LegalPage>
  )
}
