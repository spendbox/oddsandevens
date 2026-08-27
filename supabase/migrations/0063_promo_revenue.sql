-- ---------------------------------------------------------------------------
-- What a promo safe is worth to us
-- ---------------------------------------------------------------------------
--
-- Platform revenue is totalled from three streams: our cut of what is funded
-- behind a box, our share of every power-up, and our share of every life. The
-- funding cut is read off `boxes.platform_fee_kobo`, for boxes with a paid
-- funding order behind them — and 0059 wrote a promo safe with that column at
-- zero. So every promo price a contributor has paid arrived through the
-- ordinary funding checkout, settled the box to 'live', and then counted for
-- nothing: the Money screen has been reporting a stream of income as ₦0.
--
-- Zero was the wrong number for a defensible reason. On an ordinary box the
-- fee is what we hold *back* out of funding that would otherwise be the
-- reward, so a fee against a promo safe reads at first like keeping back part
-- of somebody's prize. But a promo safe's prize is not funded by what was paid
-- for it. The pot is ours and comes from `promo_config()`; the price is a fee
-- for the promotion and buys no part of the reward. The whole of it is ours,
-- which makes `platform_fee_kobo = funding_kobo` the honest row and leaves
-- `reward_kobo` — the part that is not ours — exactly as unrelated to both as
-- it has always been.
--
-- What we are exposed to is not netted off here and never was: the pot behind
-- a live promo safe is carried in `admin_promo_exposure`, and lands on
-- "rewards owed" the moment one is actually cracked.

-- ---------------------------------------------------------------------------
-- New ones
-- ---------------------------------------------------------------------------

/*
 * 0060's `create_promo_box`, with the fee recorded.
 *
 * Copied forward whole rather than patched, because there is no way to change
 * one column of an insert in place — and the only line that differs from 0060
 * is `v_cfg.price_kobo` where the fee used to be a literal zero.
 */
create or replace function public.create_promo_box(
  p_contributor_id uuid,
  p_title text default null,
  p_design text default 'midnight'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_avail record;
  v_name record;
  v_box public.boxes;
  v_title text;
  v_design text;
  v_slug text;
  -- Drawn once. Two calls to a volatile generator are two different passwords
  -- of two different lengths, and `boxes_secret_length` requires them to agree.
  v_secret text;
begin
  if p_contributor_id is null then
    return jsonb_build_object('result', 'error', 'error', 'no_contributor');
  end if;

  select * into v_cfg from public.promo_config();
  select * into v_avail from public.promo_availability();

  if not v_cfg.enabled then
    return jsonb_build_object('result', 'error', 'error', 'disabled');
  end if;
  if v_avail.remaining <= 0 then
    return jsonb_build_object('result', 'error', 'error', 'sold_out');
  end if;
  if exists (
    select 1 from public.boxes
     where kind = 'promo' and status in ('funding', 'live')
       and contributor_id = p_contributor_id
  ) then
    return jsonb_build_object('result', 'error', 'error', 'already_have_one');
  end if;

  -- An empty or absent title falls back to a drawn one rather than failing:
  -- somebody who does not care what it is called should still get a safe.
  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    select * into v_name from public.new_promo_name();
    v_title := v_name.title;
  end if;
  v_title := substr(v_title, 1, 70);

  -- Checked here rather than trusted from the caller: `boxes_design_check`
  -- would otherwise turn a bad value into a constraint violation the screen
  -- cannot explain.
  v_design := lower(coalesce(p_design, 'midnight'));
  if v_design not in ('brass', 'vault', 'midnight', 'emerald', 'crimson', 'ivory') then
    v_design := 'midnight';
  end if;

  v_slug := public.promo_slug(v_title);
  v_secret := public.new_promo_password();

  insert into public.boxes (
    kind, contributor_id, slug, title, blurb,
    secret, length,
    funding_kobo, reward_kobo, platform_fee_kobo,
    status, design
  )
  values (
    'promo', p_contributor_id, v_slug, v_title,
    'A promo safe. Nobody has ever seen this password — it was drawn by the database and read by no one.',
    v_secret, char_length(v_secret),
    -- What they pay, what a winner gets, and what we keep. The first and the
    -- last are the same figure because the middle one is ours to find, not
    -- theirs to fund — which is the whole of the promotion.
    v_cfg.price_kobo, v_cfg.pot_kobo, v_cfg.price_kobo,
    'funding', v_design
  )
  returning * into v_box;

  return jsonb_build_object(
    'result', 'created',
    'id', v_box.id,
    'slug', v_box.slug,
    'title', v_box.title,
    'length', v_box.length,
    'price_kobo', v_cfg.price_kobo,
    'reward_kobo', v_box.reward_kobo
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The ones already up
-- ---------------------------------------------------------------------------

/*
 * Backfilled from the row's own `funding_kobo`, not from today's
 * `promo_config()`: the price is captured on the box when it is drawn and the
 * funding order charges that captured figure, so a safe put up before an admin
 * changed the price is worth what it was sold for, not what the next one costs.
 *
 * Every kind of promo row is corrected, including 'funding' — an unpaid box
 * contributes nothing to revenue either way, since the total counts boxes with
 * a paid order behind them, and leaving it at zero would only mean the number
 * being wrong again the moment that payment landed.
 *
 * Only a zero is corrected, and the zero is what identifies the row: it is
 * what `create_promo_box` wrote, and nothing else writes this column on a
 * promo safe except `raise_reward` — which, until the refusal below, the
 * dashboard would let somebody reach. A promo safe that was raised already has
 * a real 30/70 split recorded against a reward that was really re-derived, and
 * overwriting *that* with the whole total would count reward money as ours.
 * Such a row is a mangled box either way, but this is not the migration to
 * decide what its pot should have been.
 */
update public.boxes
   set platform_fee_kobo = funding_kobo
 where kind = 'promo' and platform_fee_kobo = 0 and funding_kobo > 0;

-- ---------------------------------------------------------------------------
-- And nothing may quietly undo it
-- ---------------------------------------------------------------------------

/*
 * `raise_reward` refuses a promo safe.
 *
 * It is 0025's function with one condition added, and the condition matters
 * beyond bookkeeping. Raising re-derives the reward as 70% of the new total —
 * on a promo safe that would take a ₦100,000 pot, advertised to everyone
 * hunting it, and *lower* it to seventy percent of a few thousand naira, while
 * overwriting the fee this migration just made true. The Raise button on a
 * live box is offered by the dashboard for every box a contributor owns, so
 * this is reachable rather than theoretical, and the refusal belongs here
 * where the reward is actually written.
 */
create or replace function public.raise_reward(p_box_id uuid, p_funding_kobo bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.boxes;
  v_platform bigint;
  v_reward bigint;
begin
  select * into v_box from public.boxes where id = p_box_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'box_not_found');
  end if;
  if v_box.kind = 'promo' then
    return jsonb_build_object('result', 'error', 'error', 'promo_not_raisable');
  end if;
  if p_funding_kobo <= v_box.funding_kobo then
    return jsonb_build_object('result', 'error', 'error', 'not_an_increase');
  end if;
  if v_box.status not in ('live', 'funding') then
    return jsonb_build_object('result', 'error', 'error', 'box_not_open');
  end if;

  -- Rounding goes to the platform so the advertised reward is never short.
  v_platform := ceil(p_funding_kobo * 30.0 / 100.0);
  v_reward := p_funding_kobo - v_platform;

  update public.boxes
     set funding_kobo = p_funding_kobo,
         reward_kobo = v_reward,
         platform_fee_kobo = v_platform
   where id = p_box_id;

  return jsonb_build_object('result', 'raised', 'reward_kobo', v_reward);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
--
-- `create or replace` keeps the ACL it found, so these restate rather than
-- change anything. They are here so that a function's reachable callers can be
-- read off the migration that last defined it.

revoke execute on function public.create_promo_box(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.raise_reward(uuid, bigint) from public, anon, authenticated;

notify pgrst, 'reload schema';
