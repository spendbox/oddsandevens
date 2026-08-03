-- One number instead of three, and the breakdown goes on sale.
--
-- What changed:
--
--   * **The daily ceiling is gone.** Play as fast as you can afford to.
--
--   * **A guess scores a percentage.** Every position earns points on a scale
--     the player is never shown, and the total is normalised against a perfect
--     guess. 100% means solved and nothing else does.
--
--   * **The breakdown is a purchase.** By default an attempt answers with its
--     length hint and one number. What that number is *made of* — how much came
--     from exact hits, from characters sitting in the wrong place, from the
--     right letter in the wrong case — is a power-up, and it is withheld here
--     rather than merely hidden in the browser.
--
-- Why a single opaque number is harder than three labelled counts: a percentage
-- is a sum, and a sum can be arrived at many ways. Moving one position and
-- watching the total shift tells you *something happened* but not what, so a
-- player has to reason about which of several explanations fits — until they
-- buy the answer.
--
-- The weights live only in `score_attempt`. They are never sent to a browser,
-- never written into a column, and never printed in any copy.

-- ---------------------------------------------------------------------------
-- Out with the ceiling
-- ---------------------------------------------------------------------------

drop function if exists public.attempts_today(citext, uuid);
drop function if exists public.attempts_per_box_per_day();
drop index if exists public.attempts_recent_idx;

-- ---------------------------------------------------------------------------
-- The new verdict
-- ---------------------------------------------------------------------------

-- `exact_count` and `miscase_count` already exist; the third component and the
-- score itself are new. All three components stay server-side unless the hunt
-- has bought the breakdown.
alter table public.attempts
  add column if not exists elsewhere_count int not null default 0
    check (elsewhere_count >= 0),
  add column if not exists score_percent numeric(5,2) not null default 0
    check (score_percent between 0 and 100);

/*
 * Mark one guess against one password.
 *
 * Each position earns points, and the total is expressed as a percentage of a
 * perfect guess. The weights are deliberately not documented anywhere a player
 * can reach and are not equal, so a given percentage rarely has one obvious
 * explanation — which is the entire difficulty now that the components are
 * behind a paywall.
 *
 * Three passes, in this order, each position scoring at most once:
 *
 *   1. Right character, right place, right case.
 *   2. Right letter, right place, wrong case.
 *   3. Right character sitting somewhere else in the password. Budgeted like
 *      Wordle's oranges — a second `a` only scores if a second `a` is actually
 *      going spare — so duplicates can't be farmed for free points.
 *
 * The denominator is the *longer* of the two strings, so padding a guess out
 * past the password dilutes the score rather than being free. That is what
 * makes 100% mean solved and nothing else: reaching it needs every position
 * exact AND the lengths equal.
 *
 * Dropped rather than replaced: it returns two more columns than it used to,
 * and CREATE OR REPLACE won't change a return type.
 */
drop function if exists public.score_attempt(text, text);

create or replace function public.score_attempt(p_secret text, p_guess text)
returns table (
  length_hint text,
  exact_count int,
  miscase_count int,
  elsewhere_count int,
  score_percent numeric
)
language plpgsql
immutable
as $$
declare
  -- The weights. Not shown to anyone, ever.
  w_exact     constant int := 100;
  w_miscase   constant int := 10;
  w_elsewhere constant int := 30;

  v_slen int := char_length(p_secret);
  v_glen int := char_length(p_guess);
  v_overlap int := least(v_slen, v_glen);
  v_span int := greatest(v_slen, v_glen);
  v_i int;
  v_s text;
  v_g text;
  v_scored boolean[];
  v_spare text[] := '{}';
  v_idx int;
  v_points int := 0;
begin
  length_hint := case
    when v_glen < v_slen then 'shorter'
    when v_glen > v_slen then 'longer'
    else 'exact'
  end;
  exact_count := 0;
  miscase_count := 0;
  elsewhere_count := 0;
  score_percent := 0;

  if v_span = 0 then
    return next;
    return;
  end if;

  v_scored := array_fill(false, array[greatest(v_overlap, 1)]);

  -- Pass 1: exact hits. Everything they consume leaves the pool.
  for v_i in 1..greatest(v_overlap, 0) loop
    if substr(p_guess, v_i, 1) = substr(p_secret, v_i, 1) then
      exact_count := exact_count + 1;
      v_points := v_points + w_exact;
      v_scored[v_i] := true;
    end if;
  end loop;

  -- Pass 2: right letter, right place, wrong case.
  for v_i in 1..greatest(v_overlap, 0) loop
    if not v_scored[v_i] then
      v_s := substr(p_secret, v_i, 1);
      v_g := substr(p_guess, v_i, 1);
      if lower(v_g) = lower(v_s) then
        miscase_count := miscase_count + 1;
        v_points := v_points + w_miscase;
        v_scored[v_i] := true;
      end if;
    end if;
  end loop;

  -- What's left of the password after the first two passes. A position beyond
  -- the guess's length is unclaimed too, so a short guess can still find a
  -- character that lives further along.
  for v_i in 1..v_slen loop
    if v_i > v_overlap or not v_scored[v_i] then
      v_spare := array_append(v_spare, lower(substr(p_secret, v_i, 1)));
    end if;
  end loop;

  -- Pass 3: right character, wrong place, budgeted against what's spare.
  for v_i in 1..greatest(v_overlap, 0) loop
    if not v_scored[v_i] then
      v_g := lower(substr(p_guess, v_i, 1));
      v_idx := array_position(v_spare, v_g);
      if v_idx is not null then
        v_spare := v_spare[1:v_idx - 1] || v_spare[v_idx + 1:array_length(v_spare, 1)];
        elsewhere_count := elsewhere_count + 1;
        v_points := v_points + w_elsewhere;
      end if;
    end if;
  end loop;

  score_percent := round((v_points::numeric * 100) / (v_span * w_exact), 2);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Taking a shot
-- ---------------------------------------------------------------------------

/*
 * Spend one life on one guess.
 *
 * The life comes off, the attempt is recorded with the verdict it earned, and
 * a correct guess closes the box and opens the reward claim — one statement,
 * so two requests can never both spend the last life and the password is read,
 * compared and dropped without ever leaving Postgres.
 *
 * The component counts are stored but only the percentage is returned. The
 * route hands back the breakdown separately, and only to a hunt that has
 * bought it.
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

  insert into public.hunts (box_id, player_id) values (p_box_id, v_player.id)
    on conflict (box_id, player_id) do nothing;
  select * into v_hunt from public.hunts
    where box_id = p_box_id and player_id = v_player.id for update;

  if v_hunt.won_at is not null then
    return jsonb_build_object('result', 'error', 'error', 'already_won');
  end if;

  if v_player.lives < 1 then
    return jsonb_build_object(
      'result', 'error',
      'error', 'no_lives',
      'next_life_at', v_player.lives_accrued_at + public.life_regen()
    );
  end if;

  update public.players set lives = lives - 1
    where id = v_player.id returning * into v_player;

  select * into v_score from public.score_attempt(v_box.secret, p_guess);
  v_won := (p_guess = v_box.secret);
  v_ordinal := v_hunt.attempts_count;

  insert into public.attempts (
    hunt_id, ordinal, value, length_hint,
    exact_count, miscase_count, elsewhere_count, score_percent
  )
  values (
    v_hunt.id, v_ordinal, p_guess, v_score.length_hint,
    v_score.exact_count, v_score.miscase_count, v_score.elsewhere_count,
    v_score.score_percent
  );

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

  -- Note what is absent: the component counts. They are on the row for when
  -- the breakdown is bought, and they do not travel until then.
  return jsonb_build_object(
    'result', 'scored',
    'length_hint', v_score.length_hint,
    'score_percent', v_score.score_percent,
    'lives_left', v_player.lives,
    'outcome', coalesce(v_claimed->>'result', 'open'),
    'reward_kobo', v_claimed->'reward_kobo'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Attempts made under the old three-count scheme have no percentage. They can
-- be rescored exactly, since the password they were made against is still on
-- the box.
-- The rescoring is computed in a subquery rather than a lateral hanging off
-- the UPDATE target: an UPDATE's own table isn't visible to its FROM clause.
update public.attempts a
   set exact_count = s.exact_count,
       miscase_count = s.miscase_count,
       elsewhere_count = s.elsewhere_count,
       score_percent = s.score_percent
  from (
    select old.id,
           sc.exact_count,
           sc.miscase_count,
           sc.elsewhere_count,
           sc.score_percent
      from public.attempts old
      join public.hunts h on h.id = old.hunt_id
      join public.boxes b on b.id = h.box_id
      cross join lateral public.score_attempt(b.secret, old.value) sc
     where old.score_percent = 0
  ) s
 where a.id = s.id;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.spend_attempt(citext, uuid, text),
  public.score_attempt(text, text)
from public, anon, authenticated;
