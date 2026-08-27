import {
  LIFE_PRICE_KOBO,
  LIFE_PURCHASE_MAX,
  LIFE_PURCHASE_MIN,
  LIFE_REGEN_MINUTES,
  LIVES_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  PLATFORM_SHARE_PERCENT,
  REFERRAL_BONUS_LIVES,
} from "@/lib/constants";
import { formatNaira, minFundingKobo, splitFunding } from "@/lib/game/rewards";
import { loadFundingLadder } from "@/lib/game/pricing";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Terms — Spendbox",
  description: "The rules of playing, putting up a box, and getting paid.",
};

const share = 100 - PLATFORM_SHARE_PERCENT;

/**
 * Rendered per request rather than prerendered.
 *
 * Nothing on this page touches a request-time API, so Next would build it once
 * and serve that forever — and one of the figures in it is a setting now.
 * A prerendered copy would state last deploy's floor as a term of the contract
 * while the create route enforced a different one.
 */
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  // "Where a figure appears here it is the same figure the software uses" is
  // the promise this page opens with, and the floor is a setting now — so it
  // is loaded on every render rather than baked in at build time.
  const ladder = await loadFundingLadder(supabaseAdmin());
  const floor = minFundingKobo(MIN_LENGTH, ladder);
  const ceiling = minFundingKobo(MAX_LENGTH, ladder);

  return (
    <LegalPage
      title="Terms of use"
      updated="2026-08-03"
      intro="These are the rules of Spendbox: what you can expect from us, what we expect from you, and what happens to money on the way in and out. They are written to be read rather than to be impressive, and where a figure appears here it is the same figure the software uses."
      sections={[
        {
          heading: "Using Spendbox",
          paragraphs: [
            "You must be old enough to enter a binding contract where you live, and old enough to take part in a paid game of skill. If you are not, do not use Spendbox.",
            "One person, one set of accounts. Do not create additional accounts or email addresses to claim invite bonuses, to get around a limit, or to appear to be more than one person.",
            "Do not attempt to obtain a password by any means other than guessing it in the game. That includes attacking our systems or our payment provider's, interfering with other players, and approaching whoever put a box up to ask for it. Any of these ends your access and forfeits anything outstanding.",
            "Automated play is not prohibited outright — a password game is a game of persistence and we are not going to pretend otherwise — but anything that degrades the service for other people is. If your traffic is a problem for the platform we will rate-limit or block it.",
          ],
        },
        {
          heading: "Playing a box",
          paragraphs: [
            `Every guess costs one life. You hold up to ${LIVES_MAX} at a time and one returns every ${LIFE_REGEN_MINUTES} minutes at no cost, indefinitely. Playing is free and always will be; anything you pay for buys speed or information, never an outcome.`,
            "A guess is correct only if it matches the password exactly, including capitalisation.",
            "A box ends the moment somebody guesses its password. If two guesses arrive together exactly one is treated as the winner, decided by the database, and the other player is told they were beaten to it.",
            "We may withdraw a box from play if it breaks these terms or if something has gone wrong with it. Where a box is withdrawn before anyone has cracked it, we will refund the person who funded it.",
          ],
        },
        {
          heading: "Lives and power-ups",
          paragraphs: [
            `Extra lives cost ${formatNaira(LIFE_PRICE_KOBO)} each, are bought ${LIFE_PURCHASE_MIN} to ${LIFE_PURCHASE_MAX} at a time, and are added to your pool once payment is confirmed. Power-ups are priced per box and take effect once payment is confirmed. Nothing is revealed and nothing is charged if a payment is abandoned.`,
            "Lives and power-ups are digital goods delivered immediately, so purchases are not refundable once they have been applied. If something is charged and not delivered, tell us and we will fix it — an administrator can grant lives directly.",
            "Lives, power-ups and any bonus have no cash value and cannot be transferred, sold or withdrawn.",
            "We may change what power-ups exist and what they cost. Anything you have already bought keeps working on the terms it was bought under.",
          ],
        },
        {
          heading: "Invites",
          paragraphs: [
            `If somebody joins on your invite link, ${REFERRAL_BONUS_LIVES} free lives are credited to your account and ${REFERRAL_BONUS_LIVES} to theirs, immediately and with nothing to buy. The inviter's side stacks without limit; a given player can be invited once, and an inviter once attached is never changed.`,
            "Bonus lives are free. Nobody is charged for them, so no share is paid to anybody on them.",
            "Invite bonuses obtained through additional accounts, purchased traffic, or any arrangement whose purpose is to trigger the bonus rather than to bring a real player, will be removed. Persistent abuse ends your access.",
          ],
        },
        {
          heading: "Putting up a box",
          paragraphs: [
            `Anyone may put up a box. You choose the password and the reward; the minimum rises with the length, from ${formatNaira(floor)} at ${MIN_LENGTH} characters up to ${formatNaira(ceiling)} at ${MAX_LENGTH}.`,
            `${share}% of what you pay in becomes the reward — ${formatNaira(splitFunding(floor).rewardKobo)} at the floor — and Spendbox retains ${PLATFORM_SHARE_PERCENT}% for hosting and running the box. The reward is collected in full and up front, so a winner is never waiting on you to be good for it.`,
            "Before a box is paid for it is yours: change anything, or delete it. Once it is funded the password, the title and the design are permanent, and the box cannot be deleted by anyone. The reward may be increased at any time and can never be reduced.",
            "You are responsible for the password you choose and for the content of your box's title and description. Do not use a box to distribute anything unlawful, to harass anybody, or to advertise something you are not entitled to advertise.",
            "You cannot win your own box, and neither can anybody you are acting with. Where we find that a reward has been collected by or on behalf of the person who funded it, we will reverse it.",
          ],
        },
        {
          heading: "Promo safes",
          paragraphs: [
            "A promo safe is put up from the Build screen like any other box, for a fixed price shown before you pay. You do not choose the password and you never see it: it is drawn at random by our database and read by nobody. We fund the prize behind it, and the figure shown on the safe is the figure its winner is paid.",
            "It is a limited promotion. Only a set number exist in total, the remaining count is shown before you take one, and when they are gone they are gone. We may change the price, the prize or the number on offer at any time; none of that changes a safe already live.",
            "One at a time, and a safe you have reserved but not paid for counts as yours until you pay or it is withdrawn. Once yours is cracked you may take another if any are left.",
            `You earn ${share}% of everything hunters spend on your promo safe, exactly as on a box you funded yourself, and it settles to your registered account the same way.`,
            "You cannot win your own promo safe, and this one is enforced rather than promised: guesses from the account that put it up are refused before a life is spent. Neither may anyone acting with you. Where we find a reward has been collected on behalf of the person who put the safe up, we will reverse it.",
            "The price buys the placement and the prize behind it — not an outcome. If nobody ever cracks your safe, nothing is refunded, exactly as with a box you funded yourself.",
            "You are not responsible for the password, because you did not choose it — but you are responsible for how you share the safe. Do not misrepresent the odds, promise anybody a share of the prize, or advertise it somewhere you are not entitled to.",
          ],
        },
        {
          heading: "What contributors earn",
          paragraphs: [
            `${share}% of everything hunters spend on your boxes — power-ups, and lives bought while playing them. Spendbox retains ${PLATFORM_SHARE_PERCENT}%.`,
            "Your share of each sale is recorded when the sale is made and transferred to the bank account you register, weekly. Your dashboard shows what has been earned, what has been sent, and the difference.",
            "Money you put behind a password is not income and is not returned to you. It is the reward, and it goes to whoever opens the box.",
          ],
        },
        {
          heading: "Rewards",
          paragraphs: [
            "Opening a box entitles you to the reward shown on it at that moment. We ask for a bank account, check the number against the bank, and send the transfer.",
            "A reward is paid to the account you give us. Give us the wrong account and we cannot get it back for you.",
            "We may withhold a reward while we look into a suspected breach of these terms, and will not pay one that was obtained in breach of them.",
            "Payments are made in Nigerian naira through our payment provider and are subject to that provider's limits and checks.",
          ],
        },
        {
          heading: "The password stays hidden",
          paragraphs: [
            "A password is compared inside the database and never enters our application. Nobody at Spendbox — support, administrators, or engineers — can read back a password you wrote.",
            "That applies to whoever wrote it too. Keep your own copy before funding a box; we cannot recover it.",
            "The exception, stated plainly: a promo safe's password was written by nobody. It is drawn at random by the database and shown to no one, including the person who put the safe up — and administrators can read it, because there is no person it could betray. Every password you choose yourself stays unreadable to us.",
          ],
        },
        {
          heading: "Availability and changes",
          paragraphs: [
            "Spendbox is provided as it is. We do not promise it will be available without interruption, and we are not liable for losses arising from an interruption beyond restoring what was actually lost — lives, purchases, and any reward properly won.",
            "We may change these terms. Where a change materially affects money already committed — a reward funded, a purchase made — the terms in force when you committed it continue to apply to it.",
            "Nothing here limits any right you have that cannot be limited by agreement.",
          ],
        },
        {
          heading: "Ending it",
          paragraphs: [
            "You may stop using Spendbox at any time. Boxes you have funded and rewards you have won are unaffected.",
            "We may suspend or end access for a breach of these terms. Where we do, any reward already properly won is still paid.",
          ],
        },
      ]}
    />
  );
}
