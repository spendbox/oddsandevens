-- A ceiling a player can raise.
--
-- The life pool refills one an hour and stops at seven, and that stop is the
-- real cost of a long hunt: an evening away banks seven guesses and every hour
-- after that is thrown away. Life Bank sells the ceiling itself — twenty-four
-- instead of seven, so a full day of accrual lands instead of overflowing.
--
-- It is the only power-up that isn't about the password, and the only one whose
-- effect outlives the box it was bought on. That is deliberate and it is what
-- the shelf says: the pool is one pool, shared across every safe, so raising
-- its ceiling on one box and not another would be a rule with nowhere to live.
--
-- The cap moves from a constant to a column. `lives_max()` stays as the default
-- for everyone who hasn't bought one, so nothing that reads it needs to change
-- its mind about what "full" means for an ordinary player.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists lives_max int;

alter table public.players
  drop constraint if exists players_lives_max_check;

-- Never below the platform default, never absurd. Null means "the default",
-- which is what almost every row will always be.
alter table public.players
  add constraint players_lives_max_check
  check (lives_max is null or (lives_max >= 1 and lives_max <= 200));

/** This player's ceiling: their own, or the platform's if they've not raised it. */
create or replace function public.life_cap(p_player public.players)
returns int
language sql
immutable
as $$
  select greatest(coalesce(p_player.lives_max, public.lives_max()), public.lives_max());
$$;

-- ---------------------------------------------------------------------------
-- 2. Accrual, against the player's own ceiling
-- ---------------------------------------------------------------------------

/*
 * Bring a player's life pool up to date, and return the row.
 *
 * Unchanged except that "full" is now `life_cap(player)` rather than a
 * constant. The refill clock still advances by whole hours rather than being
 * reset to now(), so a player who checks back after 90 minutes banks one life
 * and keeps the spare 30 minutes towards the next — otherwise frequent polling
 * would quietly reset the timer forever.
 */
create or replace function public.sync_lives(p_player_id uuid)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_gain int;
  v_cap int;
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  v_cap := public.life_cap(v_player);

  if v_player.lives >= v_cap then
    -- Already full: park the clock at now so the next spend starts a fresh hour.
    update public.players set lives_accrued_at = now()
      where id = v_player.id returning * into v_player;
    return v_player;
  end if;

  v_gain := floor(
    extract(epoch from (now() - v_player.lives_accrued_at))
    / extract(epoch from public.life_regen())
  )::int;
  if v_gain <= 0 then
    return v_player;
  end if;

  if v_player.lives + v_gain >= v_cap then
    update public.players
       set lives = v_cap, lives_accrued_at = now()
     where id = v_player.id returning * into v_player;
  else
    update public.players
       set lives = v_player.lives + v_gain,
           lives_accrued_at = v_player.lives_accrued_at + (v_gain * public.life_regen())
     where id = v_player.id returning * into v_player;
  end if;

  return v_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Buying one
-- ---------------------------------------------------------------------------

/*
 * Raise this player's ceiling, and fill them to it.
 *
 * Called by the power-up settlement once Paystack has confirmed the money, and
 * by nothing else. `greatest` rather than a plain assignment because the whole
 * point is that it never goes down — a second purchase, a replayed webhook or a
 * future larger bank all have to be safe.
 *
 * The top-up is part of the product rather than a courtesy. A ceiling that
 * takes seventeen hours to become visible is a purchase that appears to have
 * done nothing, and "it will matter tomorrow" is not something a player should
 * have to take on trust from a payment screen.
 */
create or replace function public.grant_life_bank(p_player_id uuid, p_to int)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_cap int;
begin
  update public.players
     set lives_max = greatest(coalesce(lives_max, public.lives_max()), p_to)
   where id = p_player_id
  returning * into v_player;

  if not found then
    raise exception 'player_not_found';
  end if;

  v_cap := public.life_cap(v_player);

  update public.players
     set lives = greatest(lives, v_cap),
         lives_accrued_at = now()
   where id = p_player_id
  returning * into v_player;

  return v_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.sync_lives(uuid),
  public.grant_life_bank(uuid, int),
  public.life_cap(public.players)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
