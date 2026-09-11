-- ============================================================================
-- What the admin screens could not see: who is spending, and which box is
-- actually being played.
--
-- Run this after 0012_editable_prize.sql. Safe to run twice. Nothing here
-- writes anything — every function is a read, and none of them is on a path a
-- player touches.
--
-- Three questions the dashboard was answering badly or not at all:
--
--   1. "What has come in?" It was answered by pulling every successful top-up
--      row into the app and adding them up there. PostgREST caps a select at a
--      thousand rows, so that total was right only until the thousandth
--      payment and then quietly stopped growing — the worst kind of wrong,
--      because nothing about it looks broken. A sum belongs in the database.
--
--   2. "Who is spending?" It was not answered at all. Coins bought and coins
--      spent are both in the tables; nothing added them up per person.
--
--   3. "Which box is being played?" `boxes.attempts_count` counts goes, not
--      people, and one player having forty goes at their friend's box is not
--      the same thing as forty people having one each. Counting the distinct
--      players on a box is a `count(distinct user_id)` and there is no honest
--      way to do it from the app.
--
-- All three are SECURITY DEFINER with EXECUTE granted to service_role alone,
-- the same arrangement as the money functions in 0003. They read across every
-- player's rows, so nothing holding the anon key may call them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin_money_snapshot — every total on the dashboard, in one row.
--
-- Counted by Postgres over the whole table rather than by the app over the
-- first thousand rows. Money that has not arrived is kept apart from money that
-- has: `naira_in` is successful top-ups only, and pending and failed are their
-- own columns, because a payment somebody is still in the middle of making is
-- not income and must never be added to it.
-- ---------------------------------------------------------------------------
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

    coalesce((select sum(amount_naira) from public.payouts where status = 'pending'), 0)::bigint,
    coalesce((select sum(amount_naira) from public.payouts where status = 'paid'), 0)::bigint,

    (select count(*) from public.boxes),
    (select count(*) from public.boxes where status = 'open'),
    (select count(*) from public.boxes where status = 'won'),

    (select count(*) from public.attempts),
    (select count(distinct user_id) from public.attempts);
$$;

-- ---------------------------------------------------------------------------
-- admin_top_spenders — who has paid, how much, and what they did with it.
--
-- Ordered by money in, because that is the question. Coins spent comes from the
-- ledger rather than from the attempts table: attempts record a run being
-- opened, and a retry bought half way up a box is money spent that never opened
-- one. Somebody who has paid nothing is not a spender and is not listed —
-- that is what the join, rather than a left join, is doing.
-- ---------------------------------------------------------------------------
create or replace function public.admin_top_spenders(p_limit integer default 20)
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  naira_in     bigint,
  coins_bought bigint,
  payments     bigint,
  coins_spent  bigint,
  coins_left   integer,
  first_paid_at timestamptz,
  last_paid_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with paid as (
    select t.user_id,
           sum(t.amount_kobo)::bigint as kobo,
           sum(t.coins)::bigint       as coins_bought,
           count(*)::bigint           as payments,
           min(coalesce(t.paid_at, t.created_at)) as first_paid_at,
           max(coalesce(t.paid_at, t.created_at)) as last_paid_at
      from public.topups t
     where t.status = 'success'
     group by t.user_id
  ),
  spent as (
    select l.user_id, sum(-l.coins)::bigint as coins_spent
      from public.coin_ledger l
     where l.coins < 0
     group by l.user_id
  )
  select p.id,
         p.email,
         p.display_name,
         paid.kobo / 100,
         paid.coins_bought,
         paid.payments,
         coalesce(spent.coins_spent, 0),
         p.coins,
         paid.first_paid_at,
         paid.last_paid_at
    from paid
    join public.profiles p on p.id = paid.user_id
    left join spent on spent.user_id = paid.user_id
   order by paid.kobo desc, paid.last_paid_at desc
   limit greatest(coalesce(p_limit, 20), 1);
$$;

-- ---------------------------------------------------------------------------
-- admin_box_activity — every box with the number of people who have played it.
--
-- `players` is distinct players; `games` is goes. They are different numbers
-- and the difference is the point: a box with two hundred goes from four people
-- is a box four people are stuck on, and a box with forty goes from forty
-- people is a box that is being shared. Only one of those is working.
--
-- p_sort names the column to arrange by. An unknown value is not an error —
-- it falls through to newest first, because a sort order arriving from a query
-- string is exactly the sort of thing that should never be able to break a
-- page.
-- ---------------------------------------------------------------------------
create or replace function public.admin_box_activity(
  p_sort  text    default 'players',
  p_limit integer default 100
)
returns table (
  id             uuid,
  code           text,
  title          text,
  creator_id     uuid,
  creator_name   text,
  status         text,
  prize_naira    integer,
  best_level     integer,
  players        bigint,
  games          bigint,
  winners        bigint,
  last_played_at timestamptz,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with play as (
    select a.box_id,
           count(distinct a.user_id)::bigint as players,
           count(*)::bigint                  as games,
           count(*) filter (where a.status = 'won') as winners,
           max(a.created_at)                 as last_played_at
      from public.attempts a
     group by a.box_id
  )
  select b.id,
         b.code,
         b.title,
         b.creator_id,
         b.creator_name,
         b.status,
         b.prize_naira,
         b.best_level,
         coalesce(play.players, 0),
         coalesce(play.games, 0),
         coalesce(play.winners, 0),
         play.last_played_at,
         b.created_at
    from public.boxes b
    left join play on play.box_id = b.id
   order by
     case when p_sort = 'players'  then coalesce(play.players, 0) end desc nulls last,
     case when p_sort = 'games'    then coalesce(play.games, 0)   end desc nulls last,
     case when p_sort = 'best'     then b.best_level              end desc nulls last,
     case when p_sort = 'quietest' then coalesce(play.players, 0) end asc  nulls last,
     b.created_at desc
   limit greatest(coalesce(p_limit, 100), 1);
$$;

-- ---------------------------------------------------------------------------
-- Nobody but the service role. These read every player's payments.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_money_snapshot()             from public, anon, authenticated;
revoke all on function public.admin_top_spenders(integer)        from public, anon, authenticated;
revoke all on function public.admin_box_activity(text, integer)  from public, anon, authenticated;

grant execute on function public.admin_money_snapshot()            to service_role;
grant execute on function public.admin_top_spenders(integer)       to service_role;
grant execute on function public.admin_box_activity(text, integer) to service_role;
