# Spendbox

**Guess the password. Open the safe.**

A spendbox is a password with money behind it. Players get a colour-coded
verdict on every guess — green for the right character in the right place,
orange for the right character somewhere else, red for a character that isn't
in there at all — and if they work it out, the money is theirs.

Playing is free. Nobody has to pay to guess, ever.

---

## The two kinds of box

There is one game. It comes in two versions, and the only difference is whose
money is behind the prize.

**The public box** is authored by the platform in `/admin` and funded by the
platform. Free, no stake, no split. Exactly one is playable at a time — a
unique partial index enforces it — because the public game is *the* public
game, not a catalogue of them.

**A contributor box** is anyone else's. A contributor writes a password, stakes
money on it, and shares the link. There is no business here: no trading name,
no logo, no category, no verification. A contributor is a person who put money
behind a password and wants people to attack it.

---

## Guessing

A password is 3 to 26 characters, drawn from the 26 letters plus ten specials
(`! @ # $ % & * ? + =`) — 36 in all. Uppercase only: a password is a pattern,
not a word, and asking players to guess the case too would double the search
space for no extra fun.

Feedback follows Wordle's two-pass rule, and the second pass matters. Oranges
are budgeted against the copies of a character left over after the greens are
taken, so `AAB` against `ABC` scores `g r o`, not `g o o` — there is only one
`A` in the password and the first position already claimed it. Without that
budget a player could count duplicates for free, which turns a long password
into a much shorter one.

A run gets `length + 6` guesses, floored at 9 and capped at 20. The cap is what
stops a 26-character box being a formality; past that point the difference is
made up with power-ups, which is the point.

The password is read in one route handler, compared there, and dropped there.
What leaves the server is a string of `g`/`o`/`r` and nothing else.

---

## Lives

A player holds **15 lives**, and **one comes back every hour**. They are held
by the *player*, not by a box: one pool spent across the public box and every
contributor box alike. Fail on the free public box and you have one fewer life
for everyone else's.

Mechanically the life comes off when a run opens and is handed back on a win.
That is the same thing as "failing costs a life", but it cannot be farmed by
opening runs and walking away from them. Two other cases hand the life back
too: being pipped by a fraction of a second, and being mid-attempt when
somebody else cracks the box. Neither is a failure.

The refill clock advances by *whole hours* rather than resetting to now, so a
player who checks back after 90 minutes banks one life and keeps the spare 30
minutes towards the next. Otherwise frequent polling would quietly reset the
timer forever.

Lives can also be bought at **₦150 each**, up to 100 at a time. Nobody has to
— the pool refills whether or not anyone pays, and the buy dialog says so
before it says anything else.

---

## Power-ups

The only thing a player ever pays for, and the only way a contributor makes
money back.

| Power-up | Price | What it does |
| --- | --- | --- |
| Sweep | ₦500 | Strikes 2 characters off the keyboard that the password definitely doesn't use (5% of the alphabet, rounded up) |
| Second Wind | ₦1,000 | Three more guesses on this attempt, up to three times |
| First Light | ₦1,500 | Locks in the opening character |
| Last Light | ₦2,000 | Locks in the closing character |
| Spotlight | ₦3,500 | Lights up one position not yet pinned down |
| X-Ray | ₦10,000 | Every character the password is built from, without saying where any of them go |

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
distinct characters, so at least `36 − L` of the alphabet is guaranteed absent.
While fewer than that have been struck off, there is *certainly* something left
to strike, and the button is offered on that bound alone.

---

## Money

Everything is stored in kobo. The split is 70/30 in the contributor's favour on
everything that has a contributor attached.

### Stakes

A contributor's stake **is** the prize. 70% of it is what a player is chasing;
Spendbox keeps 30% for running the box. It is collected in full up front, so a
winner is never waiting on a contributor to be good for it.

The floor rises with the password's length, because a longer password is a
harder box and a harder box has to be worth attacking:

| Characters | Minimum stake | Prize at the floor |
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
A contributor may always stake *more* than the floor for a bigger prize, never
more than the cap.

Rounding on the split goes to the platform, so the advertised prize is never a
kobo short of what a winner is actually paid.

### Who gets what

| Stream | Contributor | Spendbox |
| --- | --- | --- |
| Power-up bought against a contributor's box | 70% | 30% |
| Power-up bought against the public box | — | 100% |
| Stake on a contributor's box | becomes the prize (70%) | 30% |
| Lives | — | 100% |

Lives aren't attached to any box, so there is nobody to share them with.

A contributor's share is real money rather than a line in a report: their bank
account is registered with Paystack as a **subaccount**, and every power-up
sale is charged against it. Paystack splits at settlement, so their share never
sits in a Spendbox balance waiting for someone to move it, and nobody here
moves it by hand.

The one exception is a **prize**, which can't ride a subaccount — the winner is
a stranger with no account here until the moment they win. So a cracked box
opens a claim, the winner supplies a bank account (checked against the bank
before it's stored, so a mistyped digit is caught while it's still a form), and
an admin sends the transfer from `/admin`.

### A box is finished when it opens

An unlocked box can never be played again. If two players submit the winning
guess in the same instant, a conditional update decides it: exactly one is the
winner, and the other is told they were pipped rather than being promised a
prize twice.

---

## Surfaces

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | The lobby: the public box, every staked box, and the safes already opened |
| `/b/[slug]` | anyone | A box, played. Server-rendered with the run already in it, because a shared link is how nearly everyone arrives |
| `/me` | a verified player | Lives, attempts, and where a prize has got to. Not an account — there's no password here |
| `/signup` | a contributor | Email-first: known address asks for a password, new address emails a code |
| `/dashboard` | a contributor | Boxes, Build, Attempts, Money |
| `/admin` | the platform | The public box, prizes to send, and where the revenue came from |

A player never signs up. They verify an address once — because a prize has to
be sent somewhere — and a signed cookie remembers them for six months.

### The contributor dashboard

Four tabs and no more. **Boxes** is what's up and what each has earned, with a
share button that uses the native share sheet where there is one (on a phone
that means WhatsApp, not a clipboard). **Build** is two decisions — the
password and the stake — with the prize, the guess budget and our cut all
updating as you type, so nothing is a surprise at checkout. **Attempts** is who
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
src/lib/game/stakes.ts      the stake ladder and the 70/30 split
src/lib/game/power-ups.ts   the catalogue, availability, and effects
src/lib/game/boxes.ts       reading boxes without reading passwords
src/lib/game/view.ts        assembling what the play screen sees
src/lib/game/settle.ts      turning a confirmed payment into the thing it bought
src/app/api/boxes/…         play: the box, the run, the guess, the power-up
src/app/api/player/…        lives, verification, history, prizes
src/app/api/contributor/…   profile, boxes, funding, attempts, earnings, payout
src/app/api/admin/…         the public box, prize claims, revenue
supabase/migrations/        append-only; 0024 is the rebuild
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
   (password `OPEN`) and a staked box `/b/adas-safe` (password `NAIRA!`).

2. **Configure env** — copy `.env.example` to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — required.
   - `RESEND_API_KEY` + `EMAIL_FROM` — real emails (otherwise logged to the
     console, which is enough to play locally).
   - `PAYSTACK_SECRET_KEY` — enables stakes, power-ups and buying lives. Without
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

The game rules are small and pure on purpose, and both halves are checkable
without a browser.

**The TypeScript half** — scoring, the stake ladder, the split, power-up
effects and availability — is exercised by transpiling
`src/lib/game/*` and asserting against hand-worked cases: that `AAB` against
`ABC` scores `gro`, that the ladder is monotonic and lands on ₦10,000,000 at 26
characters, that a split always reconciles to the stake, that Sweep only ever
strikes characters the password doesn't use.

**The SQL half** runs against a scratch Postgres with a small stand-in for the
Supabase-managed `auth` and `storage` schemas. Applying all migrations in order
proves the chain still builds from nothing; then the checks cover the life
economy (whole-hour accrual, polling not resetting the clock, bought lives
exceeding the cap), the run lifecycle (a life spent, a resume not charging
twice, a win refunding, a bystander refunded when the box falls), the races
(first solver wins, second is pipped and keeps their life, one claim only), and
the constraints. A separate pass sets `role` to `anon` and `authenticated` and
asserts that neither can read a password or call a privileged function.

---

## Not in this version (deliberately)

- **No leaderboards.** A box has one winner and then it's over.
- **No streaks, no daily bonus, no referral loops.** Lives refill on a clock
  and that's the whole retention model.
- **No automated prize transfers.** A winner's bank details are checked with
  the bank, but the transfer itself is a human pressing a button in `/admin`.
- **No editing a live box.** The password is fixed the moment money goes behind
  it. A contributor who wants a different one builds a different box.
- **No password recovery for a box.** Nobody at Spendbox can read a box's
  password back to its author, which is the same property that makes the game
  worth playing.
