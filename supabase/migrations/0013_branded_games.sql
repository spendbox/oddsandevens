-- ---------------------------------------------------------------------------
-- 0013_branded_games: the branded games platform.
--
-- Until now a merchant had exactly one kind of game: the tile grid. This
-- migration generalises "a shareable branded game" into its own object so a
-- business can spin up a wheel, a scratch card, a quiz, an arcade game, ...
-- from the dashboard and share one link per game.
--
-- Every game reduces to one of two award engines:
--
--   * 'chance' — the server draws a weighted segment (wheel, scratch card,
--     mystery box, advent door). The client only animates to the result, so
--     the odds live entirely in Postgres and never reach the browser.
--   * 'score'  — the player plays, the client submits a score, and the server
--     awards the best prize whose min_score the score clears (arcade, quiz,
--     memory, puzzle...).
--
-- Winning mints exactly the same one-time redemption code as a grid tile, so
-- the existing staff redeem box, /me portal, and expiry rules work unchanged.
--
-- Anti-cheat: a play must be opened with start_game_play (which issues a
-- single-use token and stamps the per-game cooldown) before finish_game_play
-- will grade it. Scores are clamped to the game's configured max, so a forged
-- score can never beat the honest ceiling.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  -- Per-merchant path segment: /p/<merchant slug>/<game slug>
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  type text not null check (type in (
    'spin-wheel',
    'scratch-card',
    'mystery-box',
    'advent-calendar',
    'endless-runner',
    'falling-catcher',
    'slice-ninja',
    'tile-merge',
    'recommender-quiz',
    'myth-fact',
    'memory-match',
    'lookbook',
    'leaderboard-trivia',
    'scavenger-hunt',
    'bracket-poll',
    'whack-a-mole',
    'flappy',
    'jigsaw',
    'spot-difference',
    'tic-tac-toe'
  )),
  engine text not null check (engine in ('chance', 'score')),
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 300),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  -- Everything type-specific: questions, board size, speed, artwork, ...
  config jsonb not null default '{}'::jsonb,
  -- Presentation overrides (accent colour, hero image); falls back to brand.
  theme jsonb not null default '{}'::jsonb,
  -- Replay cooldown per player, 0 = replay freely.
  cooldown_hours int not null default 24 check (cooldown_hours between 0 and 720),
  -- How many prizes one player may ever win from this game.
  max_wins_per_player int not null default 1 check (max_wins_per_player between 1 and 100),
  -- Highest score the server will accept (forged submissions get clamped).
  max_score int not null default 100000 check (max_score > 0),
  plays_count int not null default 0,
  wins_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, slug)
);

create index if not exists games_merchant_idx on public.games (merchant_id, created_at desc);

-- A prize slot. 'blank' rows are the losing segments of a chance game: they
-- are drawn and shown (so a wheel looks honest) but award nothing.
create table if not exists public.game_prizes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  kind text not null default 'prize' check (kind in ('prize', 'blank')),
  description text not null check (char_length(description) between 1 and 200),
  details text check (char_length(details) <= 300),
  icon text check (char_length(icon) <= 40),
  expiry_days int not null default 30 check (expiry_days between 1 and 60),
  -- Total claimable copies for the whole game; claimed counts what's gone.
  stock int not null default 1 check (stock between 0 and 100000),
  claimed int not null default 0 check (claimed >= 0),
  -- Chance engine: relative draw weight. Score engine: the score to clear.
  weight int not null default 1 check (weight between 0 and 10000),
  min_score int not null default 0 check (min_score >= 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists game_prizes_game_idx on public.game_prizes (game_id, position);

-- One row per play attempt: opened by start_game_play, graded by
-- finish_game_play. Doubles as the leaderboard and the per-game stats source.
create table if not exists public.game_plays (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  -- Single-use handle the client presents when submitting its score.
  token uuid not null unique default gen_random_uuid(),
  score int not null default 0,
  won boolean not null default false,
  prize_id uuid references public.game_prizes (id) on delete set null,
  unlocked_reward_id uuid references public.unlocked_rewards (id) on delete set null,
  -- Free-form per-type payload (quiz answers, bracket votes, hunt codes).
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists game_plays_game_idx on public.game_plays (game_id, finished_at desc);
create index if not exists game_plays_board_idx on public.game_plays (game_id, score desc)
  where finished_at is not null;
create index if not exists game_plays_customer_idx on public.game_plays (customer_id, game_id);

-- Game wins ride the same one-time-code rail as tile wins.
alter table public.unlocked_rewards
  add column if not exists game_prize_id uuid references public.game_prizes (id) on delete set null;

alter table public.unlocked_rewards drop constraint if exists unlocked_rewards_reward_type_check;
alter table public.unlocked_rewards add constraint unlocked_rewards_reward_type_check
  check (reward_type in ('tile', 'loyalty_discount', 'game'));

-- ---------------------------------------------------------------------------
-- Privileges + RLS — merchants read their own; every write is service role.
-- ---------------------------------------------------------------------------

revoke all on public.games, public.game_prizes, public.game_plays
  from anon, authenticated;

grant select on public.games, public.game_prizes, public.game_plays to authenticated;

alter table public.games enable row level security;
alter table public.game_prizes enable row level security;
alter table public.game_plays enable row level security;

drop policy if exists games_owner_select on public.games;
create policy games_owner_select on public.games
  for select to authenticated
  using (merchant_id in (select id from public.merchants where owner_id = (select auth.uid())));

drop policy if exists game_prizes_owner_select on public.game_prizes;
create policy game_prizes_owner_select on public.game_prizes
  for select to authenticated
  using (game_id in (
    select g.id from public.games g
    join public.merchants m on m.id = g.merchant_id
    where m.owner_id = (select auth.uid())
  ));

drop policy if exists game_plays_owner_select on public.game_plays;
create policy game_plays_owner_select on public.game_plays
  for select to authenticated
  using (merchant_id in (select id from public.merchants where owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- create_game: validates tier caps and writes the game + its prize slots in
-- one transaction. p_prizes is a jsonb array of
--   { kind, description, details, icon, expiry_days, stock, weight, min_score }
-- ---------------------------------------------------------------------------

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
  p_max_score int default 100000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_is_premium boolean;
  v_active_games int;
  v_prize_count int;
  v_real_prizes int;
  v_game_id uuid;
  v_slug text;
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

  select count(*) into v_active_games
    from games where merchant_id = p_merchant_id and status <> 'archived';

  v_prize_count := coalesce(jsonb_array_length(p_prizes), 0);
  select count(*) into v_real_prizes
    from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb)) p
   where coalesce(p->>'kind', 'prize') = 'prize';

  if not v_is_premium then
    -- Free tier: two live games, two real prizes each.
    if v_active_games >= 2 then
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

  -- A chance game needs something to land on; a score game can run purely for
  -- the leaderboard, so an empty prize list is allowed there.
  if p_engine = 'chance' and v_prize_count < 1 then
    return jsonb_build_object('result', 'error', 'error', 'no_prizes');
  end if;

  insert into games (
    merchant_id, slug, type, engine, title, description, config, theme,
    cooldown_hours, max_wins_per_player, max_score
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
    least(greatest(coalesce(p_max_score, 100000), 1), 100000000)
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

  return jsonb_build_object('result', 'created', 'game_id', v_game_id, 'slug', v_slug);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_game_play: opens a play. Enforces the per-game replay cooldown and
-- reports (without consuming) whether the merchant still has plays and whether
-- this player may still win. Returns a single-use token.
-- ---------------------------------------------------------------------------

create or replace function public.start_game_play(
  p_slug text,
  p_game_slug text,
  p_email text,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_game games%rowtype;
  v_customer_id uuid;
  v_last_finished timestamptz;
  v_wins int;
  v_token uuid;
  v_base_allowance int;
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('result', 'error', 'error', 'invalid_email');
  end if;

  select * into v_merchant from merchants where slug = lower(trim(p_slug));
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select * into v_game from games
   where merchant_id = v_merchant.id and slug = lower(trim(p_game_slug));
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'game_not_found');
  end if;
  if v_game.status <> 'active' then
    return jsonb_build_object('result', 'error', 'error', 'game_paused');
  end if;

  insert into customers (email)
  values (lower(trim(p_email)))
  on conflict (email) do update set email = excluded.email
  returning id into v_customer_id;

  insert into customer_merchant_state (customer_id, merchant_id)
  values (v_customer_id, v_merchant.id)
  on conflict (customer_id, merchant_id) do nothing;

  -- Per-game replay cooldown (independent of the tile grid's).
  if v_game.cooldown_hours > 0 then
    select max(finished_at) into v_last_finished
      from game_plays
     where game_id = v_game.id and customer_id = v_customer_id and finished_at is not null;
    if v_last_finished is not null
       and v_last_finished > now() - make_interval(hours => v_game.cooldown_hours) then
      return jsonb_build_object(
        'result', 'cooldown',
        'next_play_at', v_last_finished + make_interval(hours => v_game.cooldown_hours)
      );
    end if;
  end if;

  -- Allowance peek: the play is only charged when it is graded, so an
  -- abandoned game costs the merchant nothing.
  if v_merchant.plays_period_start < now() - interval '365 days' then
    update merchants set plays_used = 0, plays_period_start = now()
     where id = v_merchant.id returning * into v_merchant;
  end if;

  if v_merchant.subscription_tier = 'premium'
     and v_merchant.premium_expires_at is not null
     and v_merchant.premium_expires_at > now() then
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'premium_yearly_plays'), 5000
    ) into v_base_allowance;
  else
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'free_yearly_plays'), 100
    ) into v_base_allowance;
  end if;

  if v_merchant.plays_used >= v_base_allowance and v_merchant.topup_plays <= 0 then
    return jsonb_build_object('result', 'no_plays');
  end if;

  select count(*) into v_wins
    from game_plays
   where game_id = v_game.id and customer_id = v_customer_id and won = true;

  insert into game_plays (game_id, merchant_id, customer_id)
  values (v_game.id, v_merchant.id, v_customer_id)
  returning token into v_token;

  return jsonb_build_object(
    'result', 'started',
    'token', v_token,
    'can_win', v_wins < v_game.max_wins_per_player
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_game_play: grades a play, charges one play from the merchant's
-- allowance, awards a prize (weighted draw or score threshold) and mints the
-- redemption code. A non-winning play earns a loyalty point, exactly like a
-- grid miss, so games feed the same loyalty economy.
-- ---------------------------------------------------------------------------

create or replace function public.finish_game_play(
  p_token uuid,
  p_score int default 0,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_play game_plays%rowtype;
  v_game games%rowtype;
  v_merchant merchants%rowtype;
  v_state customer_merchant_state%rowtype;
  v_prize game_prizes%rowtype;
  v_score int;
  v_wins int;
  v_can_win boolean;
  v_base_allowance int;
  v_total_weight int;
  v_roll int;
  v_acc int := 0;
  v_candidate game_prizes%rowtype;
  v_segment int;
  v_code text;
  v_expires_at timestamptz;
  v_unlocked_id uuid;
  v_best int;
  v_rank int;
begin
  select * into v_play from game_plays where token = p_token for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'play_not_found');
  end if;
  if v_play.finished_at is not null then
    return jsonb_build_object('result', 'error', 'error', 'play_already_finished');
  end if;
  -- A token left open for hours is stale: grade it, but never award from it.
  if v_play.started_at < now() - interval '6 hours' then
    update game_plays set finished_at = now() where id = v_play.id;
    return jsonb_build_object('result', 'error', 'error', 'play_expired');
  end if;

  select * into v_game from games where id = v_play.game_id for update;
  select * into v_merchant from merchants where id = v_play.merchant_id for update;

  -- Clamp the submitted score: a forged number can't outrun the honest ceiling.
  v_score := least(greatest(coalesce(p_score, 0), 0), v_game.max_score);

  -- Charge the play. Out of allowance: the game still resolves as a loss so
  -- the player gets an answer, but nothing is awarded.
  if v_merchant.plays_period_start < now() - interval '365 days' then
    update merchants set plays_used = 0, plays_period_start = now()
     where id = v_merchant.id returning * into v_merchant;
  end if;

  if v_merchant.subscription_tier = 'premium'
     and v_merchant.premium_expires_at is not null
     and v_merchant.premium_expires_at > now() then
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'premium_yearly_plays'), 5000
    ) into v_base_allowance;
  else
    select coalesce(
      (select (value #>> '{}')::int from app_settings where key = 'free_yearly_plays'), 100
    ) into v_base_allowance;
  end if;

  if v_merchant.plays_used >= v_base_allowance and v_merchant.topup_plays <= 0 then
    update game_plays
       set finished_at = now(), score = v_score, meta = coalesce(p_meta, '{}'::jsonb)
     where id = v_play.id;
    return jsonb_build_object('result', 'no_plays', 'score', v_score);
  end if;

  if v_merchant.plays_used < v_base_allowance then
    update merchants set plays_used = plays_used + 1 where id = v_merchant.id;
  else
    update merchants set topup_plays = greatest(topup_plays - 1, 0) where id = v_merchant.id;
  end if;

  select count(*) into v_wins
    from game_plays
   where game_id = v_game.id and customer_id = v_play.customer_id
     and won = true and id <> v_play.id;
  v_can_win := v_wins < v_game.max_wins_per_player;

  -- ----- Pick a prize --------------------------------------------------
  if v_game.engine = 'chance' then
    -- Weighted draw over every segment that can still be landed on: blanks
    -- always, real prizes only while they have stock (and the player may win).
    select coalesce(sum(weight), 0) into v_total_weight
      from game_prizes
     where game_id = v_game.id
       and (kind = 'blank' or (v_can_win and claimed < stock));

    if v_total_weight > 0 then
      v_roll := floor(random() * v_total_weight)::int;
      for v_candidate in
        select * from game_prizes
         where game_id = v_game.id
           and (kind = 'blank' or (v_can_win and claimed < stock))
         order by position
      loop
        v_acc := v_acc + v_candidate.weight;
        if v_roll < v_acc then
          v_prize := v_candidate;
          exit;
        end if;
      end loop;
    end if;
  else
    -- Score engine: the best prize whose bar the score clears.
    select * into v_prize
      from game_prizes
     where game_id = v_game.id
       and kind = 'prize'
       and claimed < stock
       and min_score <= v_score
       and v_can_win
     order by min_score desc, position
     limit 1;
  end if;

  v_segment := null;
  if v_prize.id is not null then
    v_segment := v_prize.position;
  end if;

  -- ----- Award ---------------------------------------------------------
  if v_prize.id is not null and v_prize.kind = 'prize' then
    -- Re-check stock under the row lock before handing anything out.
    select * into v_prize from game_prizes where id = v_prize.id for update;
    if v_prize.claimed < v_prize.stock then
      v_code := generate_redemption_code();
      v_expires_at := now() + make_interval(days => v_prize.expiry_days);

      insert into unlocked_rewards
        (customer_id, merchant_id, reward_type, game_prize_id, redemption_code,
         expires_at)
      values
        (v_play.customer_id, v_merchant.id, 'game', v_prize.id, v_code,
         v_expires_at)
      returning id into v_unlocked_id;

      update game_prizes set claimed = claimed + 1 where id = v_prize.id;
      update games set wins_count = wins_count + 1 where id = v_game.id;
    else
      -- Lost the race for the last one: resolves as a near miss.
      v_prize := null;
      v_segment := null;
    end if;
  end if;

  update games
     set plays_count = plays_count + 1, updated_at = now()
   where id = v_game.id;

  update game_plays
     set finished_at = now(),
         score = v_score,
         meta = coalesce(p_meta, '{}'::jsonb),
         won = v_unlocked_id is not null,
         prize_id = case when v_unlocked_id is not null then v_prize.id else null end,
         unlocked_reward_id = v_unlocked_id
   where id = v_play.id;

  -- No prize? The play still earns a loyalty point (and refreshes the whole
  -- balance's 7-day window), same as a grid miss.
  if v_unlocked_id is null and v_play.customer_id is not null then
    update customer_merchant_state
       set loyalty_points = loyalty_points + 1,
           points_expire_at = now() + interval '7 days',
           total_plays = total_plays + 1,
           loyalty_code = coalesce(loyalty_code, generate_customer_code(v_merchant.id))
     where customer_id = v_play.customer_id and merchant_id = v_merchant.id
     returning * into v_state;
  elsif v_play.customer_id is not null then
    update customer_merchant_state
       set total_plays = total_plays + 1,
           loyalty_code = coalesce(loyalty_code, generate_customer_code(v_merchant.id))
     where customer_id = v_play.customer_id and merchant_id = v_merchant.id
     returning * into v_state;
  end if;

  -- Leaderboard position among this game's finished plays.
  select coalesce(max(score), 0) into v_best
    from game_plays
   where game_id = v_game.id and customer_id = v_play.customer_id and finished_at is not null;

  select count(*) + 1 into v_rank
    from (
      select customer_id, max(score) as best
        from game_plays
       where game_id = v_game.id and finished_at is not null and customer_id is not null
       group by customer_id
    ) boards
   where boards.best > v_best;

  return jsonb_build_object(
    'result', case when v_unlocked_id is not null then 'win' else 'lose' end,
    'segment_index', v_segment,
    'prize', case
      when v_unlocked_id is not null then jsonb_build_object(
        'description', v_prize.description,
        'details', v_prize.details,
        'icon', v_prize.icon
      )
      else null
    end,
    'code', v_code,
    'expires_at', v_expires_at,
    'score', v_score,
    'best_score', v_best,
    'rank', v_rank,
    'loyalty_points', coalesce(v_state.loyalty_points, 0),
    'points_expire_at', v_state.points_expire_at,
    'loyalty_code', v_state.loyalty_code,
    'can_win_again', v_wins + (case when v_unlocked_id is not null then 1 else 0 end)
      < v_game.max_wins_per_player,
    'next_play_at', case
      when v_game.cooldown_hours > 0 then now() + make_interval(hours => v_game.cooldown_hours)
      else null
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff-side: teach the code box and the redeem call about game prizes.
-- ---------------------------------------------------------------------------

create or replace function public.lookup_staff_code(
  p_merchant_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_merchant merchants%rowtype;
  v_state customer_merchant_state%rowtype;
  v_email text;
  v_ur unlocked_rewards%rowtype;
  v_description text;
begin
  v_code := upper(trim(p_code));
  if v_code !~ '^[A-Z0-9]{6}$' then
    return jsonb_build_object('result', 'error', 'error', 'code_not_found');
  end if;

  select * into v_merchant from merchants where id = p_merchant_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  -- 1. Cycling loyalty code
  select * into v_state from customer_merchant_state
   where merchant_id = p_merchant_id and loyalty_code = v_code
   for update;
  if found then
    if v_state.points_expire_at is not null and v_state.points_expire_at < now() then
      update customer_merchant_state
         set loyalty_points = 0, points_expire_at = null
       where customer_id = v_state.customer_id and merchant_id = p_merchant_id
       returning * into v_state;
    end if;
    select email into v_email from customers where id = v_state.customer_id;
    return jsonb_build_object(
      'result', 'found',
      'kind', 'loyalty',
      'customer_email', v_email,
      'points', v_state.loyalty_points,
      'points_needed', v_merchant.points_per_discount,
      'discount_percent', v_merchant.discount_percent,
      'eligible', v_state.loyalty_points >= v_merchant.points_per_discount,
      'points_expire_at', v_state.points_expire_at
    );
  end if;

  -- 2. One-time redemption code (tile win, game win, or an old loyalty discount)
  select * into v_ur from unlocked_rewards
   where redemption_code = v_code and merchant_id = p_merchant_id;
  if found then
    if v_ur.reward_type = 'tile' then
      select description into v_description from rewards where id = v_ur.reward_id;
      v_description := coalesce(v_description, 'Tile reward');
    elsif v_ur.reward_type = 'game' then
      select description into v_description from game_prizes where id = v_ur.game_prize_id;
      v_description := coalesce(v_description, 'Game prize');
    else
      v_description := v_ur.discount_percent || '% loyalty discount';
    end if;
    select email into v_email from customers where id = v_ur.customer_id;
    return jsonb_build_object(
      'result', 'found',
      'kind', 'code',
      'customer_email', v_email,
      'description', v_description,
      'status', case
        when v_ur.status = 'unredeemed' and v_ur.expires_at < now() then 'expired'
        else v_ur.status
      end,
      'expires_at', v_ur.expires_at
    );
  end if;

  return jsonb_build_object('result', 'error', 'error', 'code_not_found');
end;
$$;

create or replace function public.redeem_unlocked_reward(
  p_merchant_id uuid,
  p_unlocked_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ur unlocked_rewards%rowtype;
  v_description text;
  v_email text;
  v_grid_id uuid;
begin
  select * into v_ur from unlocked_rewards
   where id = p_unlocked_id and merchant_id = p_merchant_id
   for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'code_not_found');
  end if;

  if v_ur.status = 'redeemed' then
    return jsonb_build_object('result', 'error', 'error', 'already_redeemed');
  end if;

  if v_ur.status = 'expired' or v_ur.expires_at < now() then
    update unlocked_rewards set status = 'expired' where id = v_ur.id;
    return jsonb_build_object('result', 'error', 'error', 'expired');
  end if;

  update unlocked_rewards
     set status = 'redeemed', redeemed_at = now()
   where id = v_ur.id;

  if v_ur.reward_type = 'tile' then
    select description into v_description from rewards where id = v_ur.reward_id;
    v_description := coalesce(v_description, 'Tile reward');

    -- Anti-collusion: re-deal the hidden reward tiles of that grid.
    select g.id into v_grid_id
      from rewards r
      join grids g on g.id = r.grid_id and g.status = 'active'
     where r.id = v_ur.reward_id;
    if v_grid_id is not null then
      perform shuffle_grid_rewards(v_grid_id);
    end if;
  elsif v_ur.reward_type = 'game' then
    select description into v_description from game_prizes where id = v_ur.game_prize_id;
    v_description := coalesce(v_description, 'Game prize');
  else
    v_description := v_ur.discount_percent || '% loyalty discount';
  end if;

  select email into v_email from customers where id = v_ur.customer_id;

  return jsonb_build_object(
    'result', 'redeemed',
    'description', v_description,
    'reward_type', v_ur.reward_type,
    'discount_percent', v_ur.discount_percent,
    'customer_email', v_email,
    'unlocked_at', v_ur.unlocked_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_game(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, int, int, int)
  from public, anon, authenticated;
revoke execute on function public.start_game_play(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.finish_game_play(uuid, int, jsonb)
  from public, anon, authenticated;
revoke execute on function public.lookup_staff_code(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.redeem_unlocked_reward(uuid, uuid)
  from public, anon, authenticated;
