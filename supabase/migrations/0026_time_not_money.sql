-- Make time, not money, the thing a box costs.
--
-- The hole this closes: a methodical player can isolate one position per
-- guess, so a box falls in a predictable number of attempts. With lives on
-- sale at a flat price and no limit on how many you can burn in a day, that
-- turned every box into an arithmetic problem — buy N lives, solve it, take a
-- reward worth many times what the lives cost. Patience wasn't required and
-- neither was skill; only a card.
--
-- The fix is a per-box daily ceiling on attempts. Money can now buy at most
-- about twice the pace of the free refill, and never more, so cracking a hard
-- box is a siege measured in days that everybody else can join. It does not by
-- itself make brute-forcing unprofitable — only a reward smaller than the
-- lives it costs would do that, and that is a pricing decision rather than a
-- schema one — but it removes the instant, private, risk-free version of it.
--
-- Also here: admins can hand out lives, which is the only way to apologise
-- when something goes wrong on our side.

-- ---------------------------------------------------------------------------
-- The daily ceiling
-- ---------------------------------------------------------------------------

-- Mirrors MAX_ATTEMPTS_PER_BOX_PER_DAY in src/lib/constants.ts.
create or replace function public.attempts_per_box_per_day() returns int
language sql immutable as $$ select 50 $$;

-- Counting attempts in a rolling 24 hours needs this to not be a table scan
-- on a busy box.
create index if not exists attempts_recent_idx
  on public.attempts (hunt_id, created_at desc);

/*
 * Spend one life on one guess.
 *
 * Everything happens here in a single transaction: the life comes off, the
 * attempt is recorded with the verdict it earned, and a correct guess closes
 * the box and opens the reward claim. Two requests can therefore never both
 * spend the last life, and the password is read, compared and dropped without
 * ever leaving Postgres.
 *
 * The daily ceiling is checked here rather than in a route handler for the
 * same reason everything else is: a limit that a second browser tab can race
 * past is not a limit. It is a *rolling* 24 hours rather than a calendar day,
 * so there is no midnight at which a solver gets a fresh fifty.
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
  v_today int;
  v_won boolean;
  v_claimed jsonb;
  v_next_slot timestamptz;
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

  -- The ceiling is checked before the life is taken, so hitting it costs
  -- nothing at all.
  select count(*) into v_today from public.attempts
    where hunt_id = v_hunt.id and created_at > now() - interval '24 hours';

  if v_today >= public.attempts_per_box_per_day() then
    -- When the oldest of today's attempts ages out, one slot opens.
    select created_at + interval '24 hours' into v_next_slot
      from public.attempts
     where hunt_id = v_hunt.id and created_at > now() - interval '24 hours'
     order by created_at
     limit 1;

    return jsonb_build_object(
      'result', 'error',
      'error', 'daily_cap',
      'attempts_today', v_today,
      'daily_cap', public.attempts_per_box_per_day(),
      'next_slot_at', v_next_slot
    );
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
    'attempts_today', v_today + 1,
    'daily_cap', public.attempts_per_box_per_day(),
    'outcome', coalesce(v_claimed->>'result', 'open'),
    'reward_kobo', v_claimed->'reward_kobo'
  );
end;
$$;

/** How many of today's fifty a player has spent on a box. Drives the UI. */
create or replace function public.attempts_today(p_email citext, p_box_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(count(a.id), 0)::int
    from public.hunts h
    join public.players p on p.id = h.player_id
    left join public.attempts a
      on a.hunt_id = h.id and a.created_at > now() - interval '24 hours'
   where h.box_id = p_box_id and p.email = p_email;
$$;

-- ---------------------------------------------------------------------------
-- Lives on the house
-- ---------------------------------------------------------------------------

/*
 * Hand a player lives, by address, creating them if they've never played.
 *
 * For when something breaks on our side and the honest fix is to give somebody
 * their afternoon back. Granted lives sit on top of the cap exactly like
 * bought ones — the refill won't top up past 7, but nothing takes these away.
 */
create or replace function public.admin_grant_lives(p_email citext, p_count int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
begin
  if p_count < 1 or p_count > 500 then
    return jsonb_build_object('result', 'error', 'error', 'invalid_count');
  end if;

  v_player := public.ensure_player(p_email);
  v_player := public.credit_lives(v_player.id, p_count);

  return jsonb_build_object(
    'result', 'granted',
    'email', v_player.email,
    'lives', v_player.lives
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
--
-- `public` has to be named explicitly: Postgres grants EXECUTE to PUBLIC on
-- every new function and anon/authenticated inherit it, so revoking from those
-- two alone would leave /rpc/admin_grant_lives open to the world.
revoke execute on function
  public.spend_attempt(citext, uuid, text),
  public.attempts_today(citext, uuid),
  public.admin_grant_lives(citext, int),
  public.attempts_per_box_per_day()
from public, anon, authenticated;
