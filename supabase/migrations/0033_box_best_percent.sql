-- The best anyone has done on a box.
--
-- The play screen is a game scene now: a safe with ten locks across it that
-- open as a guess gets closer, and above it the number to beat — the highest
-- score any hunter has reached on this box. That last figure is read on every
-- page load and every guess, by everybody, which makes how it is obtained the
-- whole question.
--
-- It could be a query: `attempts` joined through `hunts` to the box, ordered by
-- score. That is two hops and a sort over every guess ever made against a
-- popular safe, for one number, on a screen that reloads after every attempt.
-- So it is a column instead, moved forward by the same function that writes
-- the score. `greatest` makes it monotonic — it can only ever go up, which is
-- what "the best so far" means and what stops a concurrent guess from lowering
-- it.
--
-- It is not personal data. It says a stranger once reached 62% on this
-- password; it does not say who, when, or with what.

alter table public.boxes
  add column if not exists best_percent numeric(5,2) not null default 0
  check (best_percent >= 0 and best_percent <= 100);

-- Backfill, so a board with history doesn't read as untouched.
update public.boxes b
   set best_percent = coalesce(top.score, 0)
  from (
    select h.box_id, max(a.score_percent) as score
      from public.attempts a
      join public.hunts h on h.id = a.hunt_id
     group by h.box_id
  ) top
 where top.box_id = b.id and b.best_percent < coalesce(top.score, 0);

/*
 * Spend a life, score a guess — now also raising the box's high-water mark.
 *
 * Unchanged in every other respect from 0028. The one new statement is folded
 * into the update that was already counting attempts, so a guess is still one
 * write to `boxes` rather than two.
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

  -- Second Wind, checked before the life pool is. `now()` is the transaction
  -- clock, so a window that lapses mid-guess still honours the guess in
  -- flight and charges the next one.
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
         players_count = players_count + case when v_ordinal = 0 then 1 else 0 end,
         best_percent = greatest(best_percent, v_score.score_percent)
   where id = p_box_id;

  if v_won then
    v_claimed := public.claim_box(v_hunt.id);
  end if;

  -- `free` tells the screen why the life counter didn't move, so an hour of
  -- Second Wind doesn't read as a bug.
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
-- Privileges
-- ---------------------------------------------------------------------------

-- CREATE OR REPLACE restores the default EXECUTE grant to PUBLIC every time,
-- so a re-created function has to be re-revoked.
revoke execute on function public.spend_attempt(citext, uuid, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
