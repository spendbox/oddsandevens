-- ---------------------------------------------------------------------------
-- Starting a game costs nothing. Carrying on from a level still costs.
--
-- The price moved off the first level and onto the levels that are worth
-- something: `retryCostFor` in src/lib/money.ts. Nothing about buy_replay
-- changes — what a player pays for is the progress they keep, and that is the
-- only thing being sold now.
--
-- start_attempt already took the cost as an argument, so the app can say zero
-- without a migration. What it could not do is say zero *cleanly*: the charge
-- was `coins = coins - 0 where coins >= 0`, which touches every free player's
-- wallet row for no reason and writes a ledger line saying nothing left. Worse,
-- that update is what the "not enough coins" answer is read from, and it misses
-- for anybody with no profile row at all — so a free game could still be
-- refused for want of coins it did not need.
--
-- So: a free start skips the wallet and the ledger entirely, and the default
-- cost is zero, which is what the app now passes. The balance is still read,
-- because the caller is told what is in the wallet either way — the screen
-- after a missed level needs it to know whether carrying on is affordable.
-- ---------------------------------------------------------------------------
create or replace function public.start_attempt(
  p_box   uuid,
  p_user  uuid,
  p_name  text,
  p_cost  integer default 0
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

  -- Already playing? Give them the game they are in the middle of.
  select * into v_live
    from public.attempts
   where box_id = p_box and user_id = p_user and status = 'playing'
   limit 1;

  if v_live.id is not null then
    select coins into v_balance from public.profiles where id = p_user;
    return query select v_live.id, true, v_balance, null::text;
    return;
  end if;

  if p_cost > 0 then
    -- The balance check and the deduction are one statement, so a player with
    -- one coin and two tabs gets one game, not two.
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
  else
    select coins into v_balance from public.profiles where id = p_user;
    v_balance := coalesce(v_balance, 0);
  end if;

  insert into public.attempts (box_id, user_id, player_name, coins_spent)
  values (p_box, p_user, p_name, p_cost)
  returning id into v_attempt;

  update public.boxes
     set attempts_count = attempts_count + 1
   where id = p_box;

  return query select v_attempt, false, v_balance, null::text;
end;
$$;

-- A game costs nothing, so a row that does not say what it cost cost nothing.
alter table public.attempts alter column coins_spent set default 0;

revoke all on function public.start_attempt(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.start_attempt(uuid, uuid, text, integer) to service_role;
