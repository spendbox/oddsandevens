-- Spendbox, rebuilt around one game: guess the password, unlock the safe.
--
-- Everything the platform used to be — tile grids, arcade games, redemption
-- codes, loyalty, merchant plans — is retired here in one go, and replaced by
-- a much smaller model:
--
--   boxes      a password, a prize, and a status. Either the platform's own
--              public box or one a contributor staked money on.
--   players    an email and a pool of lives, shared across every box.
--   runs       one life spent on one box, worth a fixed number of guesses.
--   guesses    what was typed and the three-colour verdict it earned.
--
-- Trust model, unchanged in spirit:
--   * Contributors authenticate via Supabase Auth. RLS lets them READ their
--     own rows. Every write goes through a Next.js route handler using the
--     service-role key.
--   * Players are identified by a signed email cookie and have no table
--     access at all — `boxes.secret` must never be selectable by anyone but
--     the service role, so the play page only ever talks to route handlers.

-- ---------------------------------------------------------------------------
-- Out with the old
-- ---------------------------------------------------------------------------

drop table if exists
  public.game_referral_claims,
  public.game_referrals,
  public.game_season_winners,
  public.game_seasons,
  public.game_prizes,
  public.game_plays,
  public.game_lives,
  public.games,
  public.merchant_lives_weekly,
  public.merchant_lives,
  public.life_purchases,
  public.unlocked_rewards,
  public.customer_merchant_state,
  public.play_ip_state,
  public.tiles,
  public.rewards,
  public.reward_templates,
  public.grid_images,
  public.grids,
  public.payments,
  public.customers,
  public.merchants,
  public.app_settings,
  public.verification_codes
cascade;

-- The retired game logic lived entirely in public functions; none of it
-- survives the rewrite, and leaving orphans around would only invite a stale
-- `rpc()` call to keep working.
--
-- Functions installed *by an extension* are excluded. citext puts its I/O
-- functions in public, and dropping one takes the extension — and every citext
-- column below — with it.
create extension if not exists citext;

do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e'
       )
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- Anyone can be a contributor. There is no business here: a contributor is a
-- person who staked money on a password and wants people to attack it.
create table public.contributors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  handle text not null unique check (handle ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  -- Where the 70% share of power-up sales settles. Paystack splits at
  -- settlement via the subaccount, so the money never passes through us.
  payout_bank_code text,
  payout_bank_name text,
  payout_account_number text,
  payout_account_name text,
  paystack_subaccount_code text,
  created_at timestamptz not null default now()
);

-- A player is an email address and a pool of lives. No password, no account:
-- the address is proved once by a 6-digit code and remembered in a signed
-- cookie for six months.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  lives int not null default 15 check (lives >= 0),
  -- The clock the hourly refill is measured from. Advanced by whole hours as
  -- lives are granted, so partial hours are never thrown away.
  lives_accrued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Boxes
-- ---------------------------------------------------------------------------

create table public.boxes (
  id uuid primary key default gen_random_uuid(),
  -- 'general' is the platform's own free box, authored in /admin and funded by
  -- us. 'contributor' is someone else's, funded by their stake.
  kind text not null check (kind in ('general', 'contributor')),
  contributor_id uuid references public.contributors (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  title text not null check (char_length(title) between 1 and 70),
  blurb text check (char_length(blurb) <= 240),

  -- The password itself. Service-role only: no RLS policy anywhere grants a
  -- select on this table, including to the contributor who wrote it.
  secret text not null,
  length int not null check (length between 3 and 26),
  guesses_allowed int not null check (guesses_allowed between 1 and 40),

  -- Money, all in kobo. prize + platform_fee = stake.
  stake_kobo bigint not null default 0 check (stake_kobo >= 0),
  prize_kobo bigint not null check (prize_kobo >= 0),
  platform_fee_kobo bigint not null default 0 check (platform_fee_kobo >= 0),

  --   draft     being written, invisible
  --   funding   awaiting the contributor's stake payment
  --   live      playable
  --   unlocked  somebody cracked it; it can never be played again
  --   closed    withdrawn by its author or by an admin
  status text not null default 'draft'
    check (status in ('draft', 'funding', 'live', 'unlocked', 'closed')),

  unlocked_by uuid references public.players (id) on delete set null,
  unlocked_at timestamptz,
  published_at timestamptz,
  attempts_count int not null default 0,
  players_count int not null default 0,
  created_at timestamptz not null default now(),

  -- The platform's box has no contributor; everyone else's must have one.
  constraint boxes_owner_matches_kind check (
    (kind = 'general' and contributor_id is null)
    or (kind = 'contributor' and contributor_id is not null)
  ),
  constraint boxes_secret_length check (char_length(secret) = length)
);

create index boxes_contributor_idx on public.boxes (contributor_id, created_at desc);
create index boxes_live_idx on public.boxes (status, published_at desc);

-- Exactly one general box is playable at a time: the public game is *the*
-- public game, not a catalogue of them.
create unique index boxes_one_live_general
  on public.boxes ((kind)) where kind = 'general' and status = 'live';

-- ---------------------------------------------------------------------------
-- Play
-- ---------------------------------------------------------------------------

-- One life, spent. The life comes off at the start and is handed back on a
-- win, which is the same thing as "failing costs a life" but cannot be farmed
-- by opening runs and walking away from them.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'won', 'lost')),
  guesses_allowed int not null check (guesses_allowed > 0),
  guesses_used int not null default 0 check (guesses_used >= 0),
  -- Accumulated power-up winnings for this run: revealed positions, struck-off
  -- characters, bonus guesses. Shape mirrors `Revealed` in lib/game/power-ups.
  revealed jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index runs_box_idx on public.runs (box_id, started_at desc);
create index runs_player_idx on public.runs (player_id, started_at desc);

-- A player attacks a box one run at a time.
create unique index runs_one_active_per_player_box
  on public.runs (box_id, player_id) where status = 'active';

create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  -- 0-based position in the run. The unique constraint below is what makes
  -- concurrent submissions safe: two requests racing on the same run try to
  -- claim the same ordinal and exactly one of them wins.
  ordinal int not null check (ordinal >= 0),
  value text not null,
  -- One character per position: 'g' green, 'o' orange, 'r' red.
  feedback text not null check (feedback ~ '^[gor]+$'),
  created_at timestamptz not null default now(),
  unique (run_id, ordinal)
);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

-- A contributor funding a box. Until this is paid the box stays in 'funding'.
create table public.stake_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  box_id uuid not null references public.boxes (id) on delete cascade,
  contributor_id uuid not null references public.contributors (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- A power-up sale. This is the contributor's entire income: 70% of every one
-- of these bought against their box. On a general box contributor_kobo is 0
-- and the platform keeps the lot.
create table public.power_up_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  run_id uuid not null references public.runs (id) on delete cascade,
  box_id uuid not null references public.boxes (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  contributor_id uuid references public.contributors (id) on delete set null,
  kind text not null,
  price_kobo bigint not null check (price_kobo > 0),
  contributor_kobo bigint not null default 0 check (contributor_kobo >= 0),
  platform_kobo bigint not null default 0 check (platform_kobo >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  -- The line of copy the player was shown when it fired, kept so the play
  -- screen can list what has already been bought this run.
  note text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index power_up_orders_contributor_idx
  on public.power_up_orders (contributor_id, paid_at desc) where status = 'paid';
create index power_up_orders_run_idx on public.power_up_orders (run_id, created_at);

-- Lives bought rather than waited for. 100% platform revenue — a life is not
-- attached to any box, so there is nobody to share it with.
create table public.life_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  player_id uuid not null references public.players (id) on delete cascade,
  quantity int not null check (quantity between 1 and 100),
  price_kobo bigint not null check (price_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- A cracked box owes its winner the prize. The claim is created the moment
-- the box is unlocked; the winner fills in a bank account and an admin sends
-- the transfer.
create table public.prize_claims (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null unique references public.boxes (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo >= 0),
  status text not null default 'unclaimed'
    check (status in ('unclaimed', 'submitted', 'paid')),
  bank_code text,
  bank_name text,
  account_number text,
  account_name text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  paid_at timestamptz
);

create index prize_claims_status_idx on public.prize_claims (status, created_at);

-- ---------------------------------------------------------------------------
-- Shared bits
-- ---------------------------------------------------------------------------

create table public.verification_codes (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  purpose text not null
    check (purpose in ('contributor_signup', 'password_reset', 'player_verify')),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index verification_codes_lookup
  on public.verification_codes (email, purpose, created_at desc);

-- Lets the service-role signup and password-reset routes find the auth user
-- behind an address without listing every user. Dropped with the rest of the
-- old functions above, so it is recreated here.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where email = lower(trim(p_email)) limit 1;
$$;


-- ---------------------------------------------------------------------------
-- Lives
-- ---------------------------------------------------------------------------

-- Mirrors LIVES_MAX / LIFE_REGEN_MINUTES in src/lib/constants.ts.
create or replace function public.lives_max() returns int
language sql immutable as $$ select 15 $$;

create or replace function public.life_regen() returns interval
language sql immutable as $$ select interval '60 minutes' $$;

/*
 * Bring a player's life pool up to date, and return the row.
 *
 * Lives refill one an hour up to the cap. The refill clock advances by whole
 * hours rather than being reset to now(), so a player who checks back after 90
 * minutes banks one life and keeps the spare 30 minutes towards the next —
 * otherwise frequent polling would quietly reset the timer forever.
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
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  if v_player.lives >= public.lives_max() then
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

  if v_player.lives + v_gain >= public.lives_max() then
    update public.players
       set lives = public.lives_max(), lives_accrued_at = now()
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

/** Find or create the player behind a verified address, lives brought current. */
create or replace function public.ensure_player(p_email citext)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.players (email) values (p_email)
    on conflict (email) do nothing;
  select id into v_id from public.players where email = p_email;
  return public.sync_lives(v_id);
end;
$$;

/** Credit purchased lives. Bought lives can push the pool over the cap. */
create or replace function public.credit_lives(p_player_id uuid, p_count int)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
begin
  perform public.sync_lives(p_player_id);
  update public.players set lives = lives + p_count
    where id = p_player_id returning * into v_player;
  return v_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting a run
-- ---------------------------------------------------------------------------

/*
 * Open an attempt on a box, spending one life.
 *
 * Every reason a run can't start is decided here in one transaction, so two
 * requests can't both find the last life or both open a run on the same box.
 * Returns a jsonb verdict rather than raising, because "you're out of lives"
 * is an ordinary answer and not an error.
 */
create or replace function public.start_run(p_email citext, p_box_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_box public.boxes;
  v_run public.runs;
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

  -- An attempt already in flight is the answer; don't charge for a second one.
  select * into v_run from public.runs
    where box_id = p_box_id and player_id = v_player.id and status = 'active';
  if found then
    return jsonb_build_object('result', 'resumed', 'run_id', v_run.id);
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

  insert into public.runs (box_id, player_id, guesses_allowed)
    values (p_box_id, v_player.id, v_box.guesses_allowed)
    returning * into v_run;

  update public.boxes
     set attempts_count = attempts_count + 1,
         players_count = players_count + case
           when exists (
             select 1 from public.runs
              where box_id = p_box_id and player_id = v_player.id and id <> v_run.id
           ) then 0 else 1 end
   where id = p_box_id;

  return jsonb_build_object('result', 'started', 'run_id', v_run.id);
end;
$$;

/*
 * Settle a solved run: hand the life back, close the box, and open the claim.
 *
 * The box is closed with a conditional update, so if two players solve the
 * same box within the same instant exactly one of them is the winner and the
 * other is told they were pipped rather than being promised a prize twice.
 *
 * This owns the *whole* end of a solved run — the run's status included — so
 * that the loser of that race is closed and refunded by the same conditional
 * update that decided they lost it. A caller that had already marked the run
 * finished would defeat the guard and either double-refund or not refund at
 * all, so callers leave the status alone and let this settle it.
 */
create or replace function public.claim_box(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.runs;
  v_box public.boxes;
  v_bystander uuid;
begin
  select * into v_run from public.runs where id = p_run_id;
  if not found then
    raise exception 'run_not_found';
  end if;

  update public.boxes
     set status = 'unlocked', unlocked_by = v_run.player_id, unlocked_at = now()
   where id = v_run.box_id and status = 'live'
   returning * into v_box;

  if not found then
    -- Somebody else got there first. Close this run and give the life back —
    -- guessing right and being a moment late is not a failure. The `status =
    -- 'active'` predicate makes the refund happen exactly once, whether we get
    -- here before or after the winner's bystander sweep.
    update public.runs set status = 'lost', ended_at = now()
      where id = p_run_id and status = 'active';
    if found then
      perform public.credit_lives(v_run.player_id, 1);
    end if;
    return jsonb_build_object('result', 'pipped');
  end if;

  update public.runs set status = 'won', ended_at = now() where id = p_run_id;

  -- The winner keeps the life they opened with.
  perform public.credit_lives(v_run.player_id, 1);

  insert into public.prize_claims (box_id, player_id, amount_kobo)
    values (v_box.id, v_run.player_id, v_box.prize_kobo)
    on conflict (box_id) do nothing;

  -- Everyone else attacking this box is out of luck, but they didn't fail —
  -- the box was closed out from under them — so they get their life back too.
  for v_bystander in
    select player_id from public.runs
     where box_id = v_box.id and status = 'active' and id <> p_run_id
  loop
    perform public.credit_lives(v_bystander, 1);
  end loop;

  update public.runs set status = 'lost', ended_at = now()
    where box_id = v_box.id and status = 'active' and id <> p_run_id;

  return jsonb_build_object('result', 'won', 'prize_kobo', v_box.prize_kobo);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Contributors read their own rows and nothing else. Players read nothing at
-- all — the play surface talks only to route handlers. `boxes` deliberately
-- has no select policy of any kind: the password lives in that table, so even
-- its author reads it through a route handler that strips the column.

alter table public.contributors enable row level security;
alter table public.players enable row level security;
alter table public.boxes enable row level security;
alter table public.runs enable row level security;
alter table public.guesses enable row level security;
alter table public.stake_orders enable row level security;
alter table public.power_up_orders enable row level security;
alter table public.life_orders enable row level security;
alter table public.prize_claims enable row level security;
alter table public.verification_codes enable row level security;

create policy contributors_read_self on public.contributors
  for select using (owner_id = auth.uid());

create policy stake_orders_read_own on public.stake_orders
  for select using (
    contributor_id in (select id from public.contributors where owner_id = auth.uid())
  );

create policy power_up_orders_read_own on public.power_up_orders
  for select using (
    contributor_id in (select id from public.contributors where owner_id = auth.uid())
  );

-- Every function above runs as its owner so that it can spend a life or close
-- a box regardless of RLS, which is exactly why none of them may be reachable
-- from a browser: PostgREST would otherwise happily let anyone POST to
-- /rpc/credit_lives and mint themselves lives.
--
-- The revoke has to name `public` — the pseudo-role, not the schema. Postgres
-- grants EXECUTE on every new function to PUBLIC by default, and anon and
-- authenticated inherit it, so revoking from those two by name leaves the
-- inherited grant standing and the function wide open.
revoke execute on function
  public.sync_lives(uuid),
  public.ensure_player(citext),
  public.credit_lives(uuid, int),
  public.start_run(citext, uuid),
  public.claim_box(uuid),
  public.auth_user_id_by_email(text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- The tile-board era uploaded logos and grid art into the `logos` and
-- `grid-images` buckets. Nothing in this schema references them any more, but
-- they are NOT dropped here: Supabase guards `storage.objects` and
-- `storage.buckets` with a `protect_delete()` trigger that rejects any direct
-- DELETE, and being rejected would roll back this entire migration over some
-- disused image files.
--
-- Empty the buckets through the Storage API instead — the dashboard's Storage
-- page, or:
--
--   supabase storage rm -r ss:///logos ss:///grid-images
--
-- Leaving them in place is harmless; they are simply unreferenced.
