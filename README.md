# Spendbox

Gamified loyalty widget for SMEs (built for Nigerian cloud kitchens first). A
merchant hides rewards in a tile grid and shares one link (WhatsApp bio/posts).
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
   dashboard — a two-step flow resolves the code (cycling loyalty code or a
   tile reward code) and then redeems it. There is deliberately no
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

## Tier limits (hard caps in both API and SQL)

Grid size is a fixed 7×7 on every tier — tiers differ by how much you can run
and how you can theme it.

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
5. To test premium without paying: `update merchants set subscription_tier =
   'premium', premium_expires_at = now() + interval '1 year';` in the SQL
   editor, reload the dashboard, and you can run up to 10 grids with up to 10
   rewards each and configure the grid reset window. With `PAYSTACK_SECRET_KEY`
   set, the Settings tab instead offers a real (test-mode) checkout.

### SQL-level game tests

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

- Grids larger than 7×7, or more than 10 rewards / 10 active grids per merchant
- Customer accounts/auth (email-only identity)
- Automatic expiry sweeps (expiry is enforced lazily at redemption; grid
  resets happen lazily on the next read)
