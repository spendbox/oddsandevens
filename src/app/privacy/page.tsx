import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Privacy — Spendbox",
  description: "What Spendbox collects, why, who sees it, and how to get rid of it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="2026-08-03"
      intro="Spendbox collects very little, because it needs very little. There is no profile, no tracking pixel and no advertising. This page says exactly what exists, why it exists, and who can see it."
      sections={[
        {
          heading: "What we collect",
          paragraphs: [
            "From a player:",
            [
              "Your email address, verified once. It is how a reward reaches you and how your life pool is kept.",
              "Your guesses, when you made them, and what they scored.",
              "What you have bought, and when.",
              "Bank details, but only if you win something and give them to us.",
            ],
            "From a contributor, additionally:",
            [
              "A display name and handle, which are public.",
              "The passwords you set, stored so that only the database can compare against them.",
              "Bank details, so a reward or a contributor's share can be transferred to you.",
            ],
            "And technically, in ordinary server logs: IP address, browser, and the pages requested. These are used to keep the service working and to spot abuse.",
          ],
        },
        {
          heading: "What we do not collect",
          paragraphs: [
            "No advertising or analytics trackers. No third-party cookies. No cross-site profile. No location beyond what an IP address implies. No contact list, ever — an invite link is a link, and we never ask for anybody's address book.",
            "We do not have your card number. Payments go directly to our payment provider, which handles the card details; we receive a reference and a result.",
          ],
        },
        {
          heading: "Email and notifications",
          paragraphs: [
            "Some email is unavoidable and always will be: a sign-in code, a reward on its way to you, a receipt. Those are the point of having your address and you cannot turn them off without losing the account.",
            "Anything else — news about a new safe, a nudge that yours is still open — carries a one-click unsubscribe at the bottom, and one click is all it is. No login, no confirmation step, no survey. It stops every message of that kind and touches nothing else: your lives, your safes and anything you have won are unaffected.",
            "Notifications in your browser are separate and are held by your browser, not by us. We cannot switch them on, and once you have switched them off there is nothing on our side to ask you again with. Turning them off in your browser settings, or from the switch on your own page, is final.",
          ],
        },
        {
          heading: "Cookies and local storage",
          paragraphs: [
            "One signed cookie remembers a verified player for six months, so you are not re-verifying an address every visit. Contributors have a session cookie for the dashboard.",
            "Your browser also stores an invite code locally if you arrived on somebody's link, so it can be attributed once you verify an address. It is cleared as soon as that happens.",
            "There are no other cookies, and none of them are used to track you anywhere else.",
          ],
        },
        {
          heading: "Who can see what",
          paragraphs: [
            "Your email address is visible to us and to nobody else. Where a contributor sees who has been attacking their box, and where an opened box shows who cracked it, the address is starred out before it leaves our servers — the full address is never sent to another user's browser.",
            "A contributor can see, for their own boxes only: how many attempts each hunter has made, their best score, and what they have bought. They cannot see your address, your other boxes, or anything about you elsewhere on the platform.",
            "Your guesses are yours. No other player sees them.",
          ],
        },
        {
          heading: "Who we share it with",
          paragraphs: [
            "Three processors, and nothing beyond what each needs:",
            [
              "Supabase hosts the database and authentication.",
              "Paystack processes payments. It receives the email address a payment is made from and the amount, and it is asked to confirm the name on a bank account before we store it.",
              "Resend sends the emails: verification codes, and the note telling you that you have won something.",
            ],
            "We do not sell data, and there is no fourth party. We will disclose information where the law requires it.",
          ],
        },
        {
          heading: "How long we keep it",
          paragraphs: [
            "Attempts, boxes and payment records are kept for as long as the account exists, and payment records for as long afterwards as accounting rules require.",
            "Verification codes expire in minutes and are deleted. Server logs are kept for a short period and then discarded.",
            "A box that has been played cannot be deleted by anyone, including us, because the record of what people spent on it has to outlive a change of heart. Deleting an account removes the identifying data attached to those records rather than the records themselves.",
          ],
        },
        {
          heading: "Your choices",
          paragraphs: [
            "Ask us and we will tell you everything held against your address, correct anything wrong, or delete your account.",
            "You can stop playing at any time and nothing further is collected.",
            "If you would rather not have an invite attributed to anybody, clear your browser's storage for this site before verifying an address.",
          ],
        },
        {
          heading: "Security",
          paragraphs: [
            "Passwords behind boxes are compared inside the database and never enter the application. Nobody here can read one back to you — not support, not an administrator.",
            "Access to the database from a browser is refused by default; everything a page can read goes through a server route that decides what may be seen. Emails are masked before they leave the server rather than in the browser.",
            "If you think you have found a security problem, tell us before telling anybody else and we will fix it.",
          ],
        },
        {
          heading: "Changes and contact",
          paragraphs: [
            "If this page changes materially we will say so here and update the date at the top.",
            "For anything on this page — a copy of your data, a correction, a deletion, or a question — get in touch with us at the address on the site.",
          ],
        },
      ]}
    />
  );
}
