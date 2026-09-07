-- ============================================================================
-- STEP 2 of 2, part C — the three things that must not go wrong twice.
--
-- Run this after 0002_policies.sql.
--
-- Everything else in Spendbox is an ordinary read or write. These three are
-- different because two of them touch money and one of them decides who gets
-- ₦200,000, and in all three cases doing it twice is the failure that costs
-- somebody something. So each is one function, which is one transaction:
-- it either all happens or none of it does.
--
-- They are SECURITY DEFINER, so they run with the owner's rights rather than
-- the caller's, and EXECUTE is granted to the service role alone. A browser
-- holding the anon key cannot call them at all.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- add_coins — put coins in a wallet and write the ledger line, together.
--
-- `update ... set coins = coins + n` is read-and-write in a single statement,
-- so two payments landing at the same instant add up instead of overwriting
-- each other. Doing it as a select and then an update is the classic way to
-- lose a top-up, and is why this is not that.
-- ---------------------------------------------------------------------------
create or replace function public.add_coins(
  p_user  uuid,
  p_coins integer,
  p_kind  text,
  p_memo  text default ''
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_coins = 0 then
    raise exception 'add_coins called with nothing to add';
  end if;

  update public.profiles
     set coins = coins + p_coins
   where id = p_user
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'no profile %', p_user;
  end if;

  insert into public.coin_ledger (user_id, kind, coins, memo)
  values (p_user, p_kind, p_coins, p_memo);

  return new_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_attempt — take a coin and open a run at a box.
--
-- Three outcomes, and the caller is told which:
--   * an attempt already in progress   -> hand it back, charge nothing
--   * enough coins                     -> charge one, open a new run
--   * not enough, or the box is won    -> charge nothing, explain
--
-- Resuming rather than recharging is the important one. A player who reloads
-- the page, loses signal mid-level, or opens the game in a second tab has not
-- started a second game and must not pay for one. The partial unique index on
-- attempts is what makes "already in progress" a single, unambiguous row.
--
-- The coin comes out with `coins = coins - 1 where coins >= 1`, so the balance
-- check and the deduction are the same statement. A player with one coin and
-- two tabs gets one game, not two.
-- ---------------------------------------------------------------------------
create or replace function public.start_attempt(
  p_box   uuid,
  p_user  uuid,
  p_name  text,
  p_cost  integer default 1
)
returns table (attempt_id uuid, resumed boolean, coins_left integer, problem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live    public.attempts;
  v_box     public.boxes;
  v_balance integer;
  v_attempt uuid;
begin
  select * into v_box from public.boxes where id = p_box;

  if v_box.id is null then
    return query select null::uuid, false, null::integer, 'no such box'::text;
    return;
  end if;

  if v_box.status <> 'open' then
    return query select null::uuid, false, null::integer,
                        'this box has already been won'::text;
    return;
  end if;

  -- Already playing? Give them the game they paid for.
  select * into v_live
    from public.attempts
   where box_id = p_box and user_id = p_user and status = 'playing'
   limit 1;

  if v_live.id is not null then
    select coins into v_balance from public.profiles where id = p_user;
    return query select v_live.id, true, v_balance, null::text;
    return;
  end if;

  update public.profiles
     set coins = coins - p_cost
   where id = p_user and coins >= p_cost
  returning coins into v_balance;

  if v_balance is null then
    select coins into v_balance from public.profiles where id = p_user;
    return query select null::uuid, false, coalesce(v_balance, 0),
                        'not enough coins'::text;
    return;
  end if;

  insert into public.coin_ledger (user_id, kind, coins, memo)
  values (p_user, 'play', -p_cost, 'Played box ' || v_box.code);

  insert into public.attempts (box_id, user_id, player_name, coins_spent)
  values (p_box, p_user, p_name, p_cost)
  returning id into v_attempt;

  update public.boxes
     set attempts_count = attempts_count + 1
   where id = p_box;

  return query select v_attempt, false, v_balance, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_win — decide, once and for all, who beat a box.
--
-- The prize is paid twice: to whoever made the box, and to whoever cleared all
-- ten levels of it first. "First" is settled by the WHERE clause. Two players
-- finishing level 10 in the same millisecond both run this; the update matches
-- for exactly one of them, because after that one `winner_id` is no longer
-- null. The other is told it was already won and their attempt ends unwon.
--
-- The two payout rows go in inside the same transaction, so a box can never be
-- marked won with nobody owed anything. Their (box_id, role) unique constraint
-- is a second lock behind the first.
-- ---------------------------------------------------------------------------
create or replace function public.claim_win(
  p_box   uuid,
  p_user  uuid,
  p_name  text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prize   integer;
  v_creator uuid;
  v_code    text;
begin
  update public.boxes
     set status      = 'won',
         winner_id   = p_user,
         winner_name = p_name,
         won_at      = now()
   where id = p_box
     and status = 'open'
     and winner_id is null
  returning prize_naira, creator_id, code into v_prize, v_creator, v_code;

  if v_prize is null then
    return false;
  end if;

  insert into public.payouts (box_id, user_id, role, amount_naira, note)
  values
    (p_box, v_creator, 'creator', v_prize, 'Box ' || v_code || ' was beaten'),
    (p_box, p_user,    'winner',  v_prize, 'Beat box ' || v_code)
  on conflict (box_id, role) do nothing;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nobody but Spendbox's own server may call these.
-- ---------------------------------------------------------------------------
revoke all on function public.add_coins(uuid, integer, text, text)   from public, anon, authenticated;
revoke all on function public.start_attempt(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.claim_win(uuid, uuid, text)            from public, anon, authenticated;

grant execute on function public.add_coins(uuid, integer, text, text)     to service_role;
grant execute on function public.start_attempt(uuid, uuid, text, integer) to service_role;
grant execute on function public.claim_win(uuid, uuid, text)              to service_role;
