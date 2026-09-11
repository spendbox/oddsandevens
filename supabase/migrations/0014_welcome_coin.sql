-- ============================================================================
-- A free coin to start with, and the limit that stops it being farmed.
--
-- Run this after 0013_admin_insights.sql. Safe to run twice — the backfill at
-- the bottom is guarded by a primary key, so running this file again gives
-- nobody a second coin.
--
-- A go at a box costs a coin, which means somebody who has just signed up
-- cannot play at all until they have paid. That is the wrong first minute: the
-- link they tapped promised a game. So every player gets one coin, free, once —
-- everybody who already has an account, and everybody who makes one from now
-- on.
--
-- Free coins are worth real prize money, so the giveaway has to be countable and
-- it has to be limited. Three things do that:
--
--   * `welcome_grants` has one row per player, keyed by their id. A player can
--     be granted once and the primary key is what says so — not a check in the
--     app, which two tabs would both pass.
--
--   * The connection it came from is recorded, and a connection may claim only
--     so many. Fifty accounts made on one phone to get fifty free shots at
--     ₦100,000 is the obvious attack, and it is the only one the server can see
--     coming.
--
--   * The coin lands through `add_coins`, so it is a ledger line like any other.
--     A coin given is not a coin sold, and the admin screens count them apart:
--     coins in wallets only reconciles against sales once the free ones are
--     named.
--
-- Both numbers are settings rather than constants. The per-connection limit is
-- the one that will need moving in a hurry: shared connections are the norm
-- here, and a limit that locks a whole compound out of a free coin is a worse
-- failure than a few extra coins given away.
-- ============================================================================

-- The row the settings below live on. `where id` matches nothing without it.
insert into public.settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- settings.welcome_coins — how many coins a new player is given. Zero is off.
-- settings.welcome_max_per_ip — how many players one connection may claim for.
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists welcome_coins integer not null default 1;

alter table public.settings
  drop constraint if exists settings_welcome_coins_sane;
-- A ceiling, not a policy: it is a typo guard, the same as MAX_PRIZE_NAIRA.
-- Every coin here is given to every account that is ever made.
alter table public.settings
  add constraint settings_welcome_coins_sane check (welcome_coins between 0 and 50);

alter table public.settings
  add column if not exists welcome_max_per_ip integer not null default 3;

alter table public.settings
  drop constraint if exists settings_welcome_ip_sane;
-- At least one, because a limit of zero would read as "off" while actually
-- meaning "nobody with a known connection may have one", which is not a thing
-- anybody wants to configure. Turning the free coin off is welcome_coins = 0.
alter table public.settings
  add constraint settings_welcome_ip_sane check (welcome_max_per_ip between 1 and 1000);

-- ---------------------------------------------------------------------------
-- welcome_grants — who has been given their free coin, and from where.
--
-- One row per player, forever. The primary key is the whole anti-double-grant
-- mechanism: reloading, a second tab, a re-run of this migration and a retry
-- after a failed sign-up all land on the same row and the second one does
-- nothing.
--
-- `ip` is the connection the account was made on, or empty when it could not be
-- worked out. Empty never counts towards anybody's limit — a player must not
-- lose their coin because a header was missing — and the backfill below writes
-- empty for everybody who was already here, because there is no honest answer
-- for an account that was made before this column existed.
--
-- Row level security is on and there are no policies at all, which is the point:
-- nothing holding the anon or authenticated key can read this table. Where
-- somebody signed up from is not theirs to browse, or anybody else's.
-- ---------------------------------------------------------------------------
create table if not exists public.welcome_grants (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  coins      integer not null check (coins >= 0),
  ip         text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists welcome_grants_ip_idx
  on public.welcome_grants (ip, created_at desc);

alter table public.welcome_grants enable row level security;

-- ---------------------------------------------------------------------------
-- grant_welcome_coin — give somebody their coin, once, if their connection has
-- not already had its share.
--
-- The amount and the limit are read from the settings row here rather than
-- passed in. Everywhere else in Spendbox a price is passed to the function that
-- charges it, because the price belongs to the screen that quoted it; this is
-- the opposite case. Nothing quotes this to anybody before it happens, and an
-- argument would be one more thing a caller could get wrong in a direction that
-- costs money. The prize works the same way, for the same reason — see the
-- trigger in 0012.
--
-- Never raises. A free coin that cannot be given must not be a sign-up that
-- fails, so every refusal is a row with a reason in it and the caller decides
-- what to do. The reasons are 'off', 'already', 'ip' and 'no profile'.
-- ---------------------------------------------------------------------------
create or replace function public.grant_welcome_coin(
  p_user uuid,
  p_ip   text default ''
)
returns table (granted boolean, coins integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coins integer;
  v_cap   integer;
  v_used  integer;
  v_ip    text := coalesce(btrim(p_ip), '');
begin
  select s.welcome_coins, s.welcome_max_per_ip
    into v_coins, v_cap
    from public.settings s
   where s.id;

  -- A database whose settings row has gone missing still gives the coin at the
  -- built-in figure. The admin screen says loudly when that row cannot be read.
  v_coins := coalesce(v_coins, 1);
  v_cap   := coalesce(v_cap, 3);

  if v_coins <= 0 then
    return query select false, 0, 'off'::text;
    return;
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user) then
    return query select false, 0, 'no profile'::text;
    return;
  end if;

  if exists (select 1 from public.welcome_grants w where w.user_id = p_user) then
    return query select false, 0, 'already'::text;
    return;
  end if;

  if v_ip <> '' then
    -- Two accounts made from one connection in the same instant are a race, and
    -- counting-then-inserting loses it. The lock is held to the end of this
    -- transaction and is keyed on the connection, so two sign-ups from
    -- different places never wait on each other.
    perform pg_advisory_xact_lock(hashtext(v_ip));

    select count(*) into v_used
      from public.welcome_grants w
     where w.ip = v_ip;

    if v_used >= v_cap then
      return query select false, 0, 'ip'::text;
      return;
    end if;
  end if;

  insert into public.welcome_grants (user_id, coins, ip)
       values (p_user, v_coins, v_ip)
  on conflict (user_id) do nothing;

  -- Lost the race with another tab. Their row is the grant; this one is not.
  if not found then
    return query select false, 0, 'already'::text;
    return;
  end if;

  perform public.add_coins(
    p_user,
    v_coins,
    'bonus',
    case when v_coins = 1
         then 'Free coin to get you started'
         else 'Free coins to get you started' end
  );

  return query select true, v_coins, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_welcome_rules — the admin's way to move both numbers.
--
-- Upserts and returns what is stored, never what it was asked for, so the
-- screen can only ever report the truth. Same arrangement as set_prize.
-- ---------------------------------------------------------------------------
create or replace function public.set_welcome_rules(
  p_coins      integer,
  p_max_per_ip integer
)
returns table (coins integer, max_per_ip integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coins integer;
  v_cap   integer;
begin
  if p_coins is null or p_coins < 0 then
    raise exception 'give a number of coins, zero or more';
  end if;

  if p_coins > 50 then
    raise exception 'that is more than a welcome — 50 coins is the ceiling';
  end if;

  if p_max_per_ip is null or p_max_per_ip < 1 then
    raise exception 'one connection has to be allowed at least one free coin';
  end if;

  insert into public.settings (id, welcome_coins, welcome_max_per_ip, updated_at)
       values (true, p_coins, p_max_per_ip, now())
  on conflict (id) do update
          set welcome_coins      = excluded.welcome_coins,
              welcome_max_per_ip = excluded.welcome_max_per_ip,
              updated_at         = now()
    returning settings.welcome_coins, settings.welcome_max_per_ip
         into v_coins, v_cap;

  return query select v_coins, v_cap;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_welcome_ips — the connections that have claimed the most free coins.
--
-- The evidence for the limit doing its job, and for where it needs to be. A
-- connection at the top of this list with twenty accounts behind it is either a
-- university or somebody at work on your prize money, and an admin can only
-- tell those apart by looking.
-- ---------------------------------------------------------------------------
create or replace function public.admin_welcome_ips(p_limit integer default 8)
returns table (
  ip      text,
  claims  bigint,
  coins   bigint,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select w.ip,
         count(*)::bigint,
         coalesce(sum(w.coins), 0)::bigint,
         max(w.created_at)
    from public.welcome_grants w
   where w.ip <> ''
   group by w.ip
  having count(*) > 1
   order by count(*) desc, max(w.created_at) desc
   limit greatest(coalesce(p_limit, 8), 1);
$$;

-- ---------------------------------------------------------------------------
-- admin_money_snapshot, again — now that not every coin in a wallet was sold.
--
-- Coins in wallets used to be coins sold minus coins spent. It is not any more,
-- and a dashboard where those three numbers no longer reconcile looks broken
-- long before anybody works out why. So the coins that were given rather than
-- bought are counted and named.
--
-- Dropped and recreated rather than replaced: Postgres will not let CREATE OR
-- REPLACE change the columns a function returns.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_money_snapshot();

create or replace function public.admin_money_snapshot()
returns table (
  players            bigint,
  paying_players     bigint,
  coins_sold         bigint,
  naira_in           bigint,
  payments           bigint,
  naira_pending      bigint,
  payments_pending   bigint,
  naira_failed       bigint,
  payments_failed    bigint,
  coins_spent        bigint,
  coins_held         bigint,
  coins_given        bigint,
  welcome_claims     bigint,
  naira_owed         bigint,
  naira_paid         bigint,
  boxes_total        bigint,
  boxes_open         bigint,
  boxes_won          bigint,
  games              bigint,
  players_who_played bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.profiles),
    (select count(distinct user_id) from public.topups where status = 'success'),

    coalesce((select sum(coins)       from public.topups where status = 'success'), 0)::bigint,
    coalesce((select sum(amount_kobo) from public.topups where status = 'success'), 0)::bigint / 100,
    (select count(*) from public.topups where status = 'success'),

    coalesce((select sum(amount_kobo) from public.topups where status = 'pending'), 0)::bigint / 100,
    (select count(*) from public.topups where status = 'pending'),

    coalesce((select sum(amount_kobo) from public.topups where status = 'failed'), 0)::bigint / 100,
    (select count(*) from public.topups where status = 'failed'),

    -- Coins spent. The ledger is the record of every movement, so a retry
    -- bought at level 9 counts here exactly like a game started, which is what
    -- makes this the honest counterpart to coins sold.
    coalesce((select sum(-coins) from public.coin_ledger where coins < 0), 0)::bigint,
    coalesce((select sum(coins)  from public.profiles), 0)::bigint,

    -- Coins given rather than sold: the welcome coin, and anything else ever
    -- credited as a bonus. Sold plus given minus spent is what is in wallets.
    coalesce((select sum(coins) from public.coin_ledger
               where kind = 'bonus' and coins > 0), 0)::bigint,
    (select count(*) from public.welcome_grants),

    coalesce((select sum(amount_naira) from public.payouts where status = 'pending'), 0)::bigint,
    coalesce((select sum(amount_naira) from public.payouts where status = 'paid'), 0)::bigint,

    (select count(*) from public.boxes),
    (select count(*) from public.boxes where status = 'open'),
    (select count(*) from public.boxes where status = 'won'),

    (select count(*) from public.attempts),
    (select count(distinct user_id) from public.attempts);
$$;

-- ---------------------------------------------------------------------------
-- Nobody but the service role. These give away coins and read where people
-- signed up from.
-- ---------------------------------------------------------------------------
revoke all on function public.grant_welcome_coin(uuid, text)        from public, anon, authenticated;
revoke all on function public.set_welcome_rules(integer, integer)   from public, anon, authenticated;
revoke all on function public.admin_welcome_ips(integer)            from public, anon, authenticated;
revoke all on function public.admin_money_snapshot()                from public, anon, authenticated;

grant execute on function public.grant_welcome_coin(uuid, text)      to service_role;
grant execute on function public.set_welcome_rules(integer, integer) to service_role;
grant execute on function public.admin_welcome_ips(integer)          to service_role;
grant execute on function public.admin_money_snapshot()              to service_role;

-- ---------------------------------------------------------------------------
-- Everybody who is already here gets theirs, once.
--
-- Guarded by the primary key on welcome_grants rather than by a WHERE NOT
-- EXISTS, so running this file a second time inserts nothing, updates nothing
-- and writes no ledger line. The connection is recorded empty: there is no
-- honest answer for an account made before the column existed, and empty is the
-- value that never counts against anybody's limit.
--
-- Data-modifying CTEs all run exactly once and to completion whether or not the
-- outer query reads them, which is what makes the wallet update and the ledger
-- line land together with the grant.
-- ---------------------------------------------------------------------------
do $$
declare
  v_coins integer;
begin
  select welcome_coins into v_coins from public.settings where id;
  v_coins := coalesce(v_coins, 1);

  if v_coins <= 0 then
    raise notice 'welcome coin is switched off; nobody was backfilled';
    return;
  end if;

  with granted as (
    insert into public.welcome_grants (user_id, coins, ip)
    select p.id, v_coins, ''
      from public.profiles p
    on conflict (user_id) do nothing
    returning user_id, coins
  ), paid as (
    update public.profiles p
       set coins = p.coins + g.coins
      from granted g
     where p.id = g.user_id
    returning p.id
  )
  insert into public.coin_ledger (user_id, kind, coins, memo)
  select g.user_id,
         'bonus',
         g.coins,
         case when g.coins = 1
              then 'Free coin to get you started'
              else 'Free coins to get you started' end
    from granted g;
end $$;
