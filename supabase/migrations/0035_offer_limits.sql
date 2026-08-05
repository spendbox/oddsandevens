-- Putting a ceiling on the things that fall out of the sky.
--
-- 0034 built drops with one rule: only one unclaimed offer at a time. That is
-- enough to stop a browser minting a hundred of them in a loop and not nearly
-- enough to stop a patient player farming free lives all afternoon — an offer
-- expires in ten minutes, so "one at a time" permits six an hour, forever.
--
-- So the economy gets actual limits, and they live here rather than in the
-- route, because a limit enforced in TypeScript is a limit enforced in one of
-- the places that can mint an offer.
--
--   Free lives      one *offer* an hour, and at most five *claimed* in a day.
--   Second Wind     free once a week, and it is an hour on one box.
--   Discounts       unchanged in frequency, but the ten minutes now runs from
--                   when it is claimed rather than from when it was minted.
--
-- That last one is a fix, not a policy. A discount minted at 12:00 expired at
-- 12:10 whether it was claimed at 12:01 or 12:09, so a player who took one
-- late got a coupon with forty seconds on it — and no way to tell, because the
-- crate showed the countdown to the *mint* expiry. The clock starts on claim
-- now, which is the only reading of "ten minutes to redeem it" that is true.

-- ---------------------------------------------------------------------------
-- 1. A third kind of offer
-- ---------------------------------------------------------------------------

alter table public.player_offers
  drop constraint if exists player_offers_kind_check;

alter table public.player_offers
  add constraint player_offers_kind_check
  check (kind in ('free_lives', 'power_up_discount', 'free_second_wind'));

-- Second Wind is an hour *on one box*, so an offer of one without a box to
-- spend it on is not an offer, it is a row that can never be claimed.
alter table public.player_offers
  drop constraint if exists player_offers_wind_needs_box;

alter table public.player_offers
  add constraint player_offers_wind_needs_box
  check (kind <> 'free_second_wind' or box_id is not null);

-- The read every cap below makes: this player, this kind, recently.
create index if not exists player_offers_rate_idx
  on public.player_offers (player_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Minting, with the caps applied
-- ---------------------------------------------------------------------------

/*
 * Mint one, unless there is already one waiting, and unless this player has
 * had their share.
 *
 * Returns null when a cap says no. The caller is expected to treat that as
 * "nothing to offer right now" and either fall back to a kind that isn't
 * capped or show nothing at all — never as an error, because a player who is
 * simply not due a gift has not done anything wrong.
 *
 * The caps are checked *after* the existing-offer lookup on purpose. An offer
 * already on screen is one the player is looking at; refusing to hand it back
 * because a window has since closed would make a live crate vanish mid-tap.
 */
create or replace function public.mint_offer(
  p_email citext,
  p_kind text,
  p_amount int,
  p_power_up text default null,
  p_box_id uuid default null,
  p_minutes int default 10
)
returns public.player_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_offer public.player_offers;
  v_claimed int;
begin
  v_player := public.ensure_player(p_email);

  select * into v_offer from public.player_offers
   where player_id = v_player.id and claimed_at is null and expires_at > now()
   limit 1;
  if found then
    return v_offer;
  end if;

  if p_kind = 'free_lives' then
    -- One popup an hour. Counted on `created_at`, so a crate that was ignored
    -- still spends the hour — the limit is on how often a player is
    -- *interrupted*, and an interruption they declined still happened.
    perform 1 from public.player_offers
     where player_id = v_player.id
       and kind = 'free_lives'
       and created_at > now() - interval '1 hour';
    if found then
      return null;
    end if;

    -- And five actually taken in a day. Counted on `claimed_at`, because this
    -- one is a limit on how many lives leave the building.
    select count(*) into v_claimed from public.player_offers
     where player_id = v_player.id
       and kind = 'free_lives'
       and claimed_at is not null
       and claimed_at > now() - interval '24 hours';
    if v_claimed >= 5 then
      return null;
    end if;

  elsif p_kind = 'free_second_wind' then
    if p_box_id is null then
      return null;
    end if;

    -- One a week, and not twice in an hour even if the first was waved away.
    perform 1 from public.player_offers
     where player_id = v_player.id
       and kind = 'free_second_wind'
       and (
         (claimed_at is not null and claimed_at > now() - interval '7 days')
         or created_at > now() - interval '1 hour'
       );
    if found then
      return null;
    end if;
  end if;

  insert into public.player_offers (player_id, kind, amount, power_up, box_id, expires_at)
  values (
    v_player.id, p_kind, p_amount,
    case when p_kind = 'power_up_discount' then p_power_up else null end,
    p_box_id,
    now() + make_interval(mins => greatest(1, p_minutes))
  )
  returning * into v_offer;

  return v_offer;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Claiming
-- ---------------------------------------------------------------------------

/*
 * Claim one.
 *
 * Three shapes now:
 *
 *   free_lives         credited immediately. There is nothing to check out,
 *                      and a free thing that takes you to a payment screen is
 *                      not free.
 *   free_second_wind   an hour of free guessing on the box it was minted
 *                      against, written straight into that hunt's revealed
 *                      state — the same field a paid Second Wind writes, so
 *                      the scoring path needs no special case for it.
 *   power_up_discount  only *marked* claimed. It is spent later, by the
 *                      power-up route, when an order that uses it is created.
 *                      Its ten minutes start here.
 *
 * The update is conditional on `claimed_at is null`, so two taps race to one
 * winner and the second gets nothing back.
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
           when kind = 'power_up_discount' then now() + interval '10 minutes'
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
-- Privileges
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE restores the default EXECUTE grant to PUBLIC every time.
revoke execute on function
  public.mint_offer(citext, text, int, text, uuid, int),
  public.claim_offer(citext, uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
