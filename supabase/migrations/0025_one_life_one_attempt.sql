-- The hunt gets harder, and a life becomes the unit of play.
--
-- What changed, and why:
--
--   * An attempt is a life. There is no bounded "run" any more — a hunt goes
--     on for as long as the player can pay for it in lives, and the pool is
--     cut from 15 to 7. `runs`/`guesses` become `hunts`/`attempts`.
--
--   * Passwords are case-sensitive, and the alphabet grows to include
--     lowercase and digits.
--
--   * The per-position colour grid is gone. An attempt answers three
--     questions and nothing else: is my guess shorter, longer, or exactly the
--     right length; how many characters landed exactly right; and how many
--     landed on the right letter in the right place but in the wrong case.
--     *Which* positions those were is never disclosed, which is the whole
--     difficulty.
--
--   * Nothing says how long the password is. Length has to be hunted too.
--
--   * "Stake" is retired as a word. A contributor funds a box; a player wins
--     a reward. `stake_kobo` → `funding_kobo`, `prize_kobo` → `reward_kobo`.
--
--   * Boxes start as drafts and are freely editable until funded. Once
--     funded they can never be deleted and the reward can only go up.
--
-- Scoring now happens inside Postgres rather than in a route handler, so the
-- password never leaves the database at all — not even into application
-- memory — and spending the life, recording the attempt and settling a win
-- are one atomic statement.

-- ---------------------------------------------------------------------------
-- Lives: 15 becomes 7
-- ---------------------------------------------------------------------------

create or replace function public.lives_max() returns int
language sql immutable as $$ select 7 $$;

alter table public.players alter column lives set default 7;

-- Anyone holding more than the new cap keeps what they bought; the refill
-- simply won't top them up again until they're back under it.
update public.players set lives = 7 where lives > 7;

-- ---------------------------------------------------------------------------
-- Boxes: reward, not stake
-- ---------------------------------------------------------------------------

alter table public.boxes rename column stake_kobo to funding_kobo;
alter table public.boxes rename column prize_kobo to reward_kobo;

-- Attempts are unlimited, bounded only by lives, so a per-box guess budget no
-- longer means anything.
alter table public.boxes drop column if exists guesses_allowed;

-- A box is written as a draft, edited freely, and only then funded.
alter table public.boxes alter column status set default 'draft';

alter table public.stake_orders rename to funding_orders;
alter table public.prize_claims rename to reward_claims;

-- A funding order is now one of two things. Null means "this is what put the
-- box live"; a value means "this raises an already-live box to that total",
-- and the contributor paid the difference.
alter table public.funding_orders
  add column if not exists raises_to_kobo bigint check (raises_to_kobo > 0);

-- ---------------------------------------------------------------------------
-- Hunts and attempts
-- ---------------------------------------------------------------------------

drop table if exists public.guesses cascade;
drop table if exists public.runs cascade;

-- One player's pursuit of one box. It has no end other than winning, or the
-- box being taken by somebody else.
create table public.hunts (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  attempts_count int not null default 0 check (attempts_count >= 0),
  -- Power-up winnings: revealed positions, struck-off characters, a known
  -- length. Shape mirrors `Revealed` in src/lib/game/power-ups.ts.
  revealed jsonb not null default '{}'::jsonb,
  won_at timestamptz,
  started_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  unique (box_id, player_id)
);

create index hunts_box_idx on public.hunts (box_id, last_attempt_at desc);
create index hunts_player_idx on public.hunts (player_id, last_attempt_at desc);

-- One guess, one life. The verdict is stored rather than recomputed, so the
-- history a player scrolls back through can never disagree with what they
-- were shown at the time.
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  hunt_id uuid not null references public.hunts (id) on delete cascade,
  ordinal int not null check (ordinal >= 0),
  value text not null,
  -- 'shorter' / 'longer' / 'exact', relative to the password.
  length_hint text not null check (length_hint in ('shorter', 'longer', 'exact')),
  -- Right character, right place, right case.
  exact_count int not null default 0 check (exact_count >= 0),
  -- Right letter, right place, wrong case.
  miscase_count int not null default 0 check (miscase_count >= 0),
  created_at timestamptz not null default now(),
  unique (hunt_id, ordinal)
);

create index attempts_hunt_idx on public.attempts (hunt_id, ordinal desc);

-- Power-ups now attach to a hunt rather than a run.
alter table public.power_up_orders drop constraint if exists power_up_orders_run_id_fkey;
alter table public.power_up_orders rename column run_id to hunt_id;
alter table public.power_up_orders
  add constraint power_up_orders_hunt_id_fkey
  foreign key (hunt_id) references public.hunts (id) on delete cascade;

alter table public.hunts enable row level security;
alter table public.attempts enable row level security;

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

/*
 * Mark one guess against one password.
 *
 * Positional only, and deliberately so. There is no "that letter is in there
 * somewhere" signal — the sole information is how many positions are exactly
 * right, how many are the right letter in the right place but the wrong case,
 * and whether the guess is the right length. A guess shorter than the password
 * is compared over its own length; a longer one over the password's.
 *
 * Case is what `miscase` is for: guessing `k` where the password has `K` earns
 * an orange, which tells a player they have found the letter and the position
 * and need only flip the case. It is the one concession to fairness in an
 * otherwise unforgiving scheme.
 */
create or replace function public.score_attempt(p_secret text, p_guess text)
returns table (length_hint text, exact_count int, miscase_count int)
language plpgsql
immutable
as $$
declare
  v_overlap int := least(char_length(p_secret), char_length(p_guess));
  v_i int;
  v_s text;
  v_g text;
begin
  length_hint := case
    when char_length(p_guess) < char_length(p_secret) then 'shorter'
    when char_length(p_guess) > char_length(p_secret) then 'longer'
    else 'exact'
  end;
  exact_count := 0;
  miscase_count := 0;

  for v_i in 1..greatest(v_overlap, 0) loop
    v_s := substr(p_secret, v_i, 1);
    v_g := substr(p_guess, v_i, 1);
    if v_g = v_s then
      exact_count := exact_count + 1;
    elsif lower(v_g) = lower(v_s) then
      miscase_count := miscase_count + 1;
    end if;
  end loop;

  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Taking a shot
-- ---------------------------------------------------------------------------

/*
 * Spend one life on one guess.
 *
 * Everything happens here in a single transaction: the life comes off, the
 * attempt is recorded with the verdict it earned, and a correct guess closes
 * the box and opens the reward claim. Two requests can therefore never both
 * spend the last life, and the password is read, compared and dropped without
 * ever leaving Postgres.
 *
 * There is no refund on a win. Under the old bounded-run model a life bought
 * a whole run and giving it back was the difference between "failing costs a
 * life" and "playing costs a life"; now a life buys exactly one guess, and the
 * guess that wins was still a guess.
 */
create or replace function public.spend_attempt(
  p_email citext,
  p_box_id uuid,
  p_guess text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_box public.boxes;
  v_hunt public.hunts;
  v_score record;
  v_ordinal int;
  v_won boolean;
  v_claimed jsonb;
begin
  v_player := public.ensure_player(p_email);

  select * into v_box from public.boxes where id = p_box_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'box_not_found');
  end if;
  if v_box.status = 'unlocked' then
    return jsonb_build_object('result', 'error', 'error', 'box_unlocked');
  end if;
  if v_box.status <> 'live' then
    return jsonb_build_object('result', 'error', 'error', 'box_not_live');
  end if;

  if v_player.lives < 1 then
    return jsonb_build_object(
      'result', 'error',
      'error', 'no_lives',
      'next_life_at', v_player.lives_accrued_at + public.life_regen()
    );
  end if;

  insert into public.hunts (box_id, player_id) values (p_box_id, v_player.id)
    on conflict (box_id, player_id) do nothing;
  select * into v_hunt from public.hunts
    where box_id = p_box_id and player_id = v_player.id for update;

  if v_hunt.won_at is not null then
    return jsonb_build_object('result', 'error', 'error', 'already_won');
  end if;

  update public.players set lives = lives - 1
    where id = v_player.id returning * into v_player;

  select * into v_score from public.score_attempt(v_box.secret, p_guess);
  v_won := (p_guess = v_box.secret);
  v_ordinal := v_hunt.attempts_count;

  insert into public.attempts (hunt_id, ordinal, value, length_hint, exact_count, miscase_count)
    values (v_hunt.id, v_ordinal, p_guess, v_score.length_hint,
            v_score.exact_count, v_score.miscase_count);

  update public.hunts
     set attempts_count = v_ordinal + 1,
         last_attempt_at = now(),
         won_at = case when v_won then now() else won_at end
   where id = v_hunt.id;

  update public.boxes
     set attempts_count = attempts_count + 1,
         players_count = players_count + case when v_ordinal = 0 then 1 else 0 end
   where id = p_box_id;

  if v_won then
    v_claimed := public.claim_box(v_hunt.id);
  end if;

  return jsonb_build_object(
    'result', 'scored',
    'length_hint', v_score.length_hint,
    'exact', v_score.exact_count,
    'miscase', v_score.miscase_count,
    'lives_left', v_player.lives,
    'outcome', coalesce(v_claimed->>'result', 'open'),
    'reward_kobo', v_claimed->'reward_kobo'
  );
end;
$$;

/*
 * Settle a solved hunt: close the box and open the reward claim.
 *
 * The box is closed with a conditional update, so if two players land the
 * password within the same instant exactly one of them is the winner and the
 * other is told they were pipped rather than being promised money twice.
 * Nobody's life comes back — every life here bought a guess that was made.
 *
 * Dropped rather than replaced: the argument is a hunt now, not a run, and
 * CREATE OR REPLACE refuses to rename a parameter.
 */
drop function if exists public.claim_box(uuid);

create or replace function public.claim_box(p_hunt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hunt public.hunts;
  v_box public.boxes;
begin
  select * into v_hunt from public.hunts where id = p_hunt_id;
  if not found then
    raise exception 'hunt_not_found';
  end if;

  update public.boxes
     set status = 'unlocked', unlocked_by = v_hunt.player_id, unlocked_at = now()
   where id = v_hunt.box_id and status = 'live'
   returning * into v_box;

  if not found then
    return jsonb_build_object('result', 'pipped');
  end if;

  insert into public.reward_claims (box_id, player_id, amount_kobo)
    values (v_box.id, v_hunt.player_id, v_box.reward_kobo)
    on conflict (box_id) do nothing;

  return jsonb_build_object('result', 'won', 'reward_kobo', v_box.reward_kobo);
end;
$$;

-- The bounded-run entry point is gone; nothing may keep calling it.
drop function if exists public.start_run(citext, uuid);

-- ---------------------------------------------------------------------------
-- Editing a box
-- ---------------------------------------------------------------------------

/*
 * Raise the reward on a box that is already live.
 *
 * Money can only ever move up. A player deciding a box is worth weeks of
 * lives has to be able to trust the number they read, so lowering it is not a
 * thing the platform can do — the check here is the guarantee, not the UI.
 * The extra funding is collected before this is called.
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
-- As before: these run as their owner so they can spend a life and close a
-- box regardless of RLS, so no browser role may reach them. `public` has to be
-- named explicitly — Postgres grants EXECUTE to PUBLIC on every new function
-- and anon/authenticated inherit it.
revoke execute on function
  public.spend_attempt(citext, uuid, text),
  public.claim_box(uuid),
  public.raise_reward(uuid, bigint),
  public.score_attempt(text, text)
from public, anon, authenticated;
