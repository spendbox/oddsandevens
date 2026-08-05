-- Seeding: a board that isn't empty on its first day.
--
-- Nobody plays a game with no players in it, and a wall of cracked safes with
-- nothing on it is a wall that says "this has never worked". So an admin can
-- author a box that arrives already finished — a winner, a date, a number of
-- hunters and attempts — and can put a handful of names on the leaderboard of
-- a live one.
--
-- Three rules are built into the shape of this, and they are what keep it from
-- becoming a mess nobody can unpick a year from now.
--
--   **It is marked.** Every seeded box carries `seeded_at` and `seeded_by`.
--   Nothing has to guess later which numbers were real, and one `delete from`
--   removes the lot.
--
--   **It owes nobody money.** A seeded crack is written straight onto the box.
--   It does not go through `claim_box`, so no `reward_claims` row is created,
--   nothing appears on the payouts screen, and no email is sent to anybody. It
--   is a picture of a finished game, not a finished game.
--
--   **It invents no accounts.** A seeded winner and a seeded hunter are an
--   address on the box or on `box_seeds` — not a row in `players`. They never
--   hold lives, never count towards the per-address signup limit, and never
--   appear in the admin's list of people. Addresses are shown masked, exactly
--   as a real hunter's is, so `a**@g***.com` is all anybody ever sees.

-- ---------------------------------------------------------------------------
-- 1. Marks on the box
-- ---------------------------------------------------------------------------

alter table public.boxes
  add column if not exists seeded_at timestamptz,
  add column if not exists seeded_by text,
  /*
   * The winner, when there is no player row to point at.
   *
   * `unlocked_by` is a foreign key into `players`, which is right for a real
   * crack and impossible for a seeded one without inventing an account. This
   * carries the address instead, and every reader prefers it when it is set.
   */
  add column if not exists unlocked_alias citext;

create index if not exists boxes_seeded_idx
  on public.boxes (seeded_at desc)
  where seeded_at is not null;

-- ---------------------------------------------------------------------------
-- 2. The leaderboard of a box nobody has played yet
-- ---------------------------------------------------------------------------

/*
 * Deliberately not `hunts`.
 *
 * A hunt is a real relationship between a player and a box: it holds their
 * lives spent, what they have bought, what they have been told. Writing fake
 * ones would put invented rows in the middle of the table every real query
 * reads, and there would be no way to tell them apart afterwards. This is a
 * separate list that the play view merges in on its way out.
 */
create table if not exists public.box_seeds (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes (id) on delete cascade,
  email citext not null,
  percent numeric(5, 2) not null check (percent >= 0 and percent <= 100),
  /** 1 is closest. Fixes the order without depending on the percentage. */
  rank int not null check (rank between 1 and 10),
  created_at timestamptz not null default now(),
  created_by text,
  unique (box_id, rank)
);

alter table public.box_seeds enable row level security;
-- No policy: nothing reads this from a browser. The play view reads it through
-- the service role and hands back masked addresses.

create index if not exists box_seeds_box_idx on public.box_seeds (box_id, rank);

revoke all on public.box_seeds from anon, authenticated;
grant all on public.box_seeds to service_role;

-- ---------------------------------------------------------------------------
-- 3. Authoring one
-- ---------------------------------------------------------------------------

/**
 * Mark a box as cracked, without any of the machinery of cracking it.
 *
 * `claim_box` is the real path: it settles a winner, writes a reward claim,
 * clears the feature flag and stamps the hunt. None of that is wanted here —
 * there is no hunt, there is no winner to pay, and a claim row would put a
 * fictional debt on the admin's own payouts screen. So this writes the four
 * columns that make a box read as finished and nothing else.
 *
 * Refuses anything that isn't ours. A contributor's box has real money behind
 * it and a real player expecting to be able to win it; seeding one would be
 * taking their reward off the board.
 */
create or replace function public.seed_crack(
  p_box_id uuid,
  p_winner citext,
  p_when timestamptz,
  p_by text default null
)
returns public.boxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.boxes;
begin
  select * into v_box from public.boxes where id = p_box_id for update;
  if not found then
    raise exception 'box_not_found';
  end if;
  if v_box.kind <> 'general' then
    raise exception 'not_ours';
  end if;

  update public.boxes
     set status = 'unlocked',
         unlocked_at = coalesce(p_when, now()),
         unlocked_alias = nullif(trim(p_winner), ''),
         featured_at = null,
         seeded_at = coalesce(seeded_at, now()),
         seeded_by = coalesce(p_by, seeded_by)
   where id = p_box_id
  returning * into v_box;

  return v_box;
end;
$$;

/**
 * Set the two numbers a visitor reads before anything else.
 *
 * Only on our own boxes, and only ever as an absolute value — an increment
 * would make running the same request twice a different thing from running it
 * once, and this is a form somebody will save three times in a row.
 *
 * A seeded count is a floor rather than a fiction once people arrive: real
 * attempts still increment from wherever it was set, so the number only ever
 * grows from here.
 */
create or replace function public.seed_counts(
  p_box_id uuid,
  p_attempts bigint,
  p_players bigint,
  p_by text default null
)
returns public.boxes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.boxes;
begin
  update public.boxes
     set attempts_count = greatest(0, p_attempts),
         players_count = greatest(0, p_players),
         seeded_at = coalesce(seeded_at, now()),
         seeded_by = coalesce(p_by, seeded_by)
   where id = p_box_id
     and kind = 'general'
  returning * into v_box;

  if not found then
    raise exception 'not_ours';
  end if;
  return v_box;
end;
$$;

/**
 * Replace a box's seeded leaderboard wholesale.
 *
 * Wholesale for the same reason the pricing and alphabet settings are: the
 * screen sends the whole list it is showing, so removing a row there removes
 * it here and there is no separate delete to forget.
 */
create or replace function public.set_box_seeds(
  p_box_id uuid,
  p_rows jsonb,
  p_by text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_rank int := 0;
  v_kind text;
begin
  select kind into v_kind from public.boxes where id = p_box_id;
  if v_kind is null then
    raise exception 'box_not_found';
  end if;
  if v_kind <> 'general' then
    raise exception 'not_ours';
  end if;

  delete from public.box_seeds where box_id = p_box_id;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    exit when v_rank >= 10;
    if coalesce(trim(v_row ->> 'email'), '') = '' then
      continue;
    end if;
    v_rank := v_rank + 1;
    insert into public.box_seeds (box_id, email, percent, rank, created_by)
    values (
      p_box_id,
      trim(v_row ->> 'email'),
      least(100, greatest(0, coalesce((v_row ->> 'percent')::numeric, 0))),
      v_rank,
      p_by
    );
  end loop;

  update public.boxes
     set seeded_at = coalesce(seeded_at, now()),
         seeded_by = coalesce(p_by, seeded_by)
   where id = p_box_id;

  return v_rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Closed, like everything else
-- ---------------------------------------------------------------------------

revoke execute on function public.seed_crack(uuid, citext, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.seed_counts(uuid, bigint, bigint, text)
  from public, anon, authenticated;
revoke execute on function public.set_box_seeds(uuid, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.seed_crack(uuid, citext, timestamptz, text) to service_role;
grant execute on function public.seed_counts(uuid, bigint, bigint, text) to service_role;
grant execute on function public.set_box_seeds(uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';
