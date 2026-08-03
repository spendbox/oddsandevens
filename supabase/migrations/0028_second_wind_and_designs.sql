-- Three changes, all of them about where the money and the time go.
--
-- 1. **Second Wind.** A power-up that suspends the life pool on one box for an
--    hour. Lives are checked and spent inside `spend_attempt`, so this has to
--    be enforced here rather than in a route — the route is not the thing that
--    decrements the counter.
--
-- 2. **Lives pay the contributor.** A life used to be pure platform revenue on
--    the grounds that it isn't attached to any box. That was true of the
--    accounting and false of the game: people buy lives *because* a particular
--    safe is in front of them. `life_orders` now records which box drove the
--    purchase and splits 70/30 exactly like a power-up.
--
-- 3. **Box designs.** A contributor picks the safe their box wears. It is
--    decoration and nothing else — no rule reads it — but it is theirs.

-- ---------------------------------------------------------------------------
-- The safe a box wears
-- ---------------------------------------------------------------------------

alter table public.boxes
  add column if not exists design text not null default 'brass';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'boxes_design_check'
  ) then
    alter table public.boxes
      add constraint boxes_design_check
      check (design in ('brass', 'vault', 'midnight', 'emerald', 'crimson', 'ivory'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A life sale now has a beneficiary
-- ---------------------------------------------------------------------------

-- `box_id` is nullable on purpose: lives bought from the player's own page,
-- with no box in front of them, still exist and are still ours alone. So are
-- lives bought on the platform's general box, which has no contributor.
alter table public.life_orders
  add column if not exists box_id uuid references public.boxes (id) on delete set null,
  add column if not exists contributor_id uuid references public.contributors (id) on delete set null,
  add column if not exists contributor_kobo bigint not null default 0,
  add column if not exists platform_kobo bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'life_orders_split_adds_up'
  ) then
    alter table public.life_orders
      add constraint life_orders_split_adds_up
      check (contributor_kobo >= 0 and platform_kobo >= 0
             and contributor_kobo + platform_kobo = price_kobo);
  end if;
end $$;

-- Everything sold before this migration was ours in full, and the constraint
-- above would reject those rows otherwise.
update public.life_orders
   set platform_kobo = price_kobo
 where platform_kobo = 0 and contributor_kobo = 0;

create index if not exists life_orders_contributor_idx
  on public.life_orders (contributor_id, status);

-- A contributor may read the life sales credited to them, on the same terms
-- as power-up sales. `using` names their own contributor row and nothing else.
drop policy if exists life_orders_read_own on public.life_orders;
create policy life_orders_read_own on public.life_orders
  for select using (
    contributor_id in (select id from public.contributors where owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Second Wind
-- ---------------------------------------------------------------------------

-- While it runs, a guess on this box costs nothing: no life is required and
-- none is spent. It is per-hunt, so it never leaks onto another box, and it is
-- read from the same `revealed` blob every other power-up writes into.
--
-- The window is read defensively. `revealed` is jsonb written by the
-- application, and a malformed timestamp there must fail closed — lives
-- charged as usual — rather than abort the guess.
create or replace function public.second_wind_until(p_revealed jsonb)
returns timestamptz
language plpgsql
immutable
as $$
declare v_raw text;
begin
  v_raw := nullif(p_revealed->>'secondWindUntil', '');
  if v_raw is null then
    return null;
  end if;
  begin
    return v_raw::timestamptz;
  exception when others then
    return null;
  end;
end;
$$;

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
         players_count = players_count + case when v_ordinal = 0 then 1 else 0 end
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

-- Both are re-created above, so both need re-revoking: CREATE OR REPLACE
-- restores the default EXECUTE grant to PUBLIC every time.
revoke execute on function
  public.spend_attempt(citext, uuid, text),
  public.second_wind_until(jsonb)
from public, anon, authenticated;
