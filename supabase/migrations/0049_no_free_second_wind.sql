-- Second Wind stops being something you can be given.
--
-- The gift rotation handed out four things, and one of them was a free window
-- of unlimited guessing on the box in front of you. That made sense when the
-- window was an hour and Second Wind was a convenience. It does not now.
--
-- 0042 and 0047 spent two migrations arguing that free guessing is a great deal
-- of the game for half a percent of the reward, and cut the window to a quarter
-- of what it was so that buying it had to be *aimed*. A rotation that then
-- hands the same thing out for nothing, on a timer, to a player who has not
-- decided anything, gives away exactly what those two migrations were pricing.
-- The other three gifts don't have this problem: lives are the resource the
-- game already refills for free, and the two discounts are money off a decision
-- the player still has to make.
--
-- So it leaves the rotation, and nothing else about it changes. The kind stays
-- legal in the check constraint and `claim_offer` still honours it, because
-- offers already minted are sitting unclaimed on somebody's screen with ten
-- minutes on the clock, and a gift that vanishes when you reach for it is worse
-- than the gift never having been offered. They simply stop being made.
--
-- The weekly cap goes with it — a limit on how often a thing may happen is
-- dead weight once the thing cannot happen — and `mint_gift` is otherwise
-- 0036's, reproduced whole: a function is replaced entire or not at all.

create or replace function public.mint_gift(
  p_email citext,
  p_box_id uuid default null,
  p_power_ups text[] default '{}'
)
returns public.player_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_offer public.player_offers;
  v_kind text;
  v_power_up text;
  v_amount int;
  v_allow_lives boolean;
begin
  v_player := public.ensure_player(p_email);

  -- Something already waiting is something the player is looking at. Hand it
  -- back rather than deciding again.
  select * into v_offer from public.player_offers
   where player_id = v_player.id and claimed_at is null and expires_at > now()
   limit 1;
  if found then
    return v_offer;
  end if;

  -- The floor, and it counts every kind. Ninety minutes between gifts, whether
  -- the last one was taken or waved away — the limit is on how often a player
  -- is interrupted, and an interruption they declined still happened.
  perform 1 from public.player_offers
   where player_id = v_player.id
     and created_at > now() - interval '90 minutes';
  if found then
    return null;
  end if;

  -- Five free-lives grants in a day. Counted on `claimed_at`, because this one
  -- is a limit on how many lives leave the building.
  v_allow_lives := (
    select count(*) from public.player_offers
     where player_id = v_player.id
       and kind = 'free_lives'
       and claimed_at is not null
       and claimed_at > now() - interval '24 hours'
  ) < 5;

  /*
   * The rotation.
   *
   * Every candidate joined to when it was last offered to this player, oldest
   * first, with never-offered ahead of everything. `random()` only breaks ties
   * — among candidates the player has genuinely never seen — so a new player's
   * first few gifts are varied and a long-running player's are a strict cycle.
   */
  select c.kind, c.power_up
    into v_kind, v_power_up
    from (
             select 'free_lives'::text as kind, null::text as power_up where v_allow_lives
   union all select 'life_discount', null
   union all select 'power_up_discount', p
               from unnest(p_power_ups) p
              where p_box_id is not null and p is not null
    ) c
    left join lateral (
      select max(o.created_at) as at
        from public.player_offers o
       where o.player_id = v_player.id
         and o.kind = c.kind
         and (c.power_up is null or o.power_up = c.power_up)
    ) seen on true
   order by seen.at asc nulls first, random()
   limit 1;

  if v_kind is null then
    return null;
  end if;

  v_amount := case v_kind
    when 'free_lives' then 1 + floor(random() * 3)::int
    else (array[20, 25, 30, 40, 50])[1 + floor(random() * 5)::int]
  end;

  insert into public.player_offers (player_id, kind, amount, power_up, box_id, expires_at)
  values (
    v_player.id,
    v_kind,
    v_amount,
    v_power_up,
    -- A life discount travels with the player, not the box: lives bought
    -- anywhere work everywhere, so pinning one to a safe would be a rule the
    -- rest of the economy doesn't have.
    case when v_kind = 'life_discount' then null else p_box_id end,
    now() + interval '10 minutes'
  )
  returning * into v_offer;

  return v_offer;
end;
$$;

-- CREATE OR REPLACE restores the default EXECUTE grant to PUBLIC every time.
revoke execute on function public.mint_gift(citext, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.mint_gift(citext, uuid, text[]) to service_role;

notify pgrst, 'reload schema';
