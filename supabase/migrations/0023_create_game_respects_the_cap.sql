-- ---------------------------------------------------------------------------
-- 0023_create_game_respects_the_cap: one live game on free actually means one.
--
-- 0019 moved the free-tier cap into app_settings and taught publish_game to
-- read it. It did not touch create_game, which had its own hardcoded `>= 2`
-- and inserts a game with status 'active' directly — so a free business could
-- create its way past a limit it could not publish its way past. The two are
-- one rule now, read from one place.
--
-- Same story with the payout account: 0021 made publish_game refuse without
-- one, and create_game went on making live games regardless.
--
-- And the podium: the free tier was capped at two prizes here while the
-- dashboard offers ten on both tiers. Prizes were never what Premium sells.
-- The cap is a setting too, so a promotion doesn't need a migration.
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value)
values ('max_podium_places', to_jsonb(10))
on conflict (key) do nothing;

create or replace function public.create_game(
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
  p_source text default 'manual',
  p_award_mode text default 'leaderboard',
  p_season_days int default 7,
  p_daily_lives int default 3,
  p_max_bonus_lives int default 3
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
  v_cap int;
  v_prize_cap int;
  v_prize_count int;
  v_real_prizes int;
  v_game_id uuid;
  v_slug text;
  v_status text;
  v_source text;
  v_award_mode text;
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
  v_award_mode := case when p_award_mode = 'instant' then 'instant' else 'leaderboard' end;

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

  select count(*) into v_live_games
    from games
   where merchant_id = p_merchant_id and status = 'active';

  v_prize_count := coalesce(jsonb_array_length(p_prizes), 0);
  select count(*) into v_real_prizes
    from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb)) p
   where coalesce(p->>'kind', 'prize') = 'prize';

  -- The same cap publish_game reads, from the same place. It used to be a 2
  -- written into this function, which is how a free business ended up with two
  -- live games: publishing was capped at one and creating was capped at two.
  select coalesce(
    (select (value #>> '{}')::int from app_settings where key = 'free_live_games'), 1
  ) into v_cap;

  select coalesce(
    (select (value #>> '{}')::int from app_settings where key = 'max_podium_places'), 10
  ) into v_prize_cap;

  if not v_is_premium and v_status <> 'draft' and v_live_games >= v_cap then
    return jsonb_build_object(
      'result', 'error',
      'error', 'too_many_games',
      'live_games', v_live_games,
      'max_games', v_cap
    );
  end if;

  -- The podium is the same length on both tiers. A two-place podium is a worse
  -- competition, and a worse competition is a worse product; what Premium buys
  -- is more games, not a longer podium.
  if v_real_prizes > v_prize_cap then
    return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
  end if;

  -- Live means it can sell extra plays from the first tap, and taking a
  -- player's money with nowhere to send the business's half is the one failure
  -- here that would be somebody else's money. Drafts are fine without it.
  if v_status <> 'draft' and v_merchant.paystack_subaccount_code is null then
    return jsonb_build_object('result', 'error', 'error', 'no_payout_account');
  end if;

  if v_prize_count > 24 then
    return jsonb_build_object('result', 'error', 'error', 'too_many_prizes');
  end if;

  -- A leaderboard game needs somewhere for the prizes to land; a chance game
  -- needs something to land on.
  if v_real_prizes < 1 and (v_award_mode = 'leaderboard' or p_engine = 'chance') then
    return jsonb_build_object('result', 'error', 'error', 'no_prizes');
  end if;

  insert into games (
    merchant_id, slug, type, engine, title, description, config, theme,
    cooldown_hours, max_wins_per_player, max_score, status, source,
    award_mode, season_days, daily_lives, max_bonus_lives
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
    v_source,
    v_award_mode,
    least(greatest(coalesce(p_season_days, 7), 1), 90),
    least(greatest(coalesce(p_daily_lives, 3), 1), 20),
    least(greatest(coalesce(p_max_bonus_lives, 3), 0), 20)
  )
  returning id into v_game_id;

  for v_prize in select * from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb))
  loop
    insert into game_prizes (
      game_id, kind, description, details, icon, expiry_days, stock, weight,
      min_score, award_rank, position
    )
    values (
      v_game_id,
      case when coalesce(v_prize->>'kind', 'prize') = 'blank' then 'blank' else 'prize' end,
      left(coalesce(nullif(trim(coalesce(v_prize->>'description', '')), ''), 'Prize'), 200),
      left(nullif(trim(coalesce(v_prize->>'details', '')), ''), 300),
      left(nullif(trim(coalesce(v_prize->>'icon', '')), ''), 40),
      least(greatest(coalesce((v_prize->>'expiry_days')::int, 30), 1), 60),
      case
        when coalesce(v_prize->>'kind', 'prize') = 'blank' then 0
        else least(greatest(coalesce((v_prize->>'stock')::int, 1), 1), 100000)
      end,
      least(greatest(coalesce((v_prize->>'weight')::int, 1), 0), 10000),
      greatest(coalesce((v_prize->>'min_score')::int, 0), 0),
      case
        when v_award_mode = 'leaderboard'
          then least(greatest(coalesce((v_prize->>'award_rank')::int, v_pos + 1), 1), 100)
        else null
      end,
      v_pos
    );
    v_pos := v_pos + 1;
  end loop;

  -- Open the first week straight away so the board exists from the off.
  if v_award_mode = 'leaderboard' then
    perform ensure_game_season(v_game_id);
  end if;

  return jsonb_build_object(
    'result', 'created',
    'game_id', v_game_id,
    'slug', v_slug,
    'status', v_status
  );
end;
$$;


revoke execute on function public.create_game(
  uuid, text, text, text, text, text, jsonb, jsonb, jsonb, int, int, int, text, text,
  text, int, int, int
) from public, anon, authenticated;
