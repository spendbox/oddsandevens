-- ============================================================================
-- STEP 2 of 2, part A — Spendbox's tables.
--
-- Run supabase/reset.sql first, then this file, then 0002_policies.sql.
--
-- Money is stored in two currencies and they never mix:
--   * coins  — what a player spends. 1 coin buys 1 attempt at a box.
--   * naira  — what money is worth. Amounts are whole naira, never decimals.
-- One coin costs N100 and the smallest top-up is 5 coins. Those numbers live
-- in src/lib/money.ts as well; change them in both places.
--
-- Nothing in here lets a browser move money or decide a winner. Every write
-- that matters happens in a server route using the service-role key, and the
-- policies in 0002_policies.sql are what make that the only way.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per person, created the first time they land signed in.
-- The wallet is the `coins` column: a plain integer that can never go below
-- zero, so an attempt can only ever be paid for with a coin that exists.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  display_name   text not null default '',
  coins          integer not null default 0 check (coins >= 0),

  -- Where a win gets paid. Filled in by the player, read by whoever sends the
  -- money by hand from the Paystack dashboard.
  bank_name      text not null default '',
  account_number text not null default '',
  account_name   text not null default '',

  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- topups — a coin purchase, from the moment checkout starts.
--
-- The row is written as 'pending' before the player is sent to Paystack, and
-- only ever flips to 'success' after Paystack itself has confirmed the money
-- arrived. `reference` is unique, which is what stops the same payment being
-- credited twice when the browser callback and the webhook both come in.
-- ---------------------------------------------------------------------------
create table public.topups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  coins       integer not null check (coins > 0),
  amount_kobo integer not null check (amount_kobo > 0),
  reference   text not null unique,
  status      text not null default 'pending'
                check (status in ('pending', 'success', 'failed')),
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index topups_user_idx on public.topups (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- coin_ledger — every movement of coins, in one place, forever.
--
-- `coins` is signed: positive when coins arrive, negative when they are spent.
-- Sum it for a user and you should get their balance; if you ever don't, the
-- ledger is right and the balance is the bug.
-- ---------------------------------------------------------------------------
create table public.coin_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('topup', 'play', 'refund', 'bonus')),
  coins      integer not null,
  memo       text not null default '',
  created_at timestamptz not null default now()
);

create index coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- boxes — the thing someone creates and shares. Free to make.
--
-- `creator_name` is copied in rather than joined to profiles. A box page is
-- public, and denormalising the one field it needs means the profiles table
-- never has to be readable by strangers.
--
-- A box is won exactly once. `winner_id is null` is the lock: the server claims
-- a win with an update that only matches while that is still true, so two
-- players finishing at the same instant cannot both be first.
-- ---------------------------------------------------------------------------
create table public.boxes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  creator_id     uuid not null references public.profiles(id) on delete cascade,
  creator_name   text not null default '',
  title          text not null default '',
  prize_naira    integer not null default 100000 check (prize_naira > 0),
  status         text not null default 'open' check (status in ('open', 'won')),

  winner_id      uuid references public.profiles(id) on delete set null,
  winner_name    text not null default '',
  won_at         timestamptz,

  attempts_count integer not null default 0,
  best_level     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index boxes_creator_idx on public.boxes (creator_id, created_at desc);

-- ---------------------------------------------------------------------------
-- attempts — one paid run at a box. Costs one coin.
--
-- The pattern for the level being played is generated on the server and stored
-- here, one level at a time. Storing all ten up front would hand a player the
-- rest of the game the moment they started it.
--
-- `deadline_at` is the only clock that decides anything. The countdown a player
-- sees is for their benefit; the server compares the moment the answer arrives
-- against this column and nothing else.
-- ---------------------------------------------------------------------------
create table public.attempts (
  id             uuid primary key default gen_random_uuid(),
  box_id         uuid not null references public.boxes(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  player_name    text not null default '',

  status         text not null default 'playing'
                   check (status in ('playing', 'won', 'failed')),
  level          integer not null default 1 check (level between 1 and 10),
  levels_cleared integer not null default 0,
  replays_left   integer not null default 1 check (replays_left >= 0),

  -- Set when a level is missed and a replay is still available. While it is
  -- true the server will not hand out a new pattern, so reloading the page is
  -- not a way to retry a level without spending the replay.
  awaiting_replay boolean not null default false,

  -- The level currently issued to this player, and when it must be answered by.
  pattern        jsonb,
  pattern_level  integer,
  shown_at       timestamptz,
  deadline_at    timestamptz,

  coins_spent    integer not null default 1,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index attempts_box_idx  on public.attempts (box_id, created_at desc);
create index attempts_user_idx on public.attempts (user_id, created_at desc);

-- A player gets one live attempt per box at a time. Without this, opening the
-- game in two tabs would spend two coins and let each tab retry the other's
-- level.
create unique index attempts_one_live_per_box
  on public.attempts (box_id, user_id)
  where status = 'playing';

-- ---------------------------------------------------------------------------
-- payouts — what is owed, and to whom, once a box is beaten.
--
-- Beating a box creates two rows: the creator is paid, and so is the player who
-- got there first. Money leaves through the Paystack dashboard by hand; this
-- table is the list of what to send and the record that it went.
-- ---------------------------------------------------------------------------
create table public.payouts (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references public.boxes(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('creator', 'winner')),
  amount_naira integer not null check (amount_naira > 0),
  status       text not null default 'pending' check (status in ('pending', 'paid')),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  paid_at      timestamptz,

  -- One payout per side of a box, so replaying the claim cannot pay twice.
  unique (box_id, role)
);

create index payouts_user_idx   on public.payouts (user_id, created_at desc);
create index payouts_status_idx on public.payouts (status, created_at);
