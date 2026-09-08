# Spendbox

**Create your box free. Share it. Earn.**

A box holds ₦100,000. Making one is free and you keep one at a time. Anyone with
the link can try to beat it, and each try costs the player one coin — never the
creator. Beating a box means clearing ten patterns in a row against a clock that
never gets kinder. Whoever does it first takes ₦100,000 — and the person who
made the box takes ₦100,000 too.

---

## The game

A 3×3 grid. Tiles light up one at a time; you tap them back in the same order.

| Level | Flashes | Each flash | Time to answer |
|------:|--------:|-----------:|---------------:|
| 1 | 4 | 620ms | 2s |
| 2 | 5 | 580ms | 2s |
| 3 | 6 | 540ms | 2s |
| 4 | 7 | 500ms | 3s |
| 5 | 8 | 460ms | 3s |
| 6 | 9 | 420ms | 3s |
| 7 | 10 | 380ms | 4s |
| 8 | 11 | 340ms | 4s |
| 9 | 12 | 300ms | 4s |
| 10 | 13 | 260ms | 5s |

Two seconds to start, and another second every three levels. The pattern gets
one flash longer and 40ms faster each level, so the pressure comes from both
ends at once. A perfect run is about 77 seconds of play.

**The clock stops between levels.** It does not start when the level card
appears, and it does not run while the pattern is playing. It starts the instant
the last flash goes out — reading and watching are free, only recalling is
timed.

**Every run generates its own patterns.** Nobody can learn a box by heart, and
no two games are the same.

**One free replay per game, then a coin a go.** Miss a level and you can take
it again — new pattern, same level, no charge. After that, a retry costs one
coin and you keep every level you have already cleared. The run only ends when
the wallet is empty or the player walks away.

**Every box comes with three promo flyers.** Square PNGs a creator can post to
WhatsApp, Instagram or X, drawn in the browser from the box's live details —
which is what makes "they update when you edit the box" true without any
machinery: nothing is stored, so nothing can go stale. On a phone they go
straight into the share sheet as a real file.

**Every box has a free practice run.** `/b/CODE/try` plays the first three
levels for real, with no coin and no prize, so nobody pays a coin to find out
what they are buying. Practice runs entirely in the browser — there is no result
worth cheating for, so there is nothing for a server to referee.

## Getting in

**An email and a password.** That is the whole sign-up — no username to think
of, no confirmation email to wait for. A display name is derived from the
address and can be changed later on the account page, because a name field at
the door is a hurdle between somebody and the box link they just tapped.

Asked in two steps rather than as a tabbed form: the first takes the email, the
app works out whether that is a sign-in or a sign-up, and the second asks for
the right thing.

**Password resets are sent by us, through Resend** — not by Supabase's built-in
mailer, which is rate limited hard enough that resets quietly stop arriving
under real traffic. Spendbox owns the tokens: 32 random bytes in the link, only
a SHA-256 of them in the database, single-use, 45 minutes, three per hour per
account. A leaked backup of that table cannot reset a single password, because
the thing in the email cannot be worked back out of the thing in the row.

Nothing else in the app sends email.

## The money

| | |
|---|---|
| Making a box | Free |
| One coin | ₦100 |
| Smallest top-up | 5 coins (₦500) |
| One game | 1 coin |
| Retrying a level, after the free replay | 1 coin |
| Beating a box | ₦100,000 to the winner, ₦100,000 to the creator |

Coins are bought through Paystack. Winnings are paid out **by hand, by bank
transfer, within one week**, from the Paystack dashboard — there is no key on this server that can
move money out on its own. `/admin` is the dashboard and `/admin/payouts` is the
worklist for whoever sends the transfers.

**Bank accounts are verified before they are saved.** The player picks their bank
and types their number; the account name comes back from Paystack's name enquiry
against NIBSS — the bank's own answer to "who owns this number?" — and that is
what gets stored, never what the player typed. A mistyped digit fails loudly at
that point rather than six weeks later when ₦100,000 has gone to a stranger.

## Where the rules are enforced

The browser is trusted with nothing. It says which game it is playing and which
tiles were tapped, and that is all. Everything else — what the pattern was, when
the clock started, whether the answer arrived in time, whether a replay is
available, who beat the box — is decided on the server against rows a browser
cannot write.

Concretely:

- **Row level security is on for every table**, and there is no insert or update
  policy for attempts, payouts, top-ups or the ledger. A browser holding the
  anon key cannot create a game, award itself a payout, or mark its own winnings
  paid.
- **A trigger on `profiles` guards every column the server owns**: the coin
  balance, whether a password is set, and all four bank fields including
  `account_verified_at`. That last one is the sharpest: the payout queue treats
  it as proof Paystack confirmed the account, so a player who could set it
  themselves could send ₦100,000 anywhere they liked. The only field on that
  table a person can edit is their own display name.
- **Three things happen inside one database transaction**, because doing them
  twice costs somebody something: crediting a payment, taking a coin and opening
  a game, and deciding who won. They live in `supabase/migrations/0003_functions.sql`
  and only the service role may call them.
- **A box is won exactly once.** The claim is an update that only matches while
  `winner_id is null`, so two players finishing in the same millisecond cannot
  both be first.
- **A payment is credited exactly once.** Paystack is asked directly — the
  browser coming back from checkout is only a hint that it is worth asking — and
  the top-up row flips `pending → success` in one conditional update that only
  one caller can win. The webhook and the browser callback race constantly; that
  is fine.
- **Patterns are issued one level at a time.** Sending all ten up front would
  hand a player the rest of the game the moment they started it. Reloading
  mid-level returns *the same* pattern with the time that is actually left, so a
  refresh costs seconds rather than buying a re-roll.

The one thing the server cannot hide is the pattern for the level in play: to
show it to somebody, it has to be sent to them. A determined player reading
their own network traffic can see it. Every other defence still holds — the
clock, the level, the replay count and the win are all the server's to decide.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS v4, configured in `src/app/globals.css` — no config file
- Supabase (Postgres + Auth), deployed on Vercel
- Paystack for coin purchases

No webfont: the app uses the device's own interface font. On mobile data, a font
download is the difference between "instant" and "is it broken?".

## Setting it up

**1. The database.** In Supabase → SQL Editor, run these four files in order:

```
supabase/reset.sql              wipes the old project clean
supabase/migrations/0001_schema.sql
supabase/migrations/0002_policies.sql
supabase/migrations/0003_functions.sql
supabase/migrations/0004_guests_and_banks.sql
supabase/migrations/0005_password_resets.sql
supabase/migrations/0006_retries_and_box_art.sql
```

0006 also creates a public `box-images` storage bucket. If your Supabase project
blocks writes to `storage.buckets` from the SQL editor, make it by hand under
Storage → New bucket, named `box-images`, public.

**2. Turn off email confirmation.** Authentication → Sign In / Providers →
Email → uncheck **Confirm email**. Entering is meant to be an email and nothing
else. Leave it on and new players get stuck waiting for a link.

You do **not** need to configure SMTP in Supabase. Spendbox never uses its
mailer — see step 3.

**3. Environment variables.** Copy `.env.example` and fill it in. All five go
into Vercel under Settings → Environment Variables:

| | |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, the "anon" key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, the "service_role" key — **required** |
| `PAYSTACK_SECRET_KEY` | Paystack → Settings → API Keys |
| `RESEND_API_KEY` | resend.com → API Keys. All email goes through it |
| `EMAIL_FROM` | e.g. `Spendbox <hello@yourdomain.com>` |
| `ADMIN_EMAILS` | who can open `/admin`. Defaults to `spendbox@gmail.com` |

`EMAIL_FROM` must be on a domain **verified in Resend**. Their onboarding sender
works without a domain but only delivers to your own address — which looks fine
in testing and reaches nobody in production.

**`/admin` is a 404 until `ADMIN_EMAILS` includes you.** That is deliberate: an
unset variable must not open a door. But if the list is empty *entirely*, the
page says so and prints the exact line to add, rather than pretending not to
exist. So if you cannot get in, open `/admin` while signed in and it will tell
you what to set. Remember to redeploy — Vercel reads these at build time.

`SUPABASE_SERVICE_ROLE_KEY` is not optional here. Every coin spent and every
answer judged goes through it. Never give it a `NEXT_PUBLIC_` prefix.

**4. The Paystack webhook.** Paystack → Settings → API Keys & Webhooks → set the
webhook URL to `https://your-domain/api/paystack/webhook`. Without it, a player
who closes the tab mid-payment has paid and has no coins.

**5. Deploy.** Push to Vercel. Environment variables are read at build time, so
redeploy after changing any of them.

## Where things are

```
src/lib/game.ts        the difficulty curve and the pattern generator
src/lib/play.ts        the referee: issues levels, judges answers, crowns winners
src/lib/guest.ts       getting somebody in on an email alone, and where that stops
src/lib/wallet.ts      turning a Paystack payment into coins, exactly once
src/lib/money.ts       every price in the product, in one file
src/components/grid.tsx        the nine tiles
src/components/practice-game.tsx  the free example run
src/components/mascot.tsx      Boxy, in five moods
src/components/tile-reel.tsx   the grid playing itself, on every box page
src/lib/flyers.ts              the three promo flyers, drawn on a canvas
src/components/card-deck.tsx   the swipeable card rail
supabase/migrations/   the schema, the policies, and the three atomic functions
```

If the game turns out too hard or too easy, `answerMsFor` in `src/lib/game.ts`
is the number to change. The whole curve moves with it.

## A note on what this is

Spendbox is a game of skill played for money. Coins are non-refundable once
spent, and a box can only ever be won once. Both screens say so.
