-- Players get an account.
--
-- Until now a player was an email address and a signed cookie: verify once,
-- play for six months, and if the cookie went so did everything you could see.
-- That was fine when the only thing behind the address was a life pool. It
-- stopped being fine the moment there was money — a reward waiting, a bank
-- account on file, lives bought with real naira — because "prove you can read
-- this inbox" is the only recovery path, and an inbox you have lost access to
-- takes the money with it.
--
-- So: a password, set at sign-up and resettable by email, and bank details that
-- live on the player rather than being re-typed into every claim.
--
-- Three things this deliberately does *not* change:
--
--   * The cookie still does the remembering. A password is how you get a new
--     cookie, not something you type every visit.
--   * Verification by code still works and is still the only route for a brand
--     new address. A password is set at the end of that flow, not instead of it.
--   * `players` still has no Supabase auth user. Contributors have one because
--     they need a dashboard session; a player needs an identity, which is a
--     row and a hash.

-- ---------------------------------------------------------------------------
-- Credentials
-- ---------------------------------------------------------------------------

-- The hash format is the application's business — it writes and reads it and
-- Postgres never interprets it. What matters here is that it is never null for
-- an account that has one, and that nothing but a service-role client can read
-- the column: RLS on `players` grants no select to anybody.
alter table public.players
  add column if not exists password_hash text,
  add column if not exists password_set_at timestamptz;

-- ---------------------------------------------------------------------------
-- Where a reward goes
-- ---------------------------------------------------------------------------

-- Bank details on the player, not on the claim.
--
-- They were per-claim, which meant a player who won twice typed their account
-- number twice and had no way to correct the first one. A claim still records
-- what it was *paid to* — that is a payment record and must not move under an
-- edit — but the player's current details live here and pre-fill the next one.
alter table public.players
  add column if not exists bank_code text,
  add column if not exists bank_name text,
  add column if not exists account_number text,
  add column if not exists account_name text,
  add column if not exists bank_updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_account_number_shape') then
    alter table public.players
      add constraint players_account_number_shape
      check (account_number is null or account_number ~ '^[0-9]{10}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: deleting a box
-- ---------------------------------------------------------------------------

-- A live box is permanent to everyone including us — the record of what people
-- spent weeks doing outlives anybody's change of heart. But a box that is
-- genuinely wrong (a password nobody could ever type, something abusive in the
-- title) has to be removable, and until now the only tool was `closed`, which
-- leaves it on the board.
--
-- This is the audit trail for the times we do it. The row is written *before*
-- the delete and survives it, so there is always a record of what went and who
-- asked, even though the box itself is gone.
create table if not exists public.box_deletions (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null,
  slug text not null,
  title text not null,
  kind text not null,
  reward_kobo bigint not null,
  status text not null,
  attempts_count int not null,
  players_count int not null,
  /** What players had spent on it. Deleting a box does not un-take money. */
  spent_kobo bigint not null default 0,
  deleted_by text not null,
  reason text,
  deleted_at timestamptz not null default now()
);

alter table public.box_deletions enable row level security;

/*
 * Delete a box, and everything hanging off it, in one transaction.
 *
 * Ordering is the whole of it. The audit row is written first, from the box's
 * own columns, because a moment later there is nothing left to read them from.
 * Orders are counted before they go for the same reason.
 *
 * Everything else — hunts, attempts, funding, power-up orders, the reward claim
 * — is `on delete cascade` from `boxes` already, so the delete does the work.
 * `life_orders.box_id` is `on delete set null` instead: a life is the player's
 * and outlives the box that prompted them to buy it.
 */
create or replace function public.admin_delete_box(
  p_box_id uuid,
  p_actor text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.boxes;
  v_spent bigint;
begin
  select * into v_box from public.boxes where id = p_box_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'box_not_found');
  end if;

  select coalesce(sum(price_kobo), 0) into v_spent
    from public.power_up_orders
   where box_id = p_box_id and status = 'paid';

  select v_spent + coalesce(sum(price_kobo), 0) into v_spent
    from public.life_orders
   where box_id = p_box_id and status = 'paid';

  insert into public.box_deletions (
    box_id, slug, title, kind, reward_kobo, status,
    attempts_count, players_count, spent_kobo, deleted_by, reason
  )
  values (
    v_box.id, v_box.slug, v_box.title, v_box.kind, v_box.reward_kobo, v_box.status,
    v_box.attempts_count, v_box.players_count, v_spent, p_actor, p_reason
  );

  delete from public.boxes where id = p_box_id;

  return jsonb_build_object(
    'result', 'deleted',
    'slug', v_box.slug,
    'title', v_box.title,
    'spent_kobo', v_spent
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: what a player is worth, and what they've been paid
-- ---------------------------------------------------------------------------

/*
 * One row per player, with everything an administrator answering a support
 * email needs and nothing they don't.
 *
 * A view rather than five queries stitched together in a route: the sums are
 * over three tables and getting one of the joins wrong silently under-reports
 * money, which is the sort of bug nobody notices for a month.
 *
 * `security_invoker` is deliberately *off* — this is a service-role-only read
 * and the revoke below is what keeps it that way.
 */
create or replace view public.admin_players as
select
  p.id,
  p.email,
  p.lives,
  p.created_at,
  p.password_set_at is not null as has_password,
  p.invited_by is not null as was_invited,
  p.bank_name,
  p.account_name,
  coalesce(l.lives_bought, 0) as lives_bought,
  coalesce(l.life_kobo, 0) as life_kobo,
  coalesce(u.power_ups_bought, 0) as power_ups_bought,
  coalesce(u.power_up_kobo, 0) as power_up_kobo,
  coalesce(l.life_kobo, 0) + coalesce(u.power_up_kobo, 0) as spent_kobo,
  coalesce(h.hunts, 0) as hunts,
  coalesce(h.attempts, 0) as attempts,
  coalesce(w.wins, 0) as wins,
  coalesce(w.won_kobo, 0) as won_kobo,
  greatest(p.created_at, coalesce(h.last_seen, p.created_at)) as last_seen
from public.players p
left join (
  select player_id,
         sum(quantity) as lives_bought,
         sum(price_kobo) as life_kobo
    from public.life_orders where status = 'paid' group by player_id
) l on l.player_id = p.id
left join (
  select player_id,
         count(*) as power_ups_bought,
         sum(price_kobo) as power_up_kobo
    from public.power_up_orders where status = 'paid' group by player_id
) u on u.player_id = p.id
left join (
  select player_id,
         count(*) as hunts,
         sum(attempts_count) as attempts,
         max(last_attempt_at) as last_seen
    from public.hunts group by player_id
) h on h.player_id = p.id
left join (
  select player_id,
         count(*) as wins,
         sum(amount_kobo) as won_kobo
    from public.reward_claims group by player_id
) w on w.player_id = p.id;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- The view exposes every player's address and spend. Nothing but a service-role
-- client may read it, and `public` here is the pseudo-role that anon and
-- authenticated inherit from.
revoke all on public.admin_players from public, anon, authenticated;
revoke execute on function public.admin_delete_box(uuid, text, text)
from public, anon, authenticated;
