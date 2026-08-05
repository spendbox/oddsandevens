-- Where an account was born, as a hash.
--
-- The cheapest attack on a large safe is not clever, it is clerical: a fresh
-- address is seven free lives and one an hour, so a 26-character password —
-- about 1,900 attempts — is roughly 270 throwaway inboxes and a fortnight of
-- patience. Nothing in the game notices, because nothing in the game has ever
-- known that two accounts arrived from the same place.
--
-- This is the smallest thing that changes that: one column, written once, at
-- the moment an account is created. It is a **hash** — salted with
-- `IP_HASH_SALT` in the app, never the address itself — because the question
-- worth answering is "did these two accounts come from the same place", and a
-- hash answers exactly that and nothing else. There is no way back to an IP
-- from this column, which is the point: it is evidence about a *pattern* and
-- not a record of where anybody lives.
--
-- Deliberately *not* enforcement by default. The limit below ships at zero,
-- meaning off, because Nigerian carrier NAT can put thousands of real players
-- behind one address and a cap set by guesswork would lock out a whole network
-- to stop one farmer. Record first, look at `ip_clusters()` in the admin
-- screen, then choose a number that fits what is actually there.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists signup_ip_hash text;

-- Partial: most rows predate this and will never have one, and an index over a
-- column that is mostly null is mostly wasted pages.
create index if not exists players_signup_ip_idx
  on public.players (signup_ip_hash, created_at desc)
  where signup_ip_hash is not null;

/**
 * Stamp an account with where it came from — once, and never again.
 *
 * `where signup_ip_hash is null` is the whole safety of this. The column
 * records *creation*, so the first sight wins: a player who signs in from a
 * café six months later must not overwrite the address their account was made
 * from, or the column stops answering the only question it exists for.
 */
create or replace function public.record_signup_ip(p_player_id uuid, p_ip_hash text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.players
     set signup_ip_hash = p_ip_hash
   where id = p_player_id
     and signup_ip_hash is null
     and nullif(trim(p_ip_hash), '') is not null;
$$;

/** How many accounts this address has made in the last `p_hours`. */
create or replace function public.accounts_from_ip(p_ip_hash text, p_hours int default 24)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.players
   where signup_ip_hash = p_ip_hash
     and created_at > now() - make_interval(hours => greatest(1, p_hours));
$$;

/**
 * Addresses with more than one account behind them, busiest first.
 *
 * The screen this feeds is the reason the limit ships off: an admin should be
 * able to see that the top cluster is eleven accounts over a week — a shared
 * office, a family, a carrier — before deciding what number would have caught
 * a farmer without catching them.
 */
create or replace function public.ip_clusters(p_hours int default 168, p_limit int default 20)
returns table (
  ip_hash text,
  accounts int,
  first_at timestamptz,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select signup_ip_hash,
         count(*)::int,
         min(created_at),
         max(created_at)
    from public.players
   where signup_ip_hash is not null
     and created_at > now() - make_interval(hours => greatest(1, p_hours))
   group by signup_ip_hash
  having count(*) > 1
   order by count(*) desc, max(created_at) desc
   limit greatest(1, p_limit);
$$;

-- ---------------------------------------------------------------------------
-- 2. The limit, in the same place as the prices and the alphabet
-- ---------------------------------------------------------------------------

insert into public.platform_settings (key, value)
values ('limits', '{}'::jsonb)
on conflict (key) do nothing;

/** The limits blob, or an empty object. Never null. */
create or replace function public.limit_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.platform_settings where key = 'limits'),
    '{}'::jsonb
  );
$$;

create or replace function public.set_limit_settings(p_value jsonb, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_limits';
  end if;

  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('limits', p_value, nullif(trim(p_by), ''), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_value;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Closed, like everything else
-- ---------------------------------------------------------------------------

revoke execute on function public.record_signup_ip(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.accounts_from_ip(text, int)
  from public, anon, authenticated;
revoke execute on function public.ip_clusters(int, int)
  from public, anon, authenticated;
revoke execute on function public.limit_settings()
  from public, anon, authenticated;
revoke execute on function public.set_limit_settings(jsonb, text)
  from public, anon, authenticated;

grant execute on function public.record_signup_ip(uuid, text) to service_role;
grant execute on function public.accounts_from_ip(text, int) to service_role;
grant execute on function public.ip_clusters(int, int) to service_role;
grant execute on function public.limit_settings() to service_role;
grant execute on function public.set_limit_settings(jsonb, text) to service_role;

notify pgrst, 'reload schema';
