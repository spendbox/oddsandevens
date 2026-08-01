# Spendbox

Branded-games platform for SMEs (built for Nigerian cloud kitchens first). A
business builds games — a spin-to-win wheel, a scratch card, a quiz, an arcade
high-score chase — brands them, and shares one link per game. Winning mints a
one-time redemption code the customer shows at the counter.

There are two families of game:

- **[Branded games](#branded-games)** — twenty game types, each created from the
  dashboard in about a minute and shared at `/p/<business>/<game>`.
- **The tile grid** — the original shared 7×7 board at `/g/<business>`,
  described below.

Both mint the same redemption codes, feed the same loyalty points, and are
redeemed through the same staff code box.

## The tile grid

A merchant hides rewards in a tile grid and shares one link (WhatsApp bio/posts).
Customers tap **one tile per cooldown period**:

- **Hit** → reveals a reward, emails the customer a unique 6-character
  redemption code, and starts an expiry countdown (merchant-configurable,
  1–60 days, default 30).
- **Miss** → +1 loyalty point for that merchant and a 10-hour lockout. Points
  expire on a rolling 7-day window (playing again extends the whole balance).
- **Loyalty points** can be traded for a discount code through the same
  redemption flow. The exchange rate is per-merchant (default **3 points → 2%**).

Every grid is a fixed **7×7 board** (49 tiles) and is **shared**: each tile can
be revealed exactly once by anyone, so the grid visibly depletes. When a grid is
fully consumed it rests, then auto-resets with fresh stock after a
merchant-configured cooldown.

Customers can review everything they've earned across every business at
**`/me`** — an email-only portal (v1 has no customer accounts).

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

A play that doesn't win still earns a loyalty point — games feed the same
loyalty economy as the grid.

### Sharing

- `/p/<business>` — the hub: every live game, plus the tile board if they run one
- `/p/<business>/<game>` — one game, brandable per game (accent colour, hero)

### Game tier limits

| Tier | Live games | Prizes / game |
|------|------------|---------------|
| free | 2 | 2 |
| premium | unlimited | 10 |

Plays are billed from the same annual allowance as grid taps (see below).

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
- **Admin console** (`/admin`) — platform operator tools (merchants, shared
  grid images, premium price), gated by environment-variable credentials.

## Security model

0. **Game odds and prize logic never reach the browser.** The public game
   endpoint returns the authored config, the prize *labels*, and the
   leaderboard — never a draw weight, and never the stock of anything still
   winnable. Wins are decided in `finish_game_play` behind a single-use token.
1. **The reward map never reaches the browser.** The public grid endpoint
   (`GET /api/play/[slug]`) returns each active grid's dimensions and
   already-revealed tiles only. Reward positions for unrevealed tiles exist
   solely in Postgres.
2. **Atomic clicks.** All game mutations are `SECURITY DEFINER` Postgres
   functions (`supabase/migrations/0002_functions.sql` and later) using
   `SELECT ... FOR UPDATE` row locks in a single transaction. Spamming the
   click endpoint gets a uniform `tile_taken` error that never leaks whether
   the tile held a reward; a reward's `max_redemptions` can't be over-claimed.
   A per-IP cooldown (hashed IP, salted via `IP_HASH_SALT`) backs up the
   per-email one.
3. **Redemption by code only.** Staff type the customer's code into the
   dashboard — a two-step flow resolves the code (cycling loyalty code, tile
   reward, or game prize) and then redeems it. There is deliberately no
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

## Grid tier limits (hard caps in both API and SQL)

Grid size is a fixed 7×7 on every tier — tiers differ by how much you can run
and how you can theme it. (Game caps are in
[Branded games](#game-tier-limits).)

| Tier | Active grids | Rewards / grid | Grid auto-reset |
|------|--------------|----------------|-----------------|
| free | 1 | 2 | 7 days (fixed) |
| premium | 10 | 10 | 7–365 days (configurable) |

Premium also unlocks theming extras (custom-uploaded tile images and
puzzle-piece tile shapes; logo, colors, and the image library are free on both
tiers) and is billed yearly through Paystack — each payment or renewal adds
365 days.

## Setup

1. **Create a Supabase project**, then apply migrations:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push          # applies supabase/migrations/*
   ```

   (Local stack instead: `npx supabase start && npx supabase db reset` — this
   also runs `supabase/seed.sql`, which creates a test merchant
   `seed-merchant@example.com` / `password123` with board `/g/mama-put-kitchen`.)

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
2. On `/dashboard`: create your business profile (name + link slug), then use
   the grid wizard to add a 7×7 grid with at least one reward.
3. Open the customer link `/g/<slug>` in an incognito window, enter any email,
   and click tiles. A miss earns a point and starts the 10-hour cooldown; a hit
   shows the code (and emails it). Visit `/me` and enter the same email to see
   points and codes across every business.
4. Back on the dashboard, type the code into **Redeem a customer code** — it
   redeems once, then rejects with "already redeemed".
4b. **Games**: on `/dashboard` → Build → Games, hit *New game*, pick (say)
   *Wheel of Fortune*, keep the defaults, and create it. Copy the link, open
   `/p/<slug>/<game>` in an incognito window, verify an email, and spin. A win
   emails a code that redeems in the same staff box; a loss adds a loyalty
   point. Spin again to see the per-game cooldown, and check `/p/<slug>` for the
   hub listing every live game.
5. To test premium without paying: `update merchants set subscription_tier =
   'premium', premium_expires_at = now() + interval '1 year';` in the SQL
   editor, reload the dashboard, and you can run up to 10 grids with up to 10
   rewards each and configure the grid reset window. With `PAYSTACK_SECRET_KEY`
   set, the Settings tab instead offers a real (test-mode) checkout.

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

### SQL-level grid tests

Run in the Supabase SQL editor against a seeded/local stack (replace the slug
if needed). The `play_tile` function returns jsonb you can inspect directly:

```sql
-- Miss/hit + cooldown: second call must return {"result":"cooldown",...}
select play_tile('mama-put-kitchen', 0, 0, 'tester1@example.com');
select play_tile('mama-put-kitchen', 0, 1, 'tester1@example.com');

-- Tile already consumed: must return {"result":"error","error":"tile_taken"}
select play_tile('mama-put-kitchen', 0, 0, 'tester2@example.com');

-- Grant points and redeem them for a discount code
update customer_merchant_state set loyalty_points = 3;
select redeem_loyalty_points('mama-put-kitchen', 'tester1@example.com');

-- Redeem a code (find one first): second attempt must fail 'already_redeemed'
select redemption_code from unlocked_rewards where status = 'unredeemed';
select redeem_code((select id from merchants where slug = 'mama-put-kitchen'), 'CODE__');
select redeem_code((select id from merchants where slug = 'mama-put-kitchen'), 'CODE__');

-- Expiry: force-expire and confirm rejection
update unlocked_rewards set expires_at = now() - interval '1 hour' where status = 'unredeemed';
select redeem_code((select id from merchants where slug = 'mama-put-kitchen'), 'CODE__');
```

## Project layout

- `supabase/migrations/*.sql` — schema, RLS, and the atomic game functions.
  `0001_init` (tables/indexes/RLS) and `0002_functions` (`play_tile`,
  `redeem_code`, `redeem_loyalty_points`, `create_grid`) are the base; later
  migrations add branding & loyalty (`0003`), puzzle grids, payments & admin
  (`0004`), yearly premium codes & resets (`0005`), one-time reward codes &
  details (`0006`), and the 30-day default reward validity (`0007`).
  `0013` adds the branded-games platform (`games`, `game_prizes`, `game_plays`,
  `create_game`, `start_game_play`, `finish_game_play`, and game-aware staff
  lookup/redeem).
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
- `src/app/g/[slug]` — customer play page
- `src/app/me` — customer loyalty portal (email-only)
- `src/app/dashboard` — merchant dashboard (RLS reads, API writes); UI split
  into `src/components/dashboard/*`
- `src/app/admin` — platform admin console
- `src/lib/constants.ts` — game constants (mirrored in the SQL functions)

## Not in v1 (deliberately)

- Per-game analytics beyond plays / players / wins / redemptions
- Editing a game's questions or artwork after launch from the dashboard (the
  API supports it; the builder only creates)
- Grids larger than 7×7, or more than 10 rewards / 10 active grids per merchant
- Customer accounts/auth (email-only identity)
- Automatic expiry sweeps (expiry is enforced lazily at redemption; grid
  resets happen lazily on the next read)
