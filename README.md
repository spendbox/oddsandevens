# Spendbox

Branded-games platform for SMEs (built for Nigerian cloud kitchens first). A
business builds a game — a spin-to-win wheel, a scratch card, a quiz, an arcade
high-score chase — brands it, and shares one link per game. Winning mints a
one-time redemption code the customer shows at the counter; not winning earns a
loyalty point, and points trade for a discount at a per-merchant rate (default
**3 points → 2%**, expiring on a rolling 7-day window).

Customers can review everything they've earned across every business at
**`/me`** — an email-only portal (there are no customer accounts).

## Branded games

Every game a business can launch is one entry in `src/lib/games/catalog.ts`.
That entry declares the game's award engine, its defaults, and its setup form,
so the dashboard builder, the API validation, and the player page are all
generated from it — adding a twenty-first game means one catalogue entry plus
one component in `src/components/games/`.

| Category | Games |
|----------|-------|
| **Instant win** | Wheel of Fortune · Digital Scratch Card · Mystery Gift / Pick-a-Box · Interactive Advent Calendar |
| **Arcade & skill** | Endless Runner · Falling Objects / Catcher · Slice / Ninja Chop · Tile Merge · Memory Card Match · Whack-a-Mole · Flappy Flyer · Jigsaw / Photo Puzzle · Spot the Difference · Tic-Tac-Toe |
| **Quiz & discover** | Product Recommender Quiz · Myth vs. Fact Trivia · Live Leaderboard Trivia · Virtual Lookbook / Room Builder |
| **Community** | Digital Scavenger Hunt · Bracket / Knockout Poll |

### The two award engines

Twenty games, two ways of deciding a winner — both settled entirely in Postgres:

1. **`chance`** (wheel, scratch card, mystery box, advent calendar). The server
   runs a weighted draw over the game's segments. Real prizes only enter the
   pool while they have stock; losing segments ("blanks") are always in it. The
   response tells the client *which segment* it landed on, so the wheel animates
   to a result it did not choose. **The odds never reach the browser.**
2. **`score`** (everything else). The player plays, the client submits a score,
   and the server awards the best prize whose `min_score` that score clears.
   Scores are clamped to the game's `max_score`, so a forged submission can
   never beat the honest ceiling.

### The play lifecycle

```
POST /api/play/[slug]/games/[game]/start    → checks cooldown + allowance,
                                              returns a single-use token
   … the player plays; the game component only reports a score …
POST /api/play/[slug]/games/[game]/finish   → grades it, charges one play,
                                              mints the code, returns the result
```

A round can only be graded through a token issued by `start`, each token grades
exactly once, and a token left open for six hours is refused. The allowance is
charged at `finish`, so an abandoned game costs the business nothing.

A play that doesn't win still earns a loyalty point, and points trade for a
discount code through the same staff redemption flow.

### Sharing

- `/p/<business>` — the hub: every game the business has live
- `/p/<business>/<game>` — one game, brandable per game (accent colour, hero)

### Game tier limits

| Tier | Live games | Prizes / game |
|------|------------|---------------|
| free | 2 | 2 |
| premium | unlimited | 10 |

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
2. On `/dashboard`: create your business profile (name + link slug), then add a
   reward under **Build → Rewards**.
3. **Build → Games → New game**. Pick *Wheel of Fortune*, keep the defaults, and
   play it in the live preview beside the form — that preview runs the real
   game against the settings you are editing, with the draw simulated locally.
   Press *Create* to get the share link.
4. Open `/p/<slug>/<game>` in an incognito window, verify an email, and spin. A
   win emails a redemption code; a loss earns a loyalty point. Spin again to hit
   the per-game cooldown, and open `/p/<slug>` for the hub of every live game.
5. Back on the dashboard, type the code into **Redeem a customer code** — it
   redeems once, then rejects with "already redeemed". Visit `/me` with the same
   email to see codes and points across every business.
6. To test premium without paying: `update merchants set subscription_tier =
   'premium', premium_expires_at = now() + interval '1 year';` in the SQL
   editor, reload the dashboard, and you can run unlimited games with up to 10
   prizes each. With `PAYSTACK_SECRET_KEY` set, the Plans tab instead offers a
   real (test-mode) checkout.

### SQL-level branded-game tests

The game engine is testable without the app. Against a seeded stack:

```sql
-- Build a wheel: one prize with 2 in stock, three losing segments (25% win rate)
select create_game(
  (select id from merchants where slug = 'mama-put-kitchen'),
  'spin-wheel', 'chance', 'Spin to Win', 'spin-to-win', null,
  '{}'::jsonb, '{}'::jsonb,
  '[{"kind":"prize","description":"Free coffee","stock":2,"weight":100},
    {"kind":"blank","description":"Not this time","weight":100},
    {"kind":"blank","description":"So close","weight":100},
    {"kind":"blank","description":"Try tomorrow","weight":100}]'::jsonb,
  0, 5, 1);

-- Play a round (cooldown 0 above, so this can be looped)
select start_game_play('mama-put-kitchen', 'spin-to-win', 'tester@example.com');
select finish_game_play('<token from above>', 1, '{}'::jsonb);

-- Grading the same token twice must fail with 'play_already_finished',
-- and after 2 wins the prize is exhausted — every later spin is a loss.
select claimed, stock from game_prizes
 where game_id = (select id from games where slug = 'spin-to-win');
```

## Project layout

- `supabase/migrations/*.sql` — schema, RLS, and the atomic game functions.
  `0001`–`0012` build the merchant, customer, loyalty, payments and admin
  foundations; **`0013` is the branded-games platform** (`games`,
  `game_prizes`, `game_plays`, `create_game`, `start_game_play`,
  `finish_game_play`, and the game-aware staff lookup/redeem).
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
- Editing a game's questions or artwork after launch from the dashboard (the
  API supports it; the builder only creates)
- Customer accounts/auth (email-only identity)
- Automatic expiry sweeps (expiry is enforced lazily at redemption)

## The retired tile board

Spendbox began as a single game: a shared 7×7 board of hidden rewards at
`/g/<business>`. It is no longer part of the product — nothing links to it, and
the dashboard has no way to build one — but the route, the API and the
`play_tile` SQL remain in place so that boards already shared on receipts keep
working and codes they issued keep redeeming. New businesses only ever see
games.
