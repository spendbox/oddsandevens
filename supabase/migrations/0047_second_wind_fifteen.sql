-- Second Wind is a quarter of an hour.
--
-- 0042 halved it from an hour to thirty minutes on the argument that unlimited
-- free guessing is a great deal of the game for half a percent of the reward.
-- That was right and it was not enough: halving the window without touching the
-- price only doubled what the grind costs, and thirty minutes of a fast finger
-- is still long enough to walk an alphabet through a position — which is the
-- shape of play Second Wind was never meant to fund.
--
-- Fifteen makes the purchase something you have to aim. You buy it holding a
-- hypothesis you want to test right now, rather than as a general licence to
-- grind, and that is what it was always for: a way out of waiting an hour for a
-- life when you are three characters from the answer.
--
-- The price is unchanged, so this is another doubling of the cost of that
-- route. The paid Second Wind is `apply()` in `power-ups.ts`, keyed off
-- `SECOND_WIND_MINUTES`; this is the other one — the free Second Wind a gift
-- can hand out — and the two must not disagree, because they write the same
-- field on the same hunt.
--
-- Only the interval changes. The rest of `claim_offer` is 0042's, reproduced
-- verbatim: a function is replaced whole or not at all.

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
      (now() + interval '15 minutes') at time zone 'utc',
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

-- `create or replace` keeps an existing function's grants, but say it anyway:
-- this file may be the first thing to create it on a database rebuilt from
-- scratch, and a new function is EXECUTE to PUBLIC.
revoke execute on function public.claim_offer(citext, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_offer(citext, uuid) to service_role;

notify pgrst, 'reload schema';
