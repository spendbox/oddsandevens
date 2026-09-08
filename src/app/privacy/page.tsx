import { LegalPage, Section } from '@/components/legal-page'
import { optionalProfile } from '@/lib/session'
import { CONTACT_EMAIL } from '@/lib/contact'

export const metadata = { title: 'Privacy' }

export default async function PrivacyPage() {
  const profile = await optionalProfile()

  return (
    <LegalPage
      profile={profile}
      title="Privacy"
      intro="What we keep about you, why, and what you can ask us to do with it."
      updated="8 September 2026"
    >
      <Section heading="What we keep">
        <p>
          <strong>Your email address and password.</strong> The password is stored hashed by
          our authentication provider; nobody at Spendbox can read it.
        </p>
        <p>
          <strong>A display name</strong>, which is shown on boxes you create and when you
          beat one. It starts as part of your email address and you can change it.
        </p>
        <p>
          <strong>Your bank details</strong>, if you add them — bank, account number, and the
          account name your bank returned. These exist so we can pay you.
        </p>
        <p>
          <strong>What you have done here:</strong> coins bought and spent, boxes made, games
          played, and prizes owed or paid.
        </p>
      </Section>

      <Section heading="What we do not keep">
        <p>
          We never see or store your card details. Payments happen on Paystack, and we receive
          only a reference and confirmation that money arrived.
        </p>
        <p>We do not sell your data, and we do not run advertising trackers.</p>
      </Section>

      <Section heading="Who else sees it">
        <p>
          <strong>Supabase</strong> hosts our database and handles sign-in.{' '}
          <strong>Paystack</strong> processes payments and verifies bank accounts.{' '}
          <strong>Resend</strong> sends the password-reset emails. <strong>Vercel</strong>{' '}
          runs the site. Each sees only what it needs to do its job.
        </p>
        <p>
          Your display name is public on boxes you create and boxes you beat. Your email
          address and bank details are not shown to other players.
        </p>
      </Section>

      <Section heading="How long">
        <p>
          While your account is open. We keep records of money movements for six years after
          that, because that is what accounting for real payments requires.
        </p>
      </Section>

      <Section heading="What you can ask for">
        <p>
          A copy of what we hold about you, a correction, or deletion of your account. Email{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-cyan underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>{' '}
          and we will answer within 30 days.
        </p>
        <p>
          Deletion removes your account and personal details. It does not remove a box you
          created that other people have paid to play, and it does not remove records of
          payments we are required to keep.
        </p>
      </Section>
    </LegalPage>
  )
}
