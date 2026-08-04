-- One gift at a time, ninety minutes apart, and never the same one twice.
--
-- 0035 capped the generous kinds and left the *rate* to the browser: a floor of
-- ninety seconds, eight minutes when a hunt was going fine. That is a crate
-- every few minutes on a long session, which is not a gift, it is weather. And
-- because the browser also chose what to ask for — free lives a fifth of the
-- time, a discount otherwise, cycling from index zero on every page load — a
-- player who reloads twice sees a discount on Length Lock three times running.
--
-- Both of those are decisions, and decisions belong on the server. So the whole
-- choice moves here, into one function:
--
--   * **Ninety minutes between gifts**, of any kind, full stop. The browser's
--     timer is now only a suggestion about *when* to ask.
--   * **Least recently offered wins.** Every candidate — free lives, a free
--     Second Wind, money off your next lives, and a discount on each power-up
--     still worth discounting — is ranked by when it was last put in front of
--     this player, oldest first, never-offered first of all. That is a real
--     rotation rather than a client-side counter that resets on reload.
--   * **A fourth kind**: money off your next lives, which is the only thing on
--     the list that helps a player who has run dry on a box they have already
--     bought every hint for.
--
-- The per-kind caps from 0035 survive underneath: five free-lives grants a day,
-- one free Second Wind a week. A capped kind simply isn't a candidate.

-- ---------------------------------------------------------------------------
-- 1. A fourth kind of offer
-- ---------------------------------------------------------------------------

alter table public.player_offers
  drop constraint if exists player_offers_kind_check;

alter table public.player_offers
  add constraint player_offers_kind_check
  check (kind in (
    'free_lives',
    'power_up_discount',
    'free_second_wind',
    'life_discount'
  ));

-- ---------------------------------------------------------------------------
-- 2. Picking one
-- ---------------------------------------------------------------------------

/*
 * The next gift for this player, or nothing.
 *
 * `p_power_ups` is the list of power-ups still worth discounting on this box —
 * the browser narrows it to what it can actually see for sale, which it may do
 * safely because narrowing a list of candidates can only ever offer a player
 * *less*. Every name is checked against the offers already made either way, and
 * the terms are set here rather than taken from the request.
 *
 * Returns null when the floor, a cap, or an unclaimed offer already on screen
 * says no. That is a normal answer: a player who is not due a gift has not done
 * anything wrong, and the caller shows nothing.
 */
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

  -- One free Second Wind a week, and it needs a box to be an hour *on*.
  v_allow_wind := p_box_id is not null and not exists (
    select 1 from public.player_offers
     where player_id = v_player.id
       and kind = 'free_second_wind'
       and claimed_at is not null
       and claimed_at > now() - interval '7 days'
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

-- ---------------------------------------------------------------------------
-- 3. Claiming, with the fourth kind folded in
-- ---------------------------------------------------------------------------

/*
 * Unchanged in shape from 0035; `life_discount` simply joins
 * `power_up_discount` in the branch that only *marks* a claim and restarts the
 * ten-minute redemption window. Both are spent later, by the checkout that
 * uses them.
 */
create or replace function public.claim_offer(p_email citext, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_offer public.player_offers;
  v_hunt public.hunts;
  v_until text;
begin
  v_player := public.ensure_player(p_email);

  update public.player_offers
     set claimed_at = now(),
         -- The redemption window opens now, not when this was minted.
         expires_at = case
           when kind in ('power_up_discount', 'life_discount')
             then now() + interval '10 minutes'
           else expires_at
         end
   where id = p_offer_id
     and player_id = v_player.id
     and claimed_at is null
     and expires_at > now()
  returning * into v_offer;

  if not found then
    return jsonb_build_object('result', 'error', 'error', 'offer_gone');
  end if;

  if v_offer.kind = 'free_lives' then
    -- Free lives may exceed the cap, exactly as bought ones do: they were
    -- given, not accrued, and clamping a gift to a ceiling is a way of taking
    -- part of it back.
    update public.players
       set lives = lives + v_offer.amount
     where id = v_player.id
    returning * into v_player;

    return jsonb_build_object(
      'result', 'claimed',
      'kind', v_offer.kind,
      'amount', v_offer.amount,
      'lives', v_player.lives
    );
  end if;

  if v_offer.kind = 'free_second_wind' then
    insert into public.hunts (box_id, player_id)
    values (v_offer.box_id, v_player.id)
    on conflict (box_id, player_id) do nothing;

    -- ISO 8601 with a Z, because the browser parses this string with `new
    -- Date()` and Postgres's own text form of a timestamptz is not something
    -- every engine agrees how to read.
    v_until := to_char(
      (now() + interval '1 hour') at time zone 'utc',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    );

    update public.hunts
       set revealed = jsonb_set(
             coalesce(revealed, '{}'::jsonb),
             '{secondWindUntil}',
             to_jsonb(v_until)
           )
     where box_id = v_offer.box_id
       and player_id = v_player.id
       and won_at is null
    returning * into v_hunt;

    return jsonb_build_object(
      'result', 'claimed',
      'kind', v_offer.kind,
      'amount', v_offer.amount,
      'second_wind_until', case when v_hunt.id is null then null else v_until end
    );
  end if;

  return jsonb_build_object(
    'result', 'claimed',
    'kind', v_offer.kind,
    'amount', v_offer.amount,
    'power_up', v_offer.power_up,
    'expires_at', v_offer.expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Spending a life discount
-- ---------------------------------------------------------------------------

/** What comes off this player's next lives order. 0 when there is nothing. */
create or replace function public.life_discount_for(p_player_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(amount), 0)
    from public.player_offers
   where player_id = p_player_id
     and kind = 'life_discount'
     and claimed_at is not null
     and spent_at is null
     and expires_at > now();
$$;

/** Burn it, once the order that used it exists. */
create or replace function public.spend_life_discount(p_player_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.player_offers
     set spent_at = now()
   where id = (
     select id from public.player_offers
      where player_id = p_player_id
        and kind = 'life_discount'
        and claimed_at is not null
        and spent_at is null
        and expires_at > now()
      order by amount desc
      limit 1
   );
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE restores the default EXECUTE grant to PUBLIC every time.
revoke execute on function
  public.mint_gift(citext, uuid, text[]),
  public.claim_offer(citext, uuid),
  public.life_discount_for(uuid),
  public.spend_life_discount(uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
