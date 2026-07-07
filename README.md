# TileHunt

Gamified loyalty widget for SMEs (built for Nigerian cloud kitchens first). A
merchant hides rewards in a tile grid and shares one link (WhatsApp bio/posts).
Customers tap **one tile per cooldown period**:

- **Hit** → reveals a reward, emails the customer a unique 6-character
  redemption code, and starts an expiry countdown (merchant-configurable).
- **Miss** → +1 loyalty point for that merchant and a 10-hour lockout.
- **3 loyalty points** can be traded for a **2% discount code** through the
  same redemption-code flow.

The board is **shared**: every tile can be revealed exactly once by anyone, so
the grid visibly depletes.

## Stack

- **Next.js** (App Router, TypeScript, Tailwind) — deploy on Vercel
- **Supabase** — Postgres, merchant auth, Row Level Security
- **Resend** — customer code emails + merchant notifications
- **Paystack** — *stubbed*: `merchants.subscription_tier` is toggled manually
  in the DB (`free` / `premium`)

## Security model

1. **The reward map never reaches the browser.** The public grid endpoint
   (`GET /api/play/[slug]`) returns dimensions and already-revealed tiles only.
   Reward positions exist solely in Postgres.
2. **Atomic clicks.** All game mutations are `SECURITY DEFINER` Postgres
   functions (`supabase/migrations/0002_functions.sql`) using
   `SELECT ... FOR UPDATE` row locks in a single transaction. Spamming the
   click endpoint gets a uniform `tile_taken` error that never leaks whether
   the tile held a reward; a reward's `max_redemptions` can't be over-claimed.
3. **Redemption by code only.** Staff type the customer's code into the
   dashboard — there is no lookup-by-email redemption path, and the dashboard
   masks stored codes. Once redeemed or expired, a code is invalid (expiry is
   enforced lazily at redemption time).
4. **RLS**: merchants can only *read* their own data; every write goes through
   API routes using the service-role key. Anonymous customers have no direct
   table access at all.

## Tier limits (hard caps in both API and SQL)

| Tier | Grid | Active rewards |
|------|------|----------------|
| free | exactly 5×5 | 1 |
| premium | 5×5 up to 20×20 | 10 |

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
   Supabase URL, anon key, service-role key, and (optionally) a Resend API key.
   Without `RESEND_API_KEY`, emails are logged to the server console instead.

3. **Run**:

   ```bash
   npm install
   npm run dev
   ```

## Manual end-to-end test

1. Sign up at `/signup` (confirm email if your project requires it), then log
   in at `/login`.
2. On `/dashboard`: create your business profile (name + link slug), then
   create a grid with at least one reward.
3. Open the customer link `/g/<slug>` in an incognito window, enter any email,
   and click tiles. A miss earns a point and starts the 10-hour cooldown; a hit
   shows the code (and emails it).
4. Back on the dashboard, type the code into **Redeem a customer code** — it
   redeems once, then rejects with "already redeemed".
5. To test premium: `update merchants set subscription_tier = 'premium';` in
   the SQL editor, reload the dashboard, and reset the grid at up to 20×20
   with up to 10 rewards.

### SQL-level game tests

Run in the Supabase SQL editor against a seeded/local stack (replace the slug
if needed). The `play_tile` function returns jsonb you can inspect directly:

```sql
-- Miss/hit + cooldown: second call must return {"result":"cooldown",...}
select play_tile('mama-put-kitchen', 0, 0, 'tester1@example.com');
select play_tile('mama-put-kitchen', 0, 1, 'tester1@example.com');

-- Tile already consumed: must return {"result":"error","error":"tile_taken"}
select play_tile('mama-put-kitchen', 0, 0, 'tester2@example.com');

-- Grant points and redeem them for a 2% code
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

- `supabase/migrations/0001_init.sql` — tables, indexes, RLS policies
- `supabase/migrations/0002_functions.sql` — `play_tile`, `redeem_code`,
  `redeem_loyalty_points`, `create_grid` (atomic game logic + tier caps)
- `src/app/api/play/[slug]/*` — public play endpoints (service role, no auth)
- `src/app/api/merchant/*` — merchant endpoints (session cookie auth)
- `src/app/g/[slug]` — customer play page
- `src/app/dashboard` — merchant dashboard (RLS reads, API writes)
- `src/lib/constants.ts` — game constants (mirrored in the SQL functions)

## Not in v1 (deliberately)

- Paystack subscription billing (tier toggled manually)
- Grids larger than 20×20 or more than 10 rewards
- Customer accounts/auth (email-only identity)
- Automatic expiry sweeps (expiry is enforced lazily at redemption)
