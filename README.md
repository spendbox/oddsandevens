# Spendbox

**Drop a box. Share the link. Somebody beats it, and you both get paid.**

A box holds ₦100,000. Making one is free. Anyone with the link can try to beat
it, and each try costs the player one coin. Beating a box means clearing ten
patterns in a row against a clock that never gets kinder. Whoever does it first
takes ₦100,000 — and the person who made the box takes ₦100,000 too.

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

**One free replay per game.** Miss a level and you can take it again — new
pattern, same level, no charge. Miss again and the game is over; the next go
costs another coin.

## The money

| | |
|---|---|
| Making a box | Free |
| One coin | ₦100 |
| Smallest top-up | 5 coins (₦500) |
| One game | 1 coin |
| Beating a box | ₦100,000 to the winner, ₦100,000 to the creator |

Coins are bought through Paystack. Winnings are paid out **by hand**, by bank
transfer, from the Paystack dashboard — there is no key on this server that can
move money out on its own. `/admin/payouts` is the worklist for whoever does it.

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
  paid. It cannot even change its own coin balance: a trigger on `profiles`
  refuses that for anyone but the server.
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
```

**2. Turn off email confirmation.** Authentication → Sign In / Providers →
Email → uncheck **Confirm email**. Signing up is meant to be an email, a
password, and you are in. Leave it on and new players get stuck waiting for a
link.

**3. Environment variables.** Copy `.env.example` and fill it in. All five go
into Vercel under Settings → Environment Variables:

| | |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, the "anon" key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, the "service_role" key — **required** |
| `PAYSTACK_SECRET_KEY` | Paystack → Settings → API Keys |
| `ADMIN_EMAILS` | who can see `/admin/payouts`, comma-separated |

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
src/lib/wallet.ts      turning a Paystack payment into coins, exactly once
src/lib/money.ts       every price in the product, in one file
src/components/grid.tsx  the nine tiles
supabase/migrations/   the schema, the policies, and the three atomic functions
```

If the game turns out too hard or too easy, `answerMsFor` in `src/lib/game.ts`
is the number to change. The whole curve moves with it.

## A note on what this is

Spendbox is a game of skill played for money. Coins are non-refundable once
spent, and a box can only ever be won once. Both screens say so.
