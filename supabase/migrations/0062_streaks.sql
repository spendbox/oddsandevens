-- ---------------------------------------------------------------------------
-- Streaks
-- ---------------------------------------------------------------------------
--
-- Thirty days, one reward each, and the whole thing resets if you miss one.
--
-- This reverses a decision the README made deliberately — "no streaks and no
-- daily bonus, lives refill on a clock" — and the reasoning behind it is what
-- shapes the ladder rather than something to argue with. **Twenty-four lives
-- already arrive free every day.** A ladder made mostly of lives is therefore a
-- ladder that feels like nothing, so the rungs that matter are the ones the
-- clock cannot give: a Second Wind, a Colour Read, headroom above the ceiling,
-- a discount. Lives are the filler between them.
--
-- A day is **opening the app**, not making a guess. That is what "logging in
-- each day" means, it is the cheapest habit to build, and since 0056 it is
-- something we actually record.

-- ---------------------------------------------------------------------------
-- Where somebody is
-- ---------------------------------------------------------------------------

create table if not exists public.player_streaks (
  player_id uuid primary key references public.players (id) on delete cascade,
  /** 0 before the first claim; 1–30 after. */
  day int not null default 0 check (day between 0 and 30),
  /** How many complete thirties they have finished, plus the one they are on. */
  cycle int not null default 1 check (cycle >= 1),
  /** The Lagos day of the last claim. One claim per day is decided by this. */
  last_claim_day date,
  best_day int not null default 0 check (best_day between 0 and 30),
  claims int not null default 0 check (claims >= 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_streaks enable row level security;

/*
 * Every claim, kept.
 *
 * Three jobs, and only the first is bookkeeping: it is the audit trail for
 * "where did these lives come from", it is what makes a day unclaimable twice
 * (the unique constraint, not a check in a route), and it carries the IP hash
 * so a hundred accounts claiming from one machine is visible rather than
 * inferred. A streak rewards *visiting*, and visiting is free.
 */
create table if not exists public.streak_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  cycle int not null,
  day int not null check (day between 1 and 30),
  /** What was granted, one row per grant — a milestone day gives several. */
  grants jsonb not null default '[]'::jsonb,
  ip_hash text,
  claimed_at timestamptz not null default now(),
  unique (player_id, cycle, day)
);

create index if not exists streak_claims_player_idx
  on public.streak_claims (player_id, claimed_at desc);
create index if not exists streak_claims_ip_idx
  on public.streak_claims (ip_hash, claimed_at desc) where ip_hash is not null;

alter table public.streak_claims enable row level security;

-- A streak grant needs to be able to hand over a named power-up, which no
-- offer could carry before: `power_up` existed only to say which power-up a
-- *discount* applied to.
alter table public.player_offers drop constraint if exists player_offers_kind_check;
alter table public.player_offers
  add constraint player_offers_kind_check
  check (kind in (
    'free_lives',
    'power_up_discount',
    'free_second_wind',
    'life_discount',
    'free_power_up'
  ));

alter table public.player_offers drop constraint if exists player_offers_discount_names_one;
alter table public.player_offers
  add constraint player_offers_discount_names_one
  check (kind not in ('power_up_discount', 'free_power_up') or power_up is not null);

/*
 * A Second Wind from a streak has no box yet, and that is the better reward.
 *
 * A crate's Second Wind is minted against the safe you were looking at, so
 * `player_offers_wind_needs_box` could insist on one. A streak's is won at the
 * moment somebody opened the app, before any box is on screen — and "fifteen
 * free minutes on whichever safe you like" is worth more than fifteen on
 * whichever safe you happened to have open. So the box may be null until it is
 * claimed, and `attach_offer_box` is what fills it in.
 *
 * The constraint is not dropped, only moved: an offer that has been *claimed*
 * must still name the box it was spent on, or nothing downstream could tell
 * where the Second Wind went.
 */
alter table public.player_offers drop constraint if exists player_offers_wind_needs_box;
alter table public.player_offers
  add constraint player_offers_wind_needs_box
  check (kind <> 'free_second_wind' or box_id is not null or claimed_at is null);

/*
 * Point a floating offer at a box, then let the ordinary claim path run.
 *
 * Deliberately does not grant anything itself. `claim_offer` already knows how
 * to turn a Second Wind into fifteen minutes on a hunt, including how long
 * that window is — and a second copy of that logic is a second place for the
 * duration to drift out of step with `SECOND_WIND_MINUTES`.
 */
create or replace function public.attach_offer_box(
  p_email citext,
  p_offer_id uuid,
  p_box_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_offer public.player_offers;
begin
  v_player := public.ensure_player(p_email);

  select * into v_offer from public.player_offers
   where id = p_offer_id and player_id = v_player.id;

  -- An offer that already names a box — every one a crate ever minted — goes
  -- straight through. Only a floating one is attached, and only a floating one
  -- can be refused for the box being dead: refusing the rest would break a
  -- crate claimed a second after somebody else cracked the safe.
  if found and v_offer.box_id is null then
    if not exists (select 1 from public.boxes where id = p_box_id and status = 'live') then
      return jsonb_build_object('result', 'error', 'error', 'box_not_live');
    end if;

    update public.player_offers
       set box_id = p_box_id
     where id = p_offer_id
       and player_id = v_player.id
       and claimed_at is null
       and expires_at > now()
       and box_id is null;
  end if;

  -- Whether it can be claimed at all is `claim_offer`'s question, asked once.
  return public.claim_offer(p_email, p_offer_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- The ladder
-- ---------------------------------------------------------------------------

insert into public.platform_settings (key, value)
values ('streaks', '{}'::jsonb)
on conflict (key) do nothing;

create or replace function public.streak_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.platform_settings where key = 'streaks'), '{}'::jsonb);
$$;

create or replace function public.set_streak_settings(p_value jsonb, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_streak_settings';
  end if;
  if p_value ? 'days' and jsonb_typeof(p_value -> 'days') <> 'array' then
    raise exception 'invalid_streak_settings';
  end if;
  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('streaks', p_value, nullif(trim(p_by), ''), now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return p_value;
end;
$$;

/*
 * The thirty days, as shipped.
 *
 * Each day is a *list* of grants rather than one, which is what lets a
 * milestone be "a week of Life Bank **and** twenty-five lives" without a
 * special case. It is also the shape the admin editor writes back, so what an
 * administrator can express is exactly what the default expresses.
 *
 * Kinds:
 *   free_lives        credited on the spot, and allowed above the ceiling
 *   life_discount     percent off the next lives order, 24h
 *   power_up_discount percent off one named power-up, 24h
 *   free_second_wind  claimed onto a box of their choosing
 *   free_power_up     a named power-up, claimed onto a box of their choosing
 *   life_bank         days of a raised ceiling, granted immediately
 */
create or replace function public.streak_default_ladder()
returns jsonb language sql immutable as $$
  select '[
    {"day":1,  "grants":[{"kind":"free_lives","amount":5}]},
    {"day":2,  "grants":[{"kind":"life_discount","amount":20}]},
    {"day":3,  "grants":[{"kind":"free_lives","amount":8}]},
    {"day":4,  "grants":[{"kind":"free_second_wind"}]},
    {"day":5,  "grants":[{"kind":"free_lives","amount":10}]},
    {"day":6,  "grants":[{"kind":"power_up_discount","amount":25,"powerUp":"breakdown"}]},
    {"day":7,  "grants":[{"kind":"life_bank","amount":3}]},

    {"day":8,  "grants":[{"kind":"free_lives","amount":10}]},
    {"day":9,  "grants":[{"kind":"life_discount","amount":30}]},
    {"day":10, "grants":[{"kind":"free_second_wind"}]},
    {"day":11, "grants":[{"kind":"free_lives","amount":12}]},
    {"day":12, "grants":[{"kind":"free_power_up","powerUp":"length_lock"}]},
    {"day":13, "grants":[{"kind":"power_up_discount","amount":30,"powerUp":"x_ray"}]},
    {"day":14, "grants":[{"kind":"life_bank","amount":7},{"kind":"free_lives","amount":15}]},

    {"day":15, "grants":[{"kind":"free_lives","amount":15}]},
    {"day":16, "grants":[{"kind":"free_power_up","powerUp":"breakdown"}]},
    {"day":17, "grants":[{"kind":"life_discount","amount":40}]},
    {"day":18, "grants":[{"kind":"free_second_wind"}]},
    {"day":19, "grants":[{"kind":"free_lives","amount":18}]},
    {"day":20, "grants":[{"kind":"power_up_discount","amount":40,"powerUp":"symbol_count"}]},
    {"day":21, "grants":[{"kind":"free_power_up","powerUp":"vowel_scan"},{"kind":"free_power_up","powerUp":"consonant_scan"},{"kind":"free_lives","amount":20}]},

    {"day":22, "grants":[{"kind":"free_lives","amount":20}]},
    {"day":23, "grants":[{"kind":"life_discount","amount":50}]},
    {"day":24, "grants":[{"kind":"free_second_wind"}]},
    {"day":25, "grants":[{"kind":"free_power_up","powerUp":"breakdown"}]},
    {"day":26, "grants":[{"kind":"free_lives","amount":22}]},
    {"day":27, "grants":[{"kind":"power_up_discount","amount":50,"powerUp":"power_pack"}]},
    {"day":28, "grants":[{"kind":"life_bank","amount":14},{"kind":"free_lives","amount":25}]},

    {"day":29, "grants":[{"kind":"free_lives","amount":25}]},
    {"day":30, "grants":[{"kind":"free_lives","amount":50},{"kind":"life_bank","amount":14},{"kind":"free_power_up","powerUp":"x_ray"}]}
  ]'::jsonb;
$$;

/** What an administrator has changed, or the built-in list if they haven't. */
create or replace function public.streak_ladder()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when jsonb_typeof(public.streak_settings() -> 'days') = 'array'
     and jsonb_array_length(public.streak_settings() -> 'days') > 0
    then public.streak_settings() -> 'days'
    else public.streak_default_ladder()
  end;
$$;

create or replace function public.streaks_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((public.streak_settings() ->> 'enabled')::boolean, true);
$$;

/** One day out of the ladder, by number. */
create or replace function public.streak_day(p_day int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select d from jsonb_array_elements(public.streak_ladder()) d
      where (d ->> 'day')::int = p_day limit 1),
    jsonb_build_object('day', p_day, 'grants', '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

/*
 * Take today's reward, and move the streak on.
 *
 * The whole state machine is three lines of arithmetic and they are the whole
 * feature:
 *
 *   claimed today already  → nothing, and say so
 *   claimed yesterday      → the next day (30 loops back to 1, cycle + 1)
 *   anything else          → day 1, because a missed day resets the cycle
 *
 * It is all one transaction, and `streak_claims` has a unique key on
 * (player, cycle, day) — so two taps racing each other cannot both grant. The
 * second one fails the insert and the whole claim rolls back rather than
 * handing out two days' rewards.
 *
 * **Grants are exempt from the drop caps** by construction: they are written
 * here rather than through `mint_gift`, which is where the five-a-day ceiling
 * on free lives lives. That is deliberate — a streak is a different mechanic
 * with its own ceiling, which is the ladder itself.
 */
create or replace function public.claim_streak(p_email citext, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_streak public.player_streaks;
  v_today date := public.activity_day();
  v_day int;
  v_cycle int;
  v_entry jsonb;
  v_grant jsonb;
  v_kind text;
  v_amount int;
  v_power_up text;
  v_lives int := 0;
begin
  if not public.streaks_enabled() then
    return jsonb_build_object('result', 'error', 'error', 'disabled');
  end if;

  v_player := public.ensure_player(p_email);
  if v_player.id is null then
    return jsonb_build_object('result', 'error', 'error', 'no_player');
  end if;

  insert into public.player_streaks (player_id) values (v_player.id)
    on conflict (player_id) do nothing;
  select * into v_streak from public.player_streaks
    where player_id = v_player.id for update;

  if v_streak.last_claim_day = v_today then
    return jsonb_build_object('result', 'error', 'error', 'already_claimed');
  end if;

  if v_streak.last_claim_day = v_today - 1 and v_streak.day > 0 then
    if v_streak.day >= 30 then
      v_day := 1;
      v_cycle := v_streak.cycle + 1;
    else
      v_day := v_streak.day + 1;
      v_cycle := v_streak.cycle;
    end if;
  else
    /*
     * A missed day, or a first claim. Either way it is day one again — and
     * **the cycle has to turn over with it**, not only when thirty days are
     * finished.
     *
     * `streak_claims` is unique on (player, cycle, day), which is what makes a
     * day unclaimable twice. Resetting to day 1 inside the same cycle
     * therefore collides with the day 1 they already claimed at the start of
     * that run — and the collision is not a soft refusal, it is a constraint
     * violation that rolls the claim back. The effect would have been that
     * anybody whose streak ever broke could never claim again, which reads as
     * "streaks randomly stop working" and is invisible until it is reported.
     *
     * So a break starts a genuinely new run, and `cycle` means "this is my Nth
     * attempt at the ladder" rather than "completed thirties".
     */
    v_day := 1;
    v_cycle := case when coalesce(v_streak.day, 0) = 0 then v_streak.cycle
                    else v_streak.cycle + 1 end;
  end if;

  v_entry := public.streak_day(v_day);

  -- Written before anything is granted: the unique key is what makes a
  -- double-tap impossible, and it has to fail *before* the lives are credited
  -- rather than after.
  insert into public.streak_claims (player_id, cycle, day, grants, ip_hash)
  values (v_player.id, v_cycle, v_day, coalesce(v_entry -> 'grants', '[]'::jsonb),
          nullif(trim(coalesce(p_ip_hash, '')), ''));

  for v_grant in select * from jsonb_array_elements(coalesce(v_entry -> 'grants', '[]'::jsonb))
  loop
    v_kind := v_grant ->> 'kind';
    v_amount := coalesce((v_grant ->> 'amount')::int, 0);
    v_power_up := v_grant ->> 'powerUp';

    if v_kind = 'free_lives' and v_amount > 0 then
      -- Above the ceiling if that is where they fall, exactly as a bought life
      -- does. Clamping a gift to a cap is a way of taking part of it back.
      update public.players set lives = lives + v_amount
       where id = v_player.id returning lives into v_lives;

    elsif v_kind = 'life_bank' and v_amount > 0 then
      perform public.grant_life_bank(v_player.id, 24, v_amount);

    elsif v_kind in ('life_discount', 'power_up_discount') and v_amount > 0 then
      -- Minted already claimed: there is nothing for the player to do with a
      -- discount but spend it, and a second tap to "claim" it is a step that
      -- exists only to be forgotten about.
      insert into public.player_offers (player_id, kind, amount, power_up, expires_at, claimed_at)
      values (v_player.id, v_kind, least(greatest(v_amount, 1), 100), v_power_up,
              now() + interval '24 hours', now());

    elsif v_kind in ('free_second_wind', 'free_power_up') then
      -- Left unclaimed and without a box: these need one, and which box is the
      -- player's decision rather than ours. They pick it when they use it.
      insert into public.player_offers (player_id, kind, amount, power_up, expires_at)
      values (v_player.id, v_kind, 1, v_power_up, now() + interval '7 days');
    end if;
  end loop;

  update public.player_streaks
     set day = v_day,
         cycle = v_cycle,
         last_claim_day = v_today,
         best_day = greatest(best_day, v_day),
         claims = claims + 1,
         updated_at = now()
   where player_id = v_player.id
  returning * into v_streak;

  return jsonb_build_object(
    'result', 'claimed',
    'day', v_day,
    'cycle', v_cycle,
    'grants', coalesce(v_entry -> 'grants', '[]'::jsonb),
    'lives', coalesce(v_lives, v_player.lives),
    'best_day', v_streak.best_day
  );
end;
$$;

/*
 * Where the streak stands, without changing it.
 *
 * Reports the day they are *on*, whether today is still claimable, and what
 * claiming would give — plus the whole ladder, because the screen draws thirty
 * tiles and the one after today is what brings anybody back tomorrow.
 */
create or replace function public.streak_state(p_email citext)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_streak public.player_streaks;
  v_today date := public.activity_day();
  v_next int;
  v_broken boolean := false;
begin
  v_player := public.ensure_player(p_email);
  if v_player.id is null then
    return jsonb_build_object('enabled', false);
  end if;

  select * into v_streak from public.player_streaks where player_id = v_player.id;

  if not found then
    v_next := 1;
  elsif v_streak.last_claim_day = v_today then
    v_next := v_streak.day;
  elsif v_streak.last_claim_day = v_today - 1 and v_streak.day > 0 then
    v_next := case when v_streak.day >= 30 then 1 else v_streak.day + 1 end;
  else
    v_next := 1;
    -- Only worth telling somebody their streak broke if they had one.
    v_broken := coalesce(v_streak.day, 0) > 1;
  end if;

  return jsonb_build_object(
    'enabled', public.streaks_enabled(),
    'day', coalesce(v_streak.day, 0),
    'cycle', coalesce(v_streak.cycle, 1),
    'best_day', coalesce(v_streak.best_day, 0),
    -- `coalesce`, because a player who has never claimed has no row at all
    -- and `null = date` is null: the answer to "have you claimed today" is
    -- no, not unknown.
    'claimed_today', coalesce(v_streak.last_claim_day = v_today, false),
    'claimable', v_streak.last_claim_day is distinct from v_today,
    'next_day', v_next,
    'broke', v_broken,
    'ladder', public.streak_ladder()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- What an admin sees
-- ---------------------------------------------------------------------------

create or replace view public.admin_streaks as
select
  s.player_id,
  p.email,
  s.day,
  s.cycle,
  s.best_day,
  s.claims,
  s.last_claim_day,
  s.started_at,
  -- One machine running many accounts is the abuse this invites, and it is
  -- visible here rather than inferred later.
  (select count(distinct c.player_id) from public.streak_claims c
    where c.ip_hash is not null
      and c.ip_hash in (select ip_hash from public.streak_claims where player_id = s.player_id)
  ) as accounts_on_same_ip
from public.player_streaks s
join public.players p on p.id = s.player_id;

create or replace view public.admin_streak_summary as
select
  count(*)                                     as players,
  count(*) filter (where day >= 7)             as past_week_one,
  count(*) filter (where day >= 30)            as completed,
  coalesce(max(best_day), 0)                   as longest,
  (select count(*) from public.streak_claims)  as claims_all_time,
  (select count(*) from public.streak_claims
    where claimed_at > now() - interval '24 hours') as claims_today
from public.player_streaks;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.player_streaks from public, anon, authenticated;
revoke all on public.streak_claims from public, anon, authenticated;
revoke all on public.admin_streaks from public, anon, authenticated;
revoke all on public.admin_streak_summary from public, anon, authenticated;
revoke execute on function public.claim_streak(citext, text) from public, anon, authenticated;
revoke execute on function public.streak_state(citext) from public, anon, authenticated;
revoke execute on function public.streak_settings() from public, anon, authenticated;
revoke execute on function public.set_streak_settings(jsonb, text) from public, anon, authenticated;
revoke execute on function public.streak_ladder() from public, anon, authenticated;
revoke execute on function public.streak_day(int) from public, anon, authenticated;
revoke execute on function public.streaks_enabled() from public, anon, authenticated;
revoke execute on function public.attach_offer_box(citext, uuid, uuid) from public, anon, authenticated;

grant select on public.admin_streaks to service_role;
grant select on public.admin_streak_summary to service_role;

notify pgrst, 'reload schema';
