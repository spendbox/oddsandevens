-- TileHunt initial schema: tables, indexes, RLS.
--
-- Trust model:
--   * Merchants authenticate via Supabase Auth; RLS lets them READ their own
--     data (including their reward map). All writes go through Next.js API
--     routes using the service-role key.
--   * Customers are identified by email only (no auth). They get NO direct
--     table access — the play page only ever talks to API routes, so reward
--     positions never leave the database.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  business_name text not null check (char_length(business_name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  -- Paystack is stubbed in v1: toggle this column manually in the DB.
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'premium')),
  created_at timestamptz not null default now()
);

create table public.grids (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  rows int not null check (rows between 1 and 20),
  cols int not null check (cols between 1 and 20),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

-- A merchant has at most one active grid at a time.
create unique index grids_one_active_per_merchant
  on public.grids (merchant_id) where status = 'active';

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  grid_id uuid not null references public.grids (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  expiry_hours int not null default 48 check (expiry_hours between 1 and 720),
  max_redemptions int not null default 1 check (max_redemptions between 1 and 400),
  created_at timestamptz not null default now()
);

create index rewards_grid_idx on public.rewards (grid_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  created_at timestamptz not null default now()
);

-- "row"/"col" are awkward identifiers in plpgsql, so positions are stored as
-- row_index / col_index (0-based).
create table public.tiles (
  id uuid primary key default gen_random_uuid(),
  grid_id uuid not null references public.grids (id) on delete cascade,
  row_index int not null check (row_index between 0 and 19),
  col_index int not null check (col_index between 0 and 19),
  reward_id uuid references public.rewards (id) on delete set null,
  is_revealed boolean not null default false,
  revealed_by_customer_id uuid references public.customers (id) on delete set null,
  revealed_at timestamptz,
  unique (grid_id, row_index, col_index)
);

create index tiles_grid_idx on public.tiles (grid_id);

-- Enforces the per-merchant 10-hour cooldown and holds loyalty points.
create table public.customer_merchant_state (
  customer_id uuid not null references public.customers (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  last_played_at timestamptz,
  loyalty_points int not null default 0 check (loyalty_points >= 0),
  primary key (customer_id, merchant_id)
);

create index customer_merchant_state_merchant_idx
  on public.customer_merchant_state (merchant_id);

-- One row per unlocked reward OR loyalty-discount code. Both kinds share the
-- same redemption-code flow: reward_id is null for loyalty discounts.
create table public.unlocked_rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  reward_id uuid references public.rewards (id) on delete set null,
  reward_type text not null check (reward_type in ('tile', 'loyalty_discount')),
  discount_percent int check (discount_percent between 1 and 100),
  redemption_code text not null unique check (redemption_code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'unredeemed' check (status in ('unredeemed', 'redeemed', 'expired')),
  unlocked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  check (reward_type <> 'loyalty_discount' or discount_percent is not null)
);

create index unlocked_rewards_merchant_idx
  on public.unlocked_rewards (merchant_id, unlocked_at desc);
create index unlocked_rewards_customer_idx on public.unlocked_rewards (customer_id);
create index unlocked_rewards_reward_idx on public.unlocked_rewards (reward_id);

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
-- Supabase grants broad table privileges to anon/authenticated by default;
-- revoke everything, then grant back only what the merchant dashboard needs.

revoke all on all tables in schema public from anon, authenticated;

grant select on public.merchants,
                public.grids,
                public.rewards,
                public.tiles,
                public.unlocked_rewards,
                public.customers
  to authenticated;

-- business_name is the only column merchants may edit directly; everything
-- else (tier, slug, game state) changes server-side only.
grant update (business_name) on public.merchants to authenticated;

alter table public.merchants enable row level security;
alter table public.grids enable row level security;
alter table public.rewards enable row level security;
alter table public.tiles enable row level security;
alter table public.customers enable row level security;
alter table public.customer_merchant_state enable row level security;
alter table public.unlocked_rewards enable row level security;

create policy merchants_owner_select on public.merchants
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy merchants_owner_update on public.merchants
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy grids_owner_select on public.grids
  for select to authenticated
  using (merchant_id in (select id from public.merchants where owner_id = (select auth.uid())));

create policy rewards_owner_select on public.rewards
  for select to authenticated
  using (grid_id in (
    select g.id from public.grids g
    join public.merchants m on m.id = g.merchant_id
    where m.owner_id = (select auth.uid())
  ));

create policy tiles_owner_select on public.tiles
  for select to authenticated
  using (grid_id in (
    select g.id from public.grids g
    join public.merchants m on m.id = g.merchant_id
    where m.owner_id = (select auth.uid())
  ));

create policy unlocked_rewards_owner_select on public.unlocked_rewards
  for select to authenticated
  using (merchant_id in (select id from public.merchants where owner_id = (select auth.uid())));

-- Merchants may see the email of customers who unlocked one of their rewards
-- (shown in the dashboard's recent-unlocks list).
create policy customers_owner_select on public.customers
  for select to authenticated
  using (exists (
    select 1 from public.unlocked_rewards ur
    join public.merchants m on m.id = ur.merchant_id
    where ur.customer_id = customers.id and m.owner_id = (select auth.uid())
  ));

-- customer_merchant_state: no client policies — service role only.
