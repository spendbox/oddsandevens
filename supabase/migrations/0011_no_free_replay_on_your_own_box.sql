-- ---------------------------------------------------------------------------
-- A run at your own box comes with no free replay.
--
-- One free replay is there so that a single unlucky level does not end a run
-- somebody was winning. In your own box it is something else: the creator is
-- paid ₦100,000 when the box is beaten, so a free extra go at beating it
-- themselves is the platform paying for a second run at its own prize. They
-- may still play, and still pay to carry on from a level like anybody else.
--
-- How many the run gets is decided by `freeReplaysFor` in src/lib/money.ts and
-- passed in, exactly the way the price of a game and the price of a retry are.
-- The browser is never asked. It could name any number it liked, and the rule
-- is worth more than the round trip it would save.
--
-- The four-argument version is dropped rather than left beside this one: two
-- functions of the same name, one callable with four arguments and one with
-- five, is an ambiguous call for anything asking by argument name. Dropping it
-- is safe in both deploy orders — `p_replays` defaults to one, so a copy of the
-- app that has not been updated yet still opens runs, with the old behaviour,
-- until it is.
-- ---------------------------------------------------------------------------
drop function if exists public.start_attempt(uuid, uuid, text, integer);

create or replace function public.start_attempt(
  p_box     uuid,
  p_user    uuid,
  p_name    text,
  p_cost    integer default 0,
  p_replays integer default 1
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

  -- greatest() rather than a check that raises: the column refuses a negative
  -- and a run that cannot be opened is a worse answer than a run with none.
  insert into public.attempts (box_id, user_id, player_name, coins_spent, replays_left)
  values (p_box, p_user, p_name, p_cost, greatest(coalesce(p_replays, 1), 0))
  returning id into v_attempt;

  update public.boxes
     set attempts_count = attempts_count + 1
   where id = p_box;

  return query select v_attempt, false, v_balance, null::text;
end;
$$;

revoke all on function public.start_attempt(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.start_attempt(uuid, uuid, text, integer, integer) to service_role;
