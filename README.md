# Spendbox

**Guess the password. Open the safe.**

A spendbox is a password with money behind it. You aren't told how long it is.
Every guess costs one life and comes back with one number: how close you are,
out of 100. What that number is made of is never explained. Reach 100% and the
money is yours.

Playing is free: seven lives, one back every hour, forever.

---

## The two kinds of box

There is one game. It comes in two versions, and the only difference is whose
money is behind the reward.

**The public box** is authored by the platform in `/admin` and funded by the
platform. Free, nothing to collect, no split. Exactly one is playable at a time — a
unique partial index enforces it — because the public game is *the* public
game, not a catalogue of them.

**A contributor box** is anyone else's. A contributor writes a password, puts
money behind it, and shares the link. There is no business here: no trading name,
no logo, no category, no verification. A contributor is a person who put money
behind a password and wants people to attack it.

---

## Guessing

A password is 3 to 26 characters from the 26 letters (both cases), ten digits
and twelve symbols — 74 in all. **Case is part of the password.** `k` and `K`
are different characters, which roughly squares the search space and is the
single biggest reason a box takes hundreds of attempts rather than a dozen.

An attempt answers two things:

| | |
| --- | --- |
| **Length** | Too short, too long, or exactly right. Nothing ever says how long the password is — that's the first thing you have to hunt. |
| **Score** | How close the guess is, as a percentage of a perfect one. |

Every position contributes to the score: an exact character most, the right
letter in the wrong case least, a character that's in the password but sitting
somewhere else in between. **How much each is worth is not published** — not in
the app, not in the API, not in any copy. Two very different guesses can score
the same, and working out which explanation fits is the game.

The denominator is the longer of the guess and the password, so padding a
correct prefix out dilutes the score rather than being free. That's what makes
**100% mean solved and nothing else**.

A guess shorter than the password is compared over its own length, and can
still find a character that lives further along — which is what makes
length-hunting playable.

The password is read, compared and dropped **inside Postgres** — `score_attempt`
and `spend_attempt` are plpgsql, so it never enters application memory at all.

---

## Lives

A player holds **7 lives**, and **one comes back every hour** — 24 a day, free,
forever. They're held by the *player*, not by a box: one pool spent across the
public box and every contributor box alike.

**One life buys one guess**, win or lose. There is no bounded "run", no cap on
how many attempts a box takes, and no ceiling on how fast you may make them —
only on how many lives you have. A hard box is a siege, not a sitting.

Lives can also be bought at **₦150 each**, up to 100 at a time. Nobody has to
— the pool refills whether or not anyone pays, and the buy dialog says so
before it says anything else.

Admins can grant lives from `/admin`, to an address that has never played if
need be. It's the only honest fix when something breaks on our side.

---

## The breakdown is a purchase

By default a score is one opaque number. **Colour Read** (₦5,000) splits every
attempt — the ones already made included — into its three parts: exact hits,
right-letter-wrong-case hits, and characters that are in there somewhere else.

It lasts **24 hours** and can be bought again after that. Alone among the
power-ups it rents rather than sells: everything else hands over a fact that
stays true forever, while this changes how the whole board reads and would
otherwise be one payment that permanently halves the game. The expiry is
checked against a clock on the server, so a page left open stops receiving
component counts the moment the window closes.

It is withheld on the server, not hidden in the browser. `buildPlayView` never
puts the component counts on the wire for a hunt that hasn't bought them, so
there is nothing to reveal by poking at the page.

It is also, measurably, about half the game — see the table below.

---

## Difficulty

Every box shows a difficulty tier. **Players see only the tier**: the attempt
estimate is a deterministic function of the password's length, so printing it
publicly would hand over the exact answer to the first thing a player has to
work out. A tier only narrows the length to a band of five or six.

Contributors see the full reading — attempts and days on free lives — because
they wrote the password and already know its length.

The model is the strategy the feedback actually permits: binary-search the
length (~5 attempts), then walk the positions one at a time, because a *count*
with no positions attached can only be read by changing one position and
watching it move. A wrong-case hit resolves the case for free, so the search
runs over 48 case-folded classes.

| Length | Tier | Free play | With Colour Read |
| --- | --- | --- | --- |
| 3 | Warm | 224 | 124 |
| 6 | Tricky | 443 | 267 |
| 10 | Hard | 736 | 387 |
| 18 | Brutal | 1,319 | 650 |
| 26 | Merciless | 1,904 | 1,043 |

Both columns are measured, not guessed: a solver implementing the only strategy
the scoring permits, median of 15 random passwords per length. It cracks 15/15
at every length, and the formula the app prints reproduces the free-play column
exactly.

Why free play costs twice as much: with a single number, the only safe reading
of a position is "try every character and keep the best". Thresholds on the
delta don't work — the character already sitting there may itself be scoring,
and a misplaced character is worth more than a right-place-wrong-case one, so a
naive argmax over one case gets led to the wrong answer. Only an exact hit is
guaranteed to top the scale, and proving you've found it means trying all 73
other characters. With the breakdown, an exact hit announces itself and the
scan stops halfway.

---

## Power-ups

The only thing a player ever pays for, and the only way a contributor makes
money back. They carry much more weight than they would in a gentler game:
each one deletes a specific chunk of a hundreds-of-attempts grind.

| Power-up | Price | What it does |
| --- | --- | --- |
| Colour Read | ₦5,000 | Splits every score, past and future, into its three parts — for 24 hours |
| Length Lock | ₦500 | Tells you exactly how many characters the password has |
| Sweep | ₦1,000 | Strikes 4 characters off that the password doesn't use anywhere |
| First Light | ₦1,500 | Locks in the opening character, case and all |
| Last Light | ₦2,000 | Locks in the closing character, case and all |
| Case Map | ₦2,500 | Counts the uppercase, lowercase, digits and symbols — without positions |
| Spotlight | ₦3,500 | Lights up one position not yet pinned down |
| X-Ray | ₦10,000 | Every character the password is built from, without saying where any go |

Nothing is revealed at checkout. The order is created `pending` and the effect
only fires once Paystack confirms the money, so a cancelled payment reveals
nothing. The note a purchase produces is stored on the order, which means
re-verifying a reference replays the same answer rather than re-rolling a
random Sweep.

### Availability never leaks the password

A greyed-out power-up must not become a free hint, so every availability rule
is decided from public facts — the password's length and what the player has
already bought — and never from the password.

Sweep is the interesting one. A password of length *L* uses at most *L*
distinct characters, so at least `74 − L` of the alphabet is guaranteed absent.
Until Length Lock has been bought there is no known *L*, so the most permissive
bound is used and the button's state still says nothing.

---

## Money

Everything is stored in kobo. The split is 70/30 in the contributor's favour on
everything that has a contributor attached.

### Funding

What a contributor pays in **is** the reward. 70% of it is what a player is chasing;
Spendbox keeps 30% for running the box. It is collected in full up front, so a
winner is never waiting on a contributor to be good for it.

The floor rises with the password's length, because a longer password is a
harder box and a harder box has to be worth attacking:

| Characters | Minimum funding | Reward at the floor |
| --- | --- | --- |
| 3 | ₦10,000 | ₦7,000 |
| 4 | ₦60,000 | ₦42,000 |
| 5 | ₦160,000 | ₦112,000 |
| 6 | ₦410,000 | ₦287,000 |
| 7 | ₦910,000 | ₦637,000 |
| 8 | ₦1,410,000 | ₦987,000 |
| … | +₦500,000 each | |
| 25 | ₦9,910,000 | ₦6,937,000 |
| 26 | ₦10,000,000 | ₦7,000,000 |

The steps are ₦50,000, then ₦100,000, ₦250,000, ₦500,000, settling at
₦500,000 a character. The schedule is built so the 26-character ceiling lands
exactly on **₦10,000,000** — the largest single transfer Paystack will make.


Rounding on the split goes to the platform, so the advertised reward is never a
kobo short of what a winner is actually paid.

### Who gets what

| Stream | Contributor | Spendbox |
| --- | --- | --- |
| Power-up bought against a contributor's box | 70% | 30% |
| Power-up bought against the public box | — | 100% |
| Funding a contributor's box | becomes the reward (70%) | 30% |
| Lives | — | 100% |

Lives aren't attached to any box, so there is nobody to share them with.

A contributor's share is real money rather than a line in a report: their bank
account is registered with Paystack as a **subaccount**, and every power-up
sale is charged against it. Paystack splits at settlement, so their share never
sits in a Spendbox balance waiting for someone to move it, and nobody here
moves it by hand.

The one exception is a **reward**, which can't ride a subaccount — the winner is
a stranger with no account here until the moment they win. So a cracked box
opens a claim, the winner supplies a bank account (checked against the bank
before it's stored, so a mistyped digit is caught while it's still a form), and
an admin sends the transfer from `/admin`.

### A box is finished when it opens

An unlocked box can never be played again. If two players submit the winning
guess in the same instant, a conditional update decides it: exactly one is the
winner, and the other is told they were pipped rather than being promised a
money twice.

---

## Surfaces

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | The lobby: the public box, every funded box, and the safes already opened |
| `/b/[slug]` | anyone | A box, played. Server-rendered with the run already in it, because a shared link is how nearly everyone arrives |
| `/me` | a verified player | Lives, attempts, and where a reward has got to. Not an account — there's no password here |
| `/signup` | a contributor | Email-first: known address asks for a password, new address emails a code |
| `/dashboard` | a contributor | Boxes, Build, Attempts, Money |
| `/admin` | the platform | The public box, rewards to send, and where the revenue came from |

A player never signs up. They verify an address once — because a reward has to
be sent somewhere — and a signed cookie remembers them for six months.

### The contributor dashboard

Four tabs and no more. **Boxes** is what's up and what each has earned, with a
share button that uses the native share sheet where there is one (on a phone
that means WhatsApp, not a clipboard). **Build** is two decisions — the
password and the reward — with the difficulty, the attempt estimate and our
cut all updating as you type, so nothing is a surprise at checkout. **Attempts** is who
has been having a go, addresses starred out before they leave the server.
**Money** is power-up income, the split written out in full, the winners, and
the bank account it all settles to.

---

## Security model

- **`boxes.secret` is service-role only.** No RLS policy anywhere grants a
  select on `boxes` — not to anon, not to a signed-in user, not to the
  contributor who wrote the password. The play surface only ever talks to route
  handlers.
- **Players have no table access at all.** Identity is a signed HMAC cookie
  carrying the address and an expiry, minted after a 6-digit code. Nothing
  about the player is stored client-side that the server would have to trust.
- **Contributors read only their own rows** — their profile and their own
  power-up income. Every write goes through a route handler using the service
  role.
- **The privileged functions are unreachable from a browser.** `start_run`,
  `claim_box`, `credit_lives`, `ensure_player`, `sync_lives` and
  `auth_user_id_by_email` all run `security definer`, so `EXECUTE` is revoked
  from `public` as well as `anon` and `authenticated` — Postgres grants
  `EXECUTE` to `PUBLIC` by default and the API roles inherit it, so naming only
  those two would leave `/rpc/credit_lives` wide open.
- **Concurrency is decided in the database.** One active run per player per box
  (partial unique index), one guess per ordinal (unique constraint — two racing
  submissions claim the same ordinal and exactly one wins), one winner per box
  (conditional update), one live public box (partial unique index).
- **Payment settlement is idempotent.** The webhook and the browser's return
  trip both settle; whichever arrives first does the work, and each order flips
  status with a conditional update that everything downstream hangs off.
- **Emails are masked before they leave the server**, never in the browser.
  Around 70% is starred out and the runs of stars are a fixed width, so the
  mask leaks neither the characters nor how many there were.

---

## Stack

Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, Supabase (Postgres +
Auth), Paystack, Resend.

Session refresh runs in `src/proxy.ts` — Next 16 renamed `middleware` to
`proxy`, and it is matched only on `/dashboard` and `/api/contributor`, since a
player has no Supabase session to refresh.

### Project layout

```
src/lib/constants.ts        the alphabet, lengths, life economy
src/lib/game/feedback.ts    scoring a guess (pure, server-only)
src/lib/game/rewards.ts     the funding ladder and the 70/30 split
src/lib/game/difficulty.ts  attempts-to-crack, tiers, brute-force cost
src/lib/game/power-ups.ts   the catalogue, availability, and effects
src/lib/game/boxes.ts       reading boxes without reading passwords
src/lib/game/view.ts        assembling what the play screen sees
src/lib/game/settle.ts      turning a confirmed payment into the thing it bought
src/app/api/boxes/…         play: the box, the run, the guess, the power-up
src/app/api/player/…        lives, verification, history, reward claims
src/app/api/contributor/…   profile, boxes, funding, attempts, earnings, payout
src/app/api/admin/…         the public box, reward claims, revenue
supabase/migrations/        append-only; 0024 rebuilt it, 0025 made it hard
```

---

## Setup

1. **Create a Supabase project**, then apply migrations:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push          # applies supabase/migrations/*
   ```

   Local stack instead: `npx supabase start && npx supabase db reset`. That also
   runs `supabase/seed.sql`, which creates a contributor
   (`seed@example.com` / `password123`), the public box `/b/the-opening-night`
   (password `oPen`) and a funded box `/b/adas-safe` (password `Na1ra!`).
   Case matters, so those are exact.

2. **Configure env** — copy `.env.example` to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — required.
   - `RESEND_API_KEY` + `EMAIL_FROM` — real emails (otherwise logged to the
     console, which is enough to play locally).
   - `PAYSTACK_SECRET_KEY` — enables funding, power-ups and buying lives. Without
     it the game still works; only the paid parts are switched off.
   - `ADMIN_EMAIL` + `ADMIN_PASSWORD` (and/or `ADMIN_EMAILS`) — access `/admin`.
   - `PLAYER_SESSION_SECRET` — signs the player cookie. Falls back to the
     service-role key.
   - `APP_URL` — canonical URL for Paystack callbacks behind a proxy.

3. **Run**:

   ```bash
   npm install
   npm run dev
   ```

Point Paystack's webhook at `https://your-domain/api/paystack/webhook`.

---

## Testing the rules

**The TypeScript half** — the funding ladder, the split, the difficulty model,
power-up effects and availability — is checked by transpiling `src/lib/game/*`
and asserting against hand-worked cases: that the ladder is monotonic and lands
on ₦10,000,000 at 26 characters, that a split always reconciles to the funding,
that Sweep only ever strikes characters the password doesn't use, that a
greyed-out power-up is never decided by the password.

**A solver** plays the game. It implements the only strategy the feedback
permits — binary-search the length, then walk the positions — against the real
scoring rule, and reports the median attempts per length over 15 random
passwords. It cracks 40/40, lands within ~10% of the estimate the UI shows, and
puts every length inside the intended 50–5000 band.

**The SQL half** runs against a scratch Postgres with stand-ins for the
Supabase-managed `auth` and `storage` schemas, including the `protect_delete`
trigger. Applying every migration in order proves the chain still builds from
nothing; then the checks cover scoring (positional only, case-sensitive,
mismatched lengths, empty guesses, repeated characters), the life economy
(whole-hour accrual, polling not resetting the clock, bought lives exceeding
the cap), the attempt lifecycle (a life per guess, refused guesses costing
nothing, a win closing the box and opening the claim, wrong case *not* winning),
raising a reward (never down, never level, the split still reconciling), and the
constraints. A separate pass sets `role` to `anon` and `authenticated` and
asserts that neither can read a password or call a privileged function.

---

## Not in this version (deliberately)

- **No leaderboards.** A box has one winner and then it's over.
- **No streaks, no daily bonus, no referral loops.** Lives refill on a clock
  and that's the whole retention model.
- **No automated reward transfers.** A winner's bank details are checked with
  the bank, but the transfer itself is a human pressing a button in `/admin`.
- **No cap on attempts.** Play as fast as you can afford to.
- **No editing a funded box.** A draft is yours to change or throw away. The
  moment money goes behind it the password is fixed for good, the box can never
  be deleted, and the reward can only be raised — never lowered.
- **No password recovery for a box.** Nobody at Spendbox can read a box's
  password back to its author, which is the same property that makes the game
  worth playing.
