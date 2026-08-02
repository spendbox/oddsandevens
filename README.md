# Spendbox

Branded-games platform for SMEs (built for Nigerian cloud kitchens first). A
business builds a game — an arcade high-score chase, a timed quiz — brands it,
and shares one link. Players compete on a public leaderboard all week; when the
week closes the top places take the prizes and their one-time redemption codes
arrive by email, to be shown at the counter. Then the board resets and it starts
again.

Players get three lives a day — one pool shared across every game that business
runs — and can earn more by sharing their own link with someone who plays.

Customers can review everything they've earned across every business at
**`/me`** — an email-only portal (there are no customer accounts).

## Tell us about the business, get games back

A business answers a short, mostly-tappable questionnaire — trade, top sellers,
what they could give away, what they want out of it — and we write them a set of
finished games. Those land as **drafts**: fully configured, playable in a
preview, editable, and invisible to customers until published.

- `src/lib/business/profile.ts` — the knowledge base: the questions, an industry
  pack per trade (artwork, sample products, myth-vs-fact statements), and the
  completeness scoring behind the progress bar.
- `src/lib/games/suggest.ts` — turns those answers into finished blueprints:
  titles built from the business name, quiz outcomes built from their menu,
  arcade items built from their trade, prizes built from their offers.
- `POST /api/merchant/games/suggest` — writes the blueprints as drafts.
  Idempotent by game type, so answering more questions later tops up what's
  missing rather than duplicating what's there.

Creating a game by hand is **two steps**: pick one (from the games written for
you, or the full catalogue), then confirm the prize and publish. Everything else
is pre-filled, and questions, artwork and wording are edited afterwards from the
game's own editor.

### Draft, live, paused

`games.status` is one of `draft`, `active`, `paused`, `archived`. The per-tier
cap counts only `active` games, and **every** transition into `active` goes
through `publish_game` — so drafts and paused games are free to hold, pausing
genuinely frees a slot, and resuming can't sneak past the cap.

## Branded games

Every game a business can launch is one entry in `src/lib/games/catalog.ts`.
That entry declares the game's award engine, its defaults, and its setup form,
so the dashboard builder, the API validation, and the player page are all
generated from it — adding a twenty-first game means one catalogue entry plus
one component in `src/components/games/`.

Only games that can carry a leaderboard are offered (`competitive: true` in the
catalogue). The rest stay in the codebase so anything already published keeps
working, but they can't be created.

| Category | Games |
|----------|-------|
| **Arcade & skill** | Endless Runner · Falling Objects / Catcher · Slice / Ninja Chop · Tile Merge · Memory Card Match · Whack-a-Mole · Flappy Flyer · Jigsaw / Photo Puzzle · Spot the Difference |
| **Quiz & knowledge** | Live Leaderboard Trivia · Myth vs. Fact Trivia |
| *Retired (still runs, can't be created)* | Wheel of Fortune · Scratch Card · Pick-a-Box · Advent Calendar · Product Recommender · Lookbook · Scavenger Hunt · Bracket Poll · Tic-Tac-Toe |

Artwork is chosen from a curated emoji picker (`src/lib/games/emoji.ts`) rather
than typed: emoji are awkward to type, easy to paste wrong, and impossible to
validate as free text. Anything not in the picker is dropped by the sanitiser.

### Every game is a weekly competition

A game runs a **season** — a week by default. Players compete on a public
leaderboard; when the week closes, the prizes go to the top places by rank, the
codes are emailed to the winners, and a fresh empty board opens.

- **Seasons** (`game_seasons`) close lazily: any read of the play page calls
  `close_due_game_season`, which ranks the board, mints the winners' codes,
  records them in `game_season_winners`, and opens the next week. A unique
  partial index guarantees exactly one open season per game, so a burst of
  simultaneous readers can't double-pay.
- **Ranking** is best score per player, ties broken by whoever got there first
  — the same rule the live board and the payout both use.
- **Prizes carry a rank** (`game_prizes.award_rank`): first row is first place.
- **Emails** are sent by `src/lib/games/season-mail.ts`, which drains the
  winners that `close_due_game_season` left unnotified. Marking happens after
  the send, so a failure retries rather than dropping someone's prize.
- Scores are clamped to the game's `max_score`, so a forged submission can
  never beat the honest ceiling.

The older **instant-win** games (wheel, scratch card, mystery box, advent
calendar) can no longer be created, but everything already published keeps
running: `games.award_mode` is `'instant'` for those and the weighted-draw path
is untouched.

### Lives, and sharing for more

Because the prize is the rank rather than the play, playing often is the point.
Each player gets **3 lives a day per business** (`merchants.daily_lives`), shared
across every game that business runs — a shop with six games hands out three
plays a day, not eighteen, so the boards stay about skill. Every graded round
spends one, from `merchant_lives`.

Out of lives? Share your own link — `/p/<business>/<game>?ref=CODE` — and when
someone plays through it you get an extra life that day, good on any of that
business's games, up to three (`merchants.max_bonus_lives`). The credit is tied
to the invited player *finishing a round*, not to opening the link: a page view
is free to farm, a round costs the visitor their time and the business a play
from its allowance. One life per person invited, ever.

### Players are asked to verify once

Verifying an email sets a signed, HTTP-only cookie that lasts six months
(`src/lib/player-session.ts`). Every play route reads the player's identity from
that cookie rather than from the request body, which is both the memory (no more
codes on every visit) and the proof (a round can't be opened, or a prize
addressed, under someone else's email).

### Question games deal a fresh round every time

A quiz with three authored questions is a quiz you finish once. `myth-fact` and
`leaderboard-trivia` are dealt per round from three sources — what the business
wrote, questions generated from their profile (their products, city, busiest
day), then a bank tagged by trade (`src/lib/games/questions.ts`). Myth-vs-fact
runs until three wrong answers, so the score is how far you got.

### Public boards, private players

The leaderboard is public, so addresses are masked before they leave the server
(`src/lib/mask.ts`): around 70% starred out, with fixed-width runs so the mask
leaks neither the characters nor the length. `ja********@********.com`. The
board marks the reader's own row, so nobody needs to decode anything.

### The play lifecycle

```
POST /api/play/[slug]/games/[game]/start    → checks lives + allowance,
                                              returns a single-use token
   … the player plays; the game component only reports a score …
POST /api/play/[slug]/games/[game]/finish   → grades it, spends a life, charges
                                              one play, puts the score on the board
POST /api/play/[slug]/games/[game]/refer    → credits whoever invited this player
```

A round can only be graded through a token issued by `start`, each token grades
exactly once, and a token left open for six hours is refused. The allowance is
charged at `finish`, so an abandoned game costs the business nothing.

### Sharing

- `/p/<business>` — the hub: every game the business has live
- `/p/<business>/<game>` — one game, brandable per game (accent colour, hero)

### Game tier limits

| Tier | Live games | Prizes / game |
|------|------------|---------------|
| free | 2 | 2 |
| premium | unlimited | 10 |

Drafts don't count — a business can hold as many ready-made games as we write
for them and publish the ones they want.

A **play** is one round a customer finishes. Every merchant gets an annual
allowance by tier (free 100/year, premium 5,000/year — both admin-tunable),
plus top-up plays that never expire and can be bought on either plan. The
allowance is charged when a round is graded, so abandoned games are free.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4) — deploy on Vercel.
  Note: this repo pins a customized Next.js build — read
  `node_modules/next/dist/docs/` before changing framework-level code.
- **Supabase** — Postgres, merchant auth, Row Level Security
- **Resend** — customer code emails + merchant notifications (logs to the
  server console when `RESEND_API_KEY` is unset)
- **Paystack** — yearly premium checkout (initialize + verify). Enabled when
  `PAYSTACK_SECRET_KEY` is set; otherwise the upsell is hidden and tiers can
  still be toggled manually in the DB.
- **Admin console** (`/admin`) — platform operator tools (merchants, the shared
  image library, premium price), gated by environment-variable credentials.

## Security model

1. **Odds and prize logic never reach the browser.** The public game endpoint
   returns the authored config, the prize *labels*, and the leaderboard — never
   a draw weight, and never the stock of anything still winnable. Wins are
   decided in `finish_game_play` behind a single-use token.
2. **Atomic mutations.** Every game mutation is a `SECURITY DEFINER` Postgres
   function using `SELECT ... FOR UPDATE` row locks in a single transaction, so
   a prize can never be over-claimed no matter how many people finish at once.
   A per-IP cooldown (hashed IP, salted via `IP_HASH_SALT`) backs up the
   per-email one.
3. **Redemption by code only.** Staff type the customer's code into the
   dashboard — a two-step flow resolves the code (cycling loyalty code or a
   game prize) and then redeems it. There is deliberately no
   lookup-by-email redemption path, and the dashboard masks stored codes. Once
   redeemed or expired, a code is invalid (expiry is enforced lazily at
   redemption time).
4. **RLS**: merchants can only *read* their own data; every write goes through
   API routes using the service-role key. Anonymous customers have no direct
   table access at all.
5. **Admin auth by env var.** `/admin` accepts either dedicated credentials
   (`ADMIN_EMAIL` + `ADMIN_PASSWORD`, whose hash is the session cookie so
   rotating either invalidates every session) or any Supabase user whose email
   is on `ADMIN_EMAILS`.

## Setup

1. **Create a Supabase project**, then apply migrations:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push          # applies supabase/migrations/*
   ```

   (Local stack instead: `npx supabase start && npx supabase db reset` — this
   also runs `supabase/seed.sql`, which creates a test merchant
   `seed-merchant@example.com` / `password123`.)

2. **Configure env** — copy `.env.example` to `.env.local` and fill in the
   Supabase URL, anon key, and service-role key. Optional keys:
   - `RESEND_API_KEY` + `EMAIL_FROM` — real emails (else logged to console).
   - `PAYSTACK_SECRET_KEY` — enable the premium checkout.
   - `ADMIN_EMAIL` + `ADMIN_PASSWORD` (and/or `ADMIN_EMAILS`) — access `/admin`.
   - `IP_HASH_SALT` — salt for the per-IP play cooldown.

3. **Run**:

   ```bash
   npm install
   npm run dev
   ```

## Deploying to Vercel

1. Import the repo into Vercel (framework auto-detects Next.js).
2. Add environment variables under **Project → Settings → Environment
   Variables** (or `vercel env add`):

   | Variable | Environments | Notes |
   |----------|--------------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Production + Preview + Development | build-time inlined |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production + Preview + Development | build-time inlined |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production + Preview | mark **Sensitive** — server-only |
   | `RESEND_API_KEY` | Production (+ Preview if you want real emails) | optional; logs to console when unset |
   | `EMAIL_FROM` | Production + Preview | verified Resend sender |
   | `APP_URL` | optional on Vercel | canonical URL for links in emails; defaults to `VERCEL_PROJECT_PRODUCTION_URL`, required on other hosts |
   | `PAYSTACK_SECRET_KEY` | Production (+ Preview for test mode) | mark **Sensitive**; enables premium checkout |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Production | mark **Sensitive**; dedicated `/admin` login |
   | `ADMIN_EMAILS` | Production | optional; comma-separated Supabase-user allowlist for `/admin` |
   | `IP_HASH_SALT` | Production + Preview | optional salt for the per-IP play cooldown |

   `NEXT_PUBLIC_*` values are inlined at build time, so set them **before**
   the first deploy and redeploy after changing them. If you want previews
   isolated from production data, create a second (staging) Supabase project
   and scope its values to the Preview environment only.
3. Local dev can reuse the same values with `vercel env pull .env.local`.
4. **Supabase-side URL config** (dashboard → Authentication → URL
   Configuration): set *Site URL* to your production URL and add
   `https://*.vercel.app` preview URLs to *Redirect URLs* if you use email
   confirmation — otherwise merchant signup confirmation links redirect to
   `localhost`.

## Database migrations (CI)

Migrations are **plain SQL** applied with the Supabase CLI — there is no ORM
migration layer (see "Why no Prisma" below).
`.github/workflows/migrate.yml` runs `supabase db push` automatically whenever
a file in `supabase/migrations/` lands on `develop` (or manually via
*workflow_dispatch*). Configure these GitHub Actions secrets once:

- `SUPABASE_ACCESS_TOKEN` — from supabase.com → Account → Access Tokens
- `SUPABASE_PROJECT_REF` — the ref in your project's URL
- `SUPABASE_DB_PASSWORD` — the project's database password

**Why no Prisma:** the core game logic lives in `SECURITY DEFINER` plpgsql
functions with `FOR UPDATE` row locks, plus RLS policies and column-level
grants — all things Prisma's schema DSL can't express, so they'd end up as
raw-SQL escape hatches anyway. One SQL migration chain keeps a single source
of truth; `supabase db push` tracks applied migrations server-side just like
`prisma migrate deploy` would.

## Manual end-to-end test

1. Sign up at `/signup` (confirm email if your project requires it), then log
   in at `/login`.
2. On `/dashboard`: create your business profile (name + link slug), then open
   **Settings → About your business**. Tap a trade, a goal or two, and save —
   the progress bar moves as you tap, and saving writes a handful of games from
   your answers.
3. **Build → Games** now has a *Ready for you* shelf. *Try it* plays a draft in
   a preview (the real game, draw simulated locally, no code issued), *Edit*
   opens the full editor, and *Publish & share* takes it live and copies the
   link. Building one by hand from *New game* takes two steps: pick, then
   confirm the prize.
4. Open `/p/<slug>/<game>` in an incognito window, verify an email, and play. The
   score lands on this week's board; play twice more and you're out of lives —
   on every game this business runs, not just this one.
   Copy your share link, open it in another browser, play a round there — your
   first browser gets a life back.
5. To watch a week close without waiting: `update game_seasons set ends_at =
   now() - interval '1 minute' where status = 'open';` then reload the play
   page. The prizes go to the top places, the winners get their codes by email,
   and a fresh empty board opens.
6. Back on the dashboard, type the code into **Redeem a customer code** — it
   redeems once, then rejects with "already redeemed". Visit `/me` with the same
   email to see codes and points across every business.
7. To test premium without paying: `update merchants set subscription_tier =
   'premium', premium_expires_at = now() + interval '1 year';` in the SQL
   editor, reload the dashboard, and you can run unlimited games with up to 10
   prizes each. With `PAYSTACK_SECRET_KEY` set, the Plans tab instead offers a
   real (test-mode) checkout.

### SQL-level branded-game tests

The game engine is testable without the app. Against a seeded stack:

```sql
-- A weekly competition with a three-place podium
select create_game(
  (select id from merchants where slug = 'mama-put-kitchen'),
  'whack-a-mole', 'score', 'Whack it', 'weekly-game', null,
  '{}'::jsonb, '{}'::jsonb,
  '[{"kind":"prize","description":"Free meal","stock":12,"award_rank":1},
    {"kind":"prize","description":"Free drink","stock":12,"award_rank":2},
    {"kind":"prize","description":"10% off","stock":12,"award_rank":3}]'::jsonb,
  0, 1, 100000, 'active', 'manual', 'leaderboard', 7, 3, 3);

-- Play a round. Three a day across ALL of this business's games; the fourth
-- start returns 'no_lives', whichever game it is on.
select start_game_play('mama-put-kitchen', 'weekly-game', 'tester@example.com');
select finish_game_play('<token from above>', 250, '{}'::jsonb);   -- 'scored'

-- Close the week early and see the prizes go out
update game_seasons set ends_at = now() - interval '1 minute' where status = 'open';
select close_due_game_season((select id from games where slug = 'weekly-game'));
select rank, score, unlocked_reward_id is not null as got_code
  from game_season_winners order by rank;
```

## Project layout

- `supabase/migrations/*.sql` — schema, RLS, and the atomic game functions.
  `0001`–`0012` build the merchant, customer, loyalty, payments and admin
  foundations; **`0013` is the branded-games platform** (`games`,
  `game_prizes`, `game_plays`, `create_game`, `start_game_play`,
  `finish_game_play`, and the game-aware staff lookup/redeem); **`0014` adds the
  business knowledge base** (`merchants.profile`), draft games, and
  `publish_game`; **`0015` turns games into weekly competitions**
  (`game_seasons`, `game_season_winners`, `merchant_lives`, `game_referrals`,
  `close_due_game_season`, rank-based prizes).
- `src/lib/games/catalog.ts` — the game catalogue: one declarative entry per
  game type (engine, defaults, setup-form schema). Shared by the API, the
  dashboard builder, and the player.
- `src/components/games/*` — one component per game type against the shared
  contract in `kit.tsx`, plus the lazy registry in `index.tsx`
- `src/app/p/[slug]` — the public game hub; `src/app/p/[slug]/[game]` — the
  branded player shell (email gate, start/finish, result, leaderboard)
- `src/app/api/play/[slug]/*` — public play endpoints (service role, no auth)
- `src/app/api/customer/summary` — cross-merchant customer portal data
- `src/app/api/merchant/*` — merchant endpoints (session cookie auth)
- `src/app/api/admin/*` — platform admin endpoints (env-var auth)
- `src/app/me` — customer loyalty portal (email-only)
- `src/app/dashboard` — merchant dashboard (RLS reads, API writes); UI split
  into `src/components/dashboard/*`
- `src/app/admin` — platform admin console
- `src/lib/constants.ts` — game constants (mirrored in the SQL functions)

## Not in v1 (deliberately)

- Per-game analytics beyond plays / players / wins / redemptions
- Regenerating a single suggestion (the endpoint tops up missing game types;
  it won't rewrite one you already have)
- Customer accounts/auth (email-only identity)
- Automatic expiry sweeps (expiry is enforced lazily at redemption)

## The retired tile board

Spendbox began as a single game: a shared 7×7 board of hidden rewards at
`/g/<business>`. It is no longer part of the product — nothing links to it, and
the dashboard has no way to build one — but the route, the API and the
`play_tile` SQL remain in place so that boards already shared on receipts keep
working and codes they issued keep redeeming. New businesses only ever see
games.
