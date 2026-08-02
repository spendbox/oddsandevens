-- ---------------------------------------------------------------------------
-- 0014_business_profile_and_drafts: tell us about the business once, get games
-- back.
--
--   * merchants.profile — the business knowledge base. A jsonb bag (industry,
--     what they sell, who they serve, what they can give away, tone, ...) that
--     grows over time; the app scores its completeness and uses what's in it to
--     write ready-made games.
--   * games.status gains 'draft' — a game that exists, is fully configured, and
--     can be previewed and edited, but isn't shared with anyone yet. Suggested
--     games land here so a business has something to look at instead of a blank
--     builder.
--   * Drafts are free: the per-tier cap counts only games that are actually
--     playable — status 'active'. It is enforced by publish_game, which every
--     transition into 'active' goes through, so pausing a game genuinely frees
--     a slot and resuming one can't sneak past the cap.
-- ---------------------------------------------------------------------------

alter table public.merchants
  add column if not exists profile jsonb not null default '{}'::jsonb,
  add column if not exists profile_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Draft games
-- ---------------------------------------------------------------------------

alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('draft', 'active', 'paused', 'archived'));

-- Where the game came from, so the dashboard can present the ones we wrote
-- differently from the ones the business built by hand.
alter table public.games
  add column if not exists source text not null default 'manual';

alter table public.games drop constraint if exists games_source_check;
alter table public.games add constraint games_source_check
  check (source in ('manual', 'suggested'));

-- The public play endpoints already filter on status = 'active', so drafts are
-- invisible to players without any further change.

-- ---------------------------------------------------------------------------
-- create_game: now takes a status and a source. The cap counts only games that
-- are actually playable, so a business can hold as many drafts as we care to
-- write for them, and park games they aren't running.
-- ---------------------------------------------------------------------------

drop function if exists public.create_game(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb, int, int, int
);

create function public.create_game(
  p_merchant_id uuid,
  p_type text,
  p_engine text,
  p_title text,
  p_slug text,
  p_description text,
  p_config jsonb,
  p_theme jsonb,
  p_prizes jsonb,
  p_cooldown_hours int default 24,
  p_max_wins int default 1,
  p_max_score int default 100000,
  p_status text default 'active',
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_is_premium boolean;
  v_live_games int;
  v_prize_count int;
  v_real_prizes int;
  v_game_id uuid;
  v_slug text;
  v_status text;
  v_source text;
  v_prize jsonb;
  v_pos int := 0;
begin
  select * into v_merchant from merchants where id = p_merchant_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  if p_title is null or char_length(trim(p_title)) = 0 then
    return jsonb_build_object('result', 'error', 'error', 'title_required');
  end if;

  v_status := case when p_status in ('draft', 'active', 'paused') then p_status else 'active' end;
  v_source := case when p_source = 'suggested' then 'suggested' else 'manual' end;

  v_slug := lower(trim(coalesce(p_slug, '')));
  if v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('result', 'error', 'error', 'invalid_slug');
  end if;
  if exists (select 1 from games where merchant_id = p_merchant_id and slug = v_slug) then
    return jsonb_build_object('result', 'error', 'error', 'slug_taken');
  end if;

  v_is_premium := v_merchant.subscription_tier = 'premium'
    and v_merchant.premium_expires_at is not null
    and v_merchant.premium_expires_at > now();

  -- Only games a customer could actually play count against the plan.
  select count(*) into v_live_games
    from games
   where merchant_id = p_merchant_id and status = 'active';

  v_prize_count := coalesce(jsonb_array_length(p_prizes), 0);
  select count(*) into v_real_prizes
    from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb)) p
   where coalesce(p->>'kind', 'prize') = 'prize';

  if not v_is_premium then
    if v_status <> 'draft' and v_live_games >= 2 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_games');
    end if;
    if v_real_prizes > 2 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
    end if;
  else
    if v_real_prizes > 10 then
      return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
    end if;
  end if;

  if v_prize_count > 24 then
    return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
  end if;

  if p_engine = 'chance' and v_prize_count < 1 then
    return jsonb_build_object('result', 'error', 'error', 'no_prizes');
  end if;

  insert into games (
    merchant_id, slug, type, engine, title, description, config, theme,
    cooldown_hours, max_wins_per_player, max_score, status, source
  )
  values (
    p_merchant_id,
    v_slug,
    p_type,
    p_engine,
    left(trim(p_title), 80),
    left(nullif(trim(coalesce(p_description, '')), ''), 300),
    coalesce(p_config, '{}'::jsonb),
    coalesce(p_theme, '{}'::jsonb),
    least(greatest(coalesce(p_cooldown_hours, 24), 0), 720),
    least(greatest(coalesce(p_max_wins, 1), 1), 100),
    least(greatest(coalesce(p_max_score, 100000), 1), 100000000),
    v_status,
    v_source
  )
  returning id into v_game_id;

  for v_prize in select * from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb))
  loop
    insert into game_prizes (
      game_id, kind, description, details, icon, expiry_days, stock, weight,
      min_score, position
    )
    values (
      v_game_id,
      case when coalesce(v_prize->>'kind', 'prize') = 'blank' then 'blank' else 'prize' end,
      left(coalesce(nullif(trim(coalesce(v_prize->>'description', '')), ''), 'Prize'), 200),
      left(nullif(trim(coalesce(v_prize->>'details', '')), ''), 300),
      left(nullif(trim(coalesce(v_prize->>'icon', '')), ''), 40),
      least(greatest(coalesce((v_prize->>'expiry_days')::int, 30), 1), 60),
      -- A blank has no stock to run out of; it is always in the draw pool.
      case
        when coalesce(v_prize->>'kind', 'prize') = 'blank' then 0
        else least(greatest(coalesce((v_prize->>'stock')::int, 1), 1), 100000)
      end,
      least(greatest(coalesce((v_prize->>'weight')::int, 1), 0), 10000),
      greatest(coalesce((v_prize->>'min_score')::int, 0), 0),
      v_pos
    );
    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object(
    'result', 'created',
    'game_id', v_game_id,
    'slug', v_slug,
    'status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- publish_game: take a draft (or a paused game) live. Every route into
-- 'active' goes through here, which is what makes the per-tier cap airtight:
-- drafts and paused games are free to hold, and only playable games count.
-- ---------------------------------------------------------------------------

create or replace function public.publish_game(
  p_merchant_id uuid,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_game games%rowtype;
  v_is_premium boolean;
  v_live_games int;
begin
  select * into v_merchant from merchants where id = p_merchant_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select * into v_game from games
   where id = p_game_id and merchant_id = p_merchant_id
   for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'game_not_found');
  end if;

  if v_game.status = 'active' then
    return jsonb_build_object('result', 'published', 'slug', v_game.slug);
  end if;
  if v_game.status = 'archived' then
    return jsonb_build_object('result', 'error', 'error', 'game_archived');
  end if;

  v_is_premium := v_merchant.subscription_tier = 'premium'
    and v_merchant.premium_expires_at is not null
    and v_merchant.premium_expires_at > now();

  select count(*) into v_live_games
    from games
   where merchant_id = p_merchant_id
     and status = 'active'
     and id <> p_game_id;

  if not v_is_premium and v_live_games >= 2 then
    return jsonb_build_object(
      'result', 'error',
      'error', 'too_many_games',
      'live_games', v_live_games
    );
  end if;

  update games
     set status = 'active', updated_at = now()
   where id = p_game_id;

  return jsonb_build_object('result', 'published', 'slug', v_game.slug);
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only.
-- ---------------------------------------------------------------------------

revoke execute on function public.create_game(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb, int, int, int, text, text
) from public, anon, authenticated;

revoke execute on function public.publish_game(uuid, uuid)
  from public, anon, authenticated;
