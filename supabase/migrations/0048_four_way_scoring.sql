-- Scoring, told properly: place and case are two questions, not one and a half.
--
-- 0027 scored three things — right place and right case, right place and wrong
-- case, and "somewhere else". That third pass was case-*insensitive*, and
-- collapsing case there is what made the whole scale read wrongly:
--
--   * A character found in the wrong place (30) outscored the same character
--     found in the right place with the wrong case (10). Getting the position
--     right was worth *less* than getting it wrong, which is backwards on the
--     face of it and actively misleading in play. A player walking a character
--     across the positions saw the score dip exactly where the character
--     belonged, and every natural reading of that — highest score wins — put
--     it in one of the positions it wasn't.
--   * `x` in the wrong place and `X` in the wrong place scored identically, so
--     the wrong-place pass said nothing at all about case. Half the alphabet
--     was invisible to a third of the scoring.
--
-- Place and case are independent, so there are four outcomes for a character
-- and the scale now has four weights:
--
--                       right place        wrong place
--     right case            100                 40
--     wrong case             40                 20
--
-- Which encodes the two rules the old scale broke. Right place with the wrong
-- case (40) beats wrong place with the wrong case (20) — position is always
-- worth something. And right case in the wrong place (40) is worth the same as
-- wrong case in the right place (40): those are the two ways of being one step
-- from a character, they cost the same to fix, and a player should not be able
-- to tell them apart from the total. That equality is deliberate. The scale
-- exists to make a number that has several explanations, and two components of
-- identical weight are the cheapest honest way to keep it that way.
--
-- The weights themselves remain undocumented anywhere a player can reach.
--
-- Everything else about the shape is 0027's and is unchanged: three passes in
-- order, each position scoring at most once, wrong-place hits budgeted against
-- what is actually spare so duplicates can't be farmed, and the denominator the
-- *longer* of the two strings so that 100% still means solved and nothing else
-- does.

-- ---------------------------------------------------------------------------
-- The fourth count
-- ---------------------------------------------------------------------------

-- Colour Read sells the score taken apart, and a breakdown that cannot account
-- for its own total is not worth what it costs. `elsewhere_count` keeps its
-- meaning — right character, wrong place, right case — and the new column
-- carries the cheaper half that used to be silently folded into it.
alter table public.attempts
  add column if not exists elsewhere_miscase_count int not null default 0
    check (elsewhere_miscase_count >= 0);

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: it returns one more column than it used to,
-- and CREATE OR REPLACE won't change a return type.
drop function if exists public.score_attempt(text, text);

create or replace function public.score_attempt(p_secret text, p_guess text)
returns table (
  length_hint text,
  exact_count int,
  miscase_count int,
  elsewhere_count int,
  elsewhere_miscase_count int,
  score_percent numeric
)
language plpgsql
immutable
as $$
declare
  -- The weights. Not shown to anyone, ever.
  w_exact           constant int := 100;  -- right place, right case
  w_miscase         constant int := 40;   -- right place, wrong case
  w_moved           constant int := 40;   -- wrong place, right case
  w_moved_miscase   constant int := 20;   -- wrong place, wrong case

  v_slen int := char_length(p_secret);
  v_glen int := char_length(p_guess);
  v_overlap int := least(v_slen, v_glen);
  v_span int := greatest(v_slen, v_glen);
  v_i int;
  v_s text;
  v_g text;
  v_scored boolean[];
  -- Spare characters keep their own case now, because pass 3 has to be able to
  -- tell `x` from `X`. Lowercasing them on the way in is precisely the bug.
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
  elsewhere_miscase_count := 0;
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

  -- Pass 2: right letter, right place, wrong case. Before pass 3, so a
  -- character standing in its own position is always scored as that rather
  -- than as a wandering copy of itself.
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
      v_spare := array_append(v_spare, substr(p_secret, v_i, 1));
    end if;
  end loop;

  -- Pass 3: right character, wrong place, budgeted against what's spare.
  --
  -- Two tiers, and the exact-case one is tried first: a guess holding `x` when
  -- the password has both `x` and `X` going spare should be credited with the
  -- one it actually typed. Matching is greedy left to right rather than
  -- globally optimal, which can in principle leave a later position a worse
  -- match than a rearrangement would have given it. That is 0027's behaviour
  -- and it is kept on purpose: a scorer that solves an assignment problem is a
  -- scorer whose output cannot be reasoned about one position at a time.
  for v_i in 1..greatest(v_overlap, 0) loop
    if not v_scored[v_i] then
      v_g := substr(p_guess, v_i, 1);

      v_idx := array_position(v_spare, v_g);
      if v_idx is not null then
        v_spare := v_spare[1:v_idx - 1] || v_spare[v_idx + 1:array_length(v_spare, 1)];
        elsewhere_count := elsewhere_count + 1;
        v_points := v_points + w_moved;
      else
        -- No exact-case copy going spare. Take a differently-cased one if
        -- there is one, for less. `select into` leaves v_idx null when the
        -- query finds nothing, which is the whole of the "no match" case.
        select i into v_idx
          from generate_subscripts(v_spare, 1) i
         where lower(v_spare[i]) = lower(v_g)
         order by i
         limit 1;

        if v_idx is not null then
          v_spare := v_spare[1:v_idx - 1] || v_spare[v_idx + 1:array_length(v_spare, 1)];
          elsewhere_miscase_count := elsewhere_miscase_count + 1;
          v_points := v_points + w_moved_miscase;
        end if;
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

-- 0034's `spend_attempt`, reproduced whole with the new count written onto the
-- attempt. A function is replaced entire or not at all.
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
  v_free boolean;
  v_wind timestamptz;
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

  v_wind := public.second_wind_until(v_hunt.revealed);
  v_free := v_wind is not null and v_wind > now();

  if not v_free then
    if v_player.lives < 1 then
      return jsonb_build_object(
        'result', 'error',
        'error', 'no_lives',
        'next_life_at', v_player.lives_accrued_at + public.life_regen()
      );
    end if;

    update public.players set lives = lives - 1
      where id = v_player.id returning * into v_player;
  end if;

  select * into v_score from public.score_attempt(v_box.secret, p_guess);
  v_won := (p_guess = v_box.secret);
  v_ordinal := v_hunt.attempts_count;

  insert into public.attempts (
    hunt_id, ordinal, value, length_hint,
    exact_count, miscase_count, elsewhere_count, elsewhere_miscase_count,
    score_percent
  )
  values (
    v_hunt.id, v_ordinal, p_guess, v_score.length_hint,
    v_score.exact_count, v_score.miscase_count, v_score.elsewhere_count,
    v_score.elsewhere_miscase_count, v_score.score_percent
  );

  update public.hunts
     set attempts_count = v_ordinal + 1,
         last_attempt_at = now(),
         best_percent = greatest(best_percent, v_score.score_percent),
         won_at = case when v_won then now() else won_at end
   where id = v_hunt.id;

  update public.boxes
     set attempts_count = attempts_count + 1,
         players_count = players_count + case when v_ordinal = 0 then 1 else 0 end,
         best_percent = greatest(best_percent, v_score.score_percent)
   where id = p_box_id;

  if v_won then
    v_claimed := public.claim_box(v_hunt.id);
  end if;

  return jsonb_build_object(
    'result', 'scored',
    'length_hint', v_score.length_hint,
    'score_percent', v_score.score_percent,
    'lives_left', v_player.lives,
    'free', v_free,
    'second_wind_until', v_wind,
    'outcome', coalesce(v_claimed->>'result', 'open'),
    'reward_kobo', v_claimed->'reward_kobo'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Every past attempt is rescored, and this is not optional tidying.
--
-- A score is a percentage of a perfect guess, which only means anything if
-- every score on the board is on the same scale. Leaving history alone would
-- put two scales in one column: a player's best of 62% and a rival's 58% would
-- no longer be comparable, `best_percent` would be the high-water mark of a
-- measure that changed underneath it, and the ten cracks drawn on every safe
-- would be reading a mixture of both.
--
-- It is exact rather than approximate — the password is still on the box and
-- the guess is still on the attempt, so the new function can simply be run
-- against them. Some bests will move, in both directions. 0027 rescored the
-- whole table for the same reason.
--
-- Computed in a subquery rather than a lateral hanging off the UPDATE target:
-- an UPDATE's own table isn't visible to its FROM clause.
update public.attempts a
   set exact_count = s.exact_count,
       miscase_count = s.miscase_count,
       elsewhere_count = s.elsewhere_count,
       elsewhere_miscase_count = s.elsewhere_miscase_count,
       score_percent = s.score_percent
  from (
    select old.id,
           sc.exact_count,
           sc.miscase_count,
           sc.elsewhere_count,
           sc.elsewhere_miscase_count,
           sc.score_percent
      from public.attempts old
      join public.hunts h on h.id = old.hunt_id
      join public.boxes b on b.id = h.box_id
      cross join lateral public.score_attempt(b.secret, old.value) sc
  ) s
 where a.id = s.id;

-- The two high-water marks are derived from the attempts, so they are rebuilt
-- from the attempts rather than nudged. A hunt or a box with nothing under it
-- falls back to zero, which is what it started as.
update public.hunts h
   set best_percent = coalesce(
     (select max(a.score_percent) from public.attempts a where a.hunt_id = h.id),
     0
   );

update public.boxes b
   set best_percent = coalesce(
     (select max(a.score_percent)
        from public.attempts a
        join public.hunts h on h.id = a.hunt_id
       where h.box_id = b.id),
     0
   );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Both were just dropped or replaced, which restores the default EXECUTE grant
-- to PUBLIC. PostgREST would otherwise happily let a browser call
-- /rpc/score_attempt with a password of its choosing.
revoke execute on function
  public.spend_attempt(citext, uuid, text),
  public.score_attempt(text, text)
from public, anon, authenticated;

notify pgrst, 'reload schema';
