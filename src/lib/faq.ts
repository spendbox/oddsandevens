// Everything the app deliberately doesn't say.
//
// The screens are terse on purpose — a play surface covered in explanation is
// a play surface nobody plays on — and this is where all of it went. It is the
// only place in the product allowed to be long.
//
// Two rules for what belongs here. It must be **true of the code**, which is
// why the money figures are computed from the same constants the routes use
// rather than typed out. And it must **never explain how a score is
// calculated**: the weights behind a percentage aren't in the app, the API,
// this file, or anywhere else a player can reach.

import {
  INVITEE_BONUS_LIVES,
  INVITER_BONUS_LIVES,
  LIFE_PRICE_KOBO,
  LIFE_REGEN_MINUTES,
  LIVES_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  PLATFORM_SHARE_PERCENT,
  REFERRAL_MIN_LIVES,
  ALPHABET,
  MAX_FUNDING_KOBO,
} from "@/lib/constants";
import { formatNaira, fundingSchedule, minFundingKobo, splitFunding } from "@/lib/game/rewards";
import { BREAKDOWN_HOURS, LIFE_BANK_MAX, SECOND_WIND_HOURS } from "@/lib/game/power-ups";

export const FAQ_TOPICS = [
  "Playing",
  "Lives",
  "Power-ups",
  "Invites",
  "Building a box",
  "Money",
  "Account",
] as const;

export type FaqTopic = (typeof FAQ_TOPICS)[number];

export interface FaqItem {
  topic: FaqTopic;
  question: string;
  answer: string[];
}

const share = 100 - PLATFORM_SHARE_PERCENT;
const floor = minFundingKobo(MIN_LENGTH);

export const FAQ: FaqItem[] = [
  // ---- Playing ------------------------------------------------------------
  {
    topic: "Playing",
    question: "What is a Spendbox?",
    answer: [
      "A Spendbox is a password with real money behind it. Somebody — us, or any player who wants to — hides a password, funds a reward, and shares the link. Anyone who guesses the password takes the reward.",
      "Some are created by Spendbox and funded by us; the rest are created by players. Every one of them is open to anybody, and they play identically — the only difference is whose money is behind the reward.",
    ],
  },
  {
    topic: "Playing",
    question: "Is the money real?",
    answer: [
      "Yes. Every reward on Spendbox is real money, paid in naira to the bank account of whoever cracks the box.",
      "It is collected up front, in full, before a box ever goes on the board — from us on the boxes we create, and from the player who put it up on everyone else's. Nobody is waiting on somebody to be good for it at the moment they win.",
      "You can see it for yourself: the Already cracked tab on the front page lists every box that has been opened and what came out of it.",
    ],
  },
  {
    topic: "Playing",
    question: "How do I know if I'm getting closer?",
    answer: [
      "Every guess comes back with two things. First, whether it was too short, too long, or exactly the right length. Second, a score from 0 to 100 showing how close the guess is to the password.",
      "100% is the password itself, and nothing else reaches it.",
    ],
  },
  {
    topic: "Playing",
    question: "How is the score calculated?",
    answer: [
      "We don't publish that, and we won't. Working out what a score is telling you is the game — if the arithmetic were public, a spreadsheet could play it for you.",
      "What we will say is that every position contributes something, that being right in the wrong case is worth less than being right outright, and that a character which is in the password but sitting somewhere else counts for something too. The same score can be reached in very different ways.",
    ],
  },
  {
    topic: "Playing",
    question: "Does capitalisation matter?",
    answer: [
      "Yes. `k` and `K` are different characters, and a guess is only correct if the case is right too.",
      "This is the single biggest reason a box takes hundreds of attempts rather than a dozen.",
    ],
  },
  {
    topic: "Playing",
    question: "What characters can a password contain?",
    answer: [
      `Anything on a standard keyboard: the 26 letters in either case, the ten digits, and every symbol — ! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ \` { | } ~. That is ${ALPHABET.length} possible characters in every position.`,
      "Spaces count too, so a password can be a phrase. Wherever a guess is shown back to you a space is drawn as ␣, so you can always see whether one is there.",
    ],
  },
  {
    topic: "Playing",
    question: "How long is the password?",
    answer: [
      `Between ${MIN_LENGTH} and ${MAX_LENGTH} characters. You are never told which — working the length out is the first thing you have to do, and every guess tells you whether you were above, below, or exactly right.`,
      "If you'd rather skip that part, Length Lock tells you the number outright.",
    ],
  },
  {
    topic: "Playing",
    question: "What does the difficulty tier mean?",
    answer: [
      "It's a rough band based on how long the password is — Warm, Tricky, Hard, Brutal, Merciless. A tier narrows the length down to a range of five or six characters, which is enough to decide whether a box is worth your time without handing you the answer.",
      "We don't publish an attempt estimate anywhere. It would be a direct function of the length, which would defeat the point of hiding it.",
    ],
  },
  {
    topic: "Playing",
    question: "Can I play a box that's already been opened?",
    answer: [
      "No. Once somebody guesses the password, that box is finished for good and the reward goes to them. Opened boxes stay visible so you can see what was behind them and who took it.",
    ],
  },
  {
    topic: "Playing",
    question: "What if two people guess it at the same moment?",
    answer: [
      "Exactly one of them wins. The database decides it with a single conditional update, so there is no window in which two people can both be told they've won. The other is told they were pipped, which is honest and rare.",
    ],
  },

  // ---- Lives --------------------------------------------------------------
  {
    topic: "Lives",
    question: "What are lives?",
    answer: [
      `One life buys one guess, win or lose. You hold up to ${LIVES_MAX} at a time, and they're shared across every box — the pool belongs to you, not to any particular safe.`,
    ],
  },
  {
    topic: "Lives",
    question: "Do lives come back on their own?",
    answer: [
      `Yes. One life every ${LIFE_REGEN_MINUTES} minutes, ${Math.round((60 / LIFE_REGEN_MINUTES) * 24)} a day, free, forever. You never have to buy anything to keep playing.`,
      "Paying only buys speed. A hard box is a siege either way.",
    ],
  },
  {
    topic: "Lives",
    question: "How much do extra lives cost?",
    answer: [
      `${formatNaira(LIFE_PRICE_KOBO)} each. You can buy them from your own page or from inside any box.`,
    ],
  },
  {
    topic: "Lives",
    question: "Is there a limit on how many guesses I can make?",
    answer: [
      "No. There's no daily cap and no cooling-off period — the only limit is how many lives you have.",
      `If you want to work without that limit for a while, Second Wind gives you unlimited guesses on one box for ${SECOND_WIND_HOURS} hour, and spends no lives at all.`,
    ],
  },

  // ---- Power-ups ----------------------------------------------------------
  {
    topic: "Power-ups",
    question: "What are power-ups?",
    answer: [
      "The only thing anyone ever pays for. Each one buys back exactly one thing the game withholds — the length, what the password is made of, the parts behind a score, half its characters, or an hour with no life limit.",
      "Nothing about them is required. A box can be cracked without buying anything.",
    ],
  },
  {
    topic: "Power-ups",
    question: "What does each one do?",
    answer: [
      "Length Lock tells you exactly how many characters the password has.",
      "Seven counters each answer one question about what the password is made of, without saying where anything sits: how many capitals, how many lowercase letters, how many vowels, how many consonants, how many digits, how many symbols and how many spaces. Each is priced by how much of the search it removes — knowing there are no symbols rules out far more than knowing there are no spaces.",
      `Second Wind gives you unlimited guesses on that box for ${SECOND_WIND_HOURS} hour, spending no lives.`,
      `Colour Read splits every score into its parts for ${BREAKDOWN_HOURS} hours — including every attempt you've already made.`,
      "X-Ray names half the different characters the password is built from, in no order — and can be bought again for half of what's left.",
      `Life Bank raises your life ceiling from ${LIVES_MAX} to ${LIFE_BANK_MAX}, permanently and on every box. It's the only one that isn't about the password.`,
    ],
  },
  {
    topic: "Power-ups",
    question: "Can I buy the same power-up twice?",
    answer: [
      "Length Lock, the seven counters and Life Bank are one purchase each: what they give you never changes, so buying again would pay for the same answer.",
      `Second Wind and Colour Read rent a window rather than sell a fact — ${SECOND_WIND_HOURS} hour and ${BREAKDOWN_HOURS} hours respectively — and can be bought again the moment they lapse.`,
      "X-Ray can be bought as often as you like. Each purchase draws from the characters it hasn't named yet, so it never tells you the same thing twice, and it stops being offered once you have all of them.",
    ],
  },
  {
    topic: "Power-ups",
    question: "Why do power-ups cost different amounts on different boxes?",
    answer: [
      "Because a hint that saves you a fortnight on a seven-million-naira safe isn't worth what the same hint is worth on a seven-thousand-naira one. Prices move with the size of the reward.",
      "The price you're shown is the price you pay. There's nothing to work out.",
    ],
  },
  {
    topic: "Power-ups",
    question: "What happens if I cancel a payment halfway through?",
    answer: [
      "Nothing is revealed and nothing is charged. A power-up's effect is computed only after the payment is confirmed, so an abandoned checkout leaves the box exactly as it was.",
    ],
  },

  // ---- Invites ------------------------------------------------------------
  {
    topic: "Invites",
    question: "How do invites work?",
    answer: [
      `Every player has an invite link. If somebody joins on your link and later buys ${REFERRAL_MIN_LIVES} or more lives, you both get free lives — ${INVITER_BONUS_LIVES} for you and ${INVITEE_BONUS_LIVES} for them.`,
      `For them that means buying ${REFERRAL_MIN_LIVES} and leaving with ${REFERRAL_MIN_LIVES + INVITEE_BONUS_LIVES}.`,
      "You'll find your link on your own page.",
    ],
  },
  {
    topic: "Invites",
    question: "When do the bonus lives arrive?",
    answer: [
      "On your next paid top-up, not immediately. They're added on top of whatever you buy, at no extra cost.",
      "If you have bonus lives waiting, the buy dialog says so before you pay.",
    ],
  },
  {
    topic: "Invites",
    question: "Does it stack?",
    answer: [
      `Yes, without limit. Ten people who join on your link and pay for ${REFERRAL_MIN_LIVES} lives each is ${INVITER_BONUS_LIVES * 10} free lives waiting on your next top-up.`,
    ],
  },
  {
    topic: "Invites",
    question: "Can I invite myself?",
    answer: [
      "No. A player can never be their own inviter, an inviter can only ever be attached once and never changed, and each invited person can qualify exactly once however many times they top up.",
    ],
  },

  // ---- Building a box -----------------------------------------------------
  {
    topic: "Building a box",
    question: "Who can put up a Spendbox?",
    answer: [
      "Anyone. There's no application, no approval, no business account and no verification. A name, a password and a reward is the whole of it.",
    ],
  },
  {
    topic: "Building a box",
    question: "What does it cost to put one up?",
    answer: [
      `From ${formatNaira(floor)} for a ${MIN_LENGTH}-character password. Longer passwords cost more, because they take longer to crack and a harder box has to be worth attacking.`,
      `${share}% of what you put in becomes the reward — ${formatNaira(splitFunding(floor).rewardKobo)} at the floor — and Spendbox keeps ${PLATFORM_SHARE_PERCENT}% for running the box.`,
    ],
  },
  {
    topic: "Building a box",
    question: "What does each password length cost?",
    answer: [
      "Every length has a floor, and it rises steeply — a longer password is a harder box and a harder box has to be worth attacking. You can always put up more than the floor; you can never put up less.",
      ...fundingSchedule().map(
        (row) =>
          `${row.length} characters — from ${formatNaira(row.minFundingKobo)}, a ${formatNaira(splitFunding(row.minFundingKobo).rewardKobo)} reward.`
      ),
      `${formatNaira(MAX_FUNDING_KOBO)} is the ceiling on any one box: it's the largest single transfer Paystack will make, and a reward that can't be paid out isn't a reward.`,
    ],
  },
  {
    topic: "Building a box",
    question: "Can I change a box after I've made it?",
    answer: [
      "Until it's paid for, yes — everything about it, and you can delete it outright. A draft is invisible and costs nothing.",
      "Once it's funded, the password, the name and the safe design are fixed for good. People are spending real lives against that exact password and changing it would invalidate every attempt they've made.",
    ],
  },
  {
    topic: "Building a box",
    question: "Can I increase the reward later?",
    answer: [
      "Yes, and only upwards. You pay the difference and the reward goes up. It can never be lowered, so anyone weighing up weeks of effort can trust the number on the card.",
    ],
  },
  {
    topic: "Building a box",
    question: "Can I delete a box that's live?",
    answer: [
      "No. Somebody may have spent weeks on it, and the record of what they did has to outlive a change of heart. If something is genuinely wrong, contact us and an admin can withdraw it from play — but it is never erased.",
    ],
  },
  {
    topic: "Building a box",
    question: "Can I see how close people are getting?",
    answer: [
      "Yes. The Attempts tab shows every hunter on your boxes, how many attempts they've made, and their best score so far.",
      "You wrote the password, so a closeness reading tells you nothing you don't already know. Nobody else can see it.",
    ],
  },
  {
    topic: "Building a box",
    question: "What if I lose the password?",
    answer: [
      "Nobody at Spendbox can read it back to you — not support, not an admin, not the person who wrote this. It's stored so that only the database can compare against it, and it never enters the application at all.",
      "Keep your own copy before you fund the box.",
    ],
  },

  // ---- Money --------------------------------------------------------------
  {
    topic: "Money",
    question: "How does a contributor earn?",
    answer: [
      `${share}% of everything hunters spend on your box — power-ups, and lives bought while playing it. Spendbox keeps ${PLATFORM_SHARE_PERCENT}%, and it is settled to your bank account automatically as each sale happens.`,
      "What you funded isn't income. That's the reward, and it goes to whoever cracks the box.",
    ],
  },
  {
    topic: "Money",
    question: "When do I get paid?",
    answer: [
      "Automatically, as it happens. Your bank account is registered with Paystack as a subaccount and every sale is split at settlement, so your share never sits in a Spendbox balance waiting for someone to move it.",
    ],
  },
  {
    topic: "Money",
    question: "Do bonus lives from invites earn a contributor anything?",
    answer: [
      "No. Bonus lives are free lives — nobody is charged for them, so there's nothing to split. Only lives somebody actually pays for count.",
    ],
  },
  {
    topic: "Money",
    question: "How do I get a reward I've won?",
    answer: [
      "Opening a box creates a claim. If you've already saved your bank details, it goes there; if not, add them in your safe house under Account and the transfer follows. We check the number with your bank and show you the name on it before saving.",
    ],
  },
  {
    topic: "Money",
    question: "Is there a maximum reward?",
    answer: [
      `${formatNaira(minFundingKobo(MAX_LENGTH))} is the most that can be put behind one box. That's the largest single transfer our payment provider will make, so it's also the most a winner can be paid in one go.`,
    ],
  },

  // ---- Account ------------------------------------------------------------
  {
    topic: "Account",
    question: "Do I need an account to play?",
    answer: [
      "Yes, and it takes one screen. An email address, a code to prove it's yours, and a password — that's the whole of it. There's no profile to fill in.",
      "The account exists for one reason: there is real money involved. A reward has to reach somebody, lives you paid for have to survive a new phone, and a bank account on file has to be protected by more than a cookie.",
      "You'll never be asked for it before you need it — the sign-up appears on the box you were already looking at, at the moment you make your first guess.",
    ],
  },
  {
    topic: "Account",
    question: "I've forgotten my password.",
    answer: [
      "Sign in, and choose \u201cI've forgotten my password\u201d. We'll email a six-digit code, and the same screen lets you set a new one.",
      "If you're already signed in somewhere, Account in your safe house changes it without any email at all.",
    ],
  },
  {
    topic: "Account",
    question: "How do I change my bank details?",
    answer: [
      "Your safe house, under Account. They're saved against you rather than against a single reward, so every future win goes to the current details without you typing anything.",
      "We check the number with your bank and show you the name on it before saving. A reward that has already been sent isn't affected — that's a payment record and doesn't move.",
    ],
  },
  {
    topic: "Account",
    question: "Who can see my email address?",
    answer: [
      "Nobody but us. Contributors see attempts on their boxes with addresses starred out before they leave our servers, and the same is true of the winner shown on an opened box.",
    ],
  },
  {
    topic: "Account",
    question: "Something has gone wrong and I've lost lives. Can you fix it?",
    answer: [
      "Yes. Admins can grant lives directly, and that's the right fix when something breaks on our side. Get in touch.",
    ],
  },
];
