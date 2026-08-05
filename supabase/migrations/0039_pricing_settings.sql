-- Prices an admin can change without a deploy.
--
-- Every price on the platform has been a constant in TypeScript: the share of
-- the reward each power-up costs, its floor, what a life costs, and what
-- Spendbox keeps of a sale. That is the right *default* and the wrong only
-- answer — a shelf whose prices need a code review and a deploy is a shelf
-- nobody experiments with, and the numbers were guesses to begin with.
--
-- So: one row of settings, read at request time by the two paths that actually
-- charge money and the one that quotes them. The TypeScript constants remain,
-- and remain authoritative for anything the database hasn't overridden — which
-- means a missing row, an empty object, or a key nobody has touched all behave
-- identically to today.
--
-- It is deliberately one jsonb blob rather than a table of columns. The shape
-- is read by exactly one consumer, it changes whenever the shelf does, and a
-- migration per price would be the very thing this exists to avoid.

-- ---------------------------------------------------------------------------
-- 1. The store
-- ---------------------------------------------------------------------------

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.platform_settings enable row level security;
-- No policy at all: nothing reads this from a browser. Both accessors below
-- are `security definer`, and the admin route reaches them through the
-- service role.

insert into public.platform_settings (key, value)
values ('pricing', '{}'::jsonb)
on conflict (key) do nothing;

/** The pricing blob, or an empty object. Never null, so callers needn't check. */
create or replace function public.pricing_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.platform_settings where key = 'pricing'),
    '{}'::jsonb
  );
$$;

/**
 * Replace the pricing blob wholesale.
 *
 * Wholesale rather than merged on purpose: the admin screen sends the entire
 * shape it is displaying, so a key removed there is a key removed here, and
 * "how do I put a price *back* to the default" has an obvious answer — clear
 * the field.
 */
create or replace function public.set_pricing_settings(p_value jsonb, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_settings';
  end if;

  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('pricing', p_value, nullif(trim(p_by), ''), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_value;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Life Bank rents rather than sells
-- ---------------------------------------------------------------------------

/*
 * 0037 made the raised ceiling permanent. It is a week now, which needs an
 * expiry beside the value — and `life_cap` has to fall back to the platform
 * default the moment that passes, rather than at the next purchase or on some
 * sweep that might never run.
 *
 * A lapsed ceiling does *not* take lives away. Somebody sitting on nineteen
 * when their week runs out keeps all nineteen and simply stops accruing until
 * they are back under seven, which is the same rule that has always applied to
 * lives bought outright or given as a gift.
 */
alter table public.players
  add column if not exists lives_max_until timestamptz;

create or replace function public.life_cap(p_player public.players)
returns int
language sql
stable
as $$
  select case
    when p_player.lives_max is null then public.lives_max()
    when p_player.lives_max_until is null then greatest(p_player.lives_max, public.lives_max())
    when p_player.lives_max_until > now() then greatest(p_player.lives_max, public.lives_max())
    else public.lives_max()
  end;
$$;

/*
 * Buy, or extend, a week of the raised ceiling.
 *
 * Extending rather than replacing: somebody who buys a second week three days
 * into the first gets ten days, not seven. A renewal that threw away what was
 * left would punish renewing early, which is the opposite of what a weekly
 * thing wants.
 */
create or replace function public.grant_life_bank(
  p_player_id uuid,
  p_to int,
  p_days int default 7
)
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
     set lives_max = greatest(coalesce(lives_max, public.lives_max()), p_to),
         lives_max_until = greatest(coalesce(lives_max_until, now()), now())
                           + make_interval(days => greatest(1, p_days))
   where id = p_player_id
  returning * into v_player;

  if not found then
    raise exception 'player_not_found';
  end if;

  v_cap := public.life_cap(v_player);

  -- Filled to the new ceiling on the spot. A ceiling that takes seventeen
  -- hours to become visible is a purchase that appears to have done nothing.
  update public.players
     set lives = greatest(lives, v_cap),
         lives_accrued_at = now()
   where id = p_player_id
  returning * into v_player;

  return v_player;
end;
$$;

-- The two-argument version from 0037 is gone; nothing may call it by accident.
drop function if exists public.grant_life_bank(uuid, int);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.pricing_settings(),
  public.set_pricing_settings(jsonb, text),
  public.life_cap(public.players),
  public.grant_life_bank(uuid, int, int)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
