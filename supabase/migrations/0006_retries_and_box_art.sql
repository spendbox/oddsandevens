-- ============================================================================
-- Paid retries, boxes you can dress up, and passwords for everybody.
--
-- Run this after 0005_password_resets.sql. Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Everyone signs up with a password now.
--
-- 0004 introduced accounts that an email alone could open. That is gone:
-- signing up asks for a password, so there is no such thing as an account
-- without one. The column stays because the claim flow and the account page
-- both read it, but from here it is true for everybody.
-- ---------------------------------------------------------------------------
alter table public.profiles alter column password_set set default true;
update public.profiles set password_set = true where password_set = false;

-- ---------------------------------------------------------------------------
-- A box you can dress up.
--
-- A shared link competes with everything else in a group chat, and "Box KJ7P2Q"
-- loses that fight. A picture and a sentence are what make it worth tapping.
--
-- Neither can be removed by the creator once the box is live, only replaced —
-- and the box itself can never be deleted. A box holds a real ₦100,000 promise
-- to whoever is playing it, and letting the person who owes that money make it
-- disappear would be the one change that breaks the deal.
-- ---------------------------------------------------------------------------
alter table public.boxes
  add column if not exists description text not null default '';

alter table public.boxes
  add column if not exists image_url text not null default '';

-- ---------------------------------------------------------------------------
-- Somewhere to keep the pictures.
--
-- Public bucket: a box page is meant to be opened by strangers with a link, so
-- its picture has to load for them too. Uploads never come from the browser —
-- they go through a server action holding the service-role key, which is what
-- gets to decide the file is really an image and really belongs to that box.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('box-images', 'box-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- buy_replay — spend a coin to take the level again.
--
-- Every game comes with one free replay. This is what happens after it is
-- gone: rather than the run ending, a player may pay a coin to stay on the
-- level they are on. They keep their cleared levels; they get a brand new
-- pattern for the one that beat them.
--
-- Same shape as start_attempt and for the same reason. The coin comes out with
-- `coins = coins - 1 where coins >= 1`, so the balance check and the deduction
-- are one statement, and the ledger line and the state change land in the same
-- transaction. A player with one coin who taps the button twice gets one retry.
--
-- `awaiting_replay` is the guard on both sides: it is only true after a miss,
-- so this cannot be called to buy anything at a moment when nothing is owed,
-- and clearing it is what lets the next pattern be issued.
-- ---------------------------------------------------------------------------
create or replace function public.buy_replay(
  p_attempt uuid,
  p_user    uuid,
  p_cost    integer default 1
)
returns table (bought boolean, coins_left integer, problem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts;
  v_balance integer;
begin
  select * into v_attempt
    from public.attempts
   where id = p_attempt and user_id = p_user;

  if v_attempt.id is null then
    return query select false, null::integer, 'no such game'::text;
    return;
  end if;

  if v_attempt.status <> 'playing' then
    return query select false, null::integer, 'that game is over'::text;
    return;
  end if;

  if not v_attempt.awaiting_replay then
    return query select false, null::integer, 'nothing to retry'::text;
    return;
  end if;

  update public.profiles
     set coins = coins - p_cost
   where id = p_user and coins >= p_cost
  returning coins into v_balance;

  if v_balance is null then
    select coins into v_balance from public.profiles where id = p_user;
    return query select false, coalesce(v_balance, 0), 'not enough coins'::text;
    return;
  end if;

  insert into public.coin_ledger (user_id, kind, coins, memo)
  values (p_user, 'play', -p_cost, 'Retried level ' || v_attempt.level);

  -- Clearing awaiting_replay is what unlocks the next pattern. replays_left is
  -- deliberately untouched: the free one was already spent, and buying a retry
  -- does not hand another free one back.
  update public.attempts
     set awaiting_replay = false,
         pattern = null,
         pattern_level = null,
         shown_at = null,
         deadline_at = null
   where id = p_attempt and awaiting_replay = true;

  return query select true, v_balance, null::text;
end;
$$;

revoke all on function public.buy_replay(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.buy_replay(uuid, uuid, integer) to service_role;
