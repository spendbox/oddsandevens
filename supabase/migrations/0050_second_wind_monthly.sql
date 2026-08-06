-- Free Second Wind comes back, once a month.
--
-- 0049 took it out of the gift rotation entirely, on the argument that two
-- migrations had just spent a lot of effort pricing free guessing and a
-- rotation handing it out on a timer gave that away. The argument was about
-- *frequency* and it was answered by removal, which is the blunt version of
-- the fix: the weekly cap it had was too generous, and nothing at all is too
-- mean. A gift that turns up once in a month is a surprise rather than a
-- supply line, and a surprise is what the rotation is for.
--
-- So it is a candidate again, capped at one claim every thirty days. The cap
-- counts `claimed_at` rather than `created_at`, like the free-lives one and for
-- the same reason: this is a limit on how much free guessing leaves the
-- building, and an offer somebody let expire cost nothing.
--
-- Still `random()` only as a tie-break among things a player has never been
-- shown — the rotation is oldest-offered-first — so "random" here means the
-- month it lands in is unpredictable, not that it fires on a coin toss.
--
-- `mint_gift` is otherwise 0049's, reproduced whole.

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
  v_allow_wind boolean;
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

  -- One free Second Wind a month. It needs a box, because a window of free
  -- guessing is a fact about one safe and there is nothing for it to apply to
  -- from the header or the profile.
  v_allow_wind := p_box_id is not null and not exists (
    select 1 from public.player_offers
     where player_id = v_player.id
       and kind = 'free_second_wind'
       and claimed_at is not null
       and claimed_at > now() - interval '30 days'
  );

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
   union all select 'free_second_wind', null where v_allow_wind
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
    when 'free_second_wind' then 1
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
