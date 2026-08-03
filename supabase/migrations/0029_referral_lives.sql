-- Bringing somebody with you.
--
-- Every player gets an invite code. When somebody who arrived on your link
-- pays for a real top-up — ten lives or more — two bonuses are banked:
--
--   * **five** for you, the inviter, and they stack: ten people who pay is
--     fifty lives;
--   * **three** for them, once.
--
-- Both land on the recipient's *next* paid top-up, not immediately. That is
-- the whole reason `bonus_lives_pending` is a column rather than a credit: a
-- bonus that appeared instantly would just be a discount, and a bonus that
-- lands next time is a reason to come back.
--
-- Bonus lives are free lives. They are never charged, so they never enter a
-- price and never see the 70/30 split — a contributor earns from what a hunter
-- *pays*, and nobody pays for these.
--
-- The obvious abuse — invite yourself, buy ten lives, collect eight — is
-- covered three ways: a player can never be their own inviter, an inviter can
-- only ever be attached once and never changed, and each invited player can
-- qualify exactly once however many times they top up. What it does not stop
-- is somebody running two addresses, which costs them ₦1,500 of real money to
-- gain eight lives that regenerate free in eight hours. That trade is bad
-- enough on its own.

-- ---------------------------------------------------------------------------
-- Terms
-- ---------------------------------------------------------------------------

create or replace function public.referral_min_lives() returns int
  language sql immutable as $$ select 10 $$;

create or replace function public.inviter_bonus_lives() returns int
  language sql immutable as $$ select 5 $$;

create or replace function public.invitee_bonus_lives() returns int
  language sql immutable as $$ select 3 $$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists invite_code text,
  add column if not exists invited_by uuid references public.players (id) on delete set null,
  add column if not exists bonus_lives_pending int not null default 0,
  add column if not exists referral_qualified_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_bonus_lives_sane') then
    alter table public.players
      add constraint players_bonus_lives_sane check (bonus_lives_pending >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'players_not_own_inviter') then
    alter table public.players
      add constraint players_not_own_inviter check (invited_by is null or invited_by <> id);
  end if;
end $$;

/*
 * A code short enough to say out loud and long enough not to collide.
 *
 * Eight characters from a 32-symbol alphabet with the four that get misread —
 * O, 0, I, 1 — left out. Case-insensitive on the way in, upper-case on the way
 * out, because these get typed off a screenshot.
 */
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.players where invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

update public.players set invite_code = public.new_invite_code() where invite_code is null;

create unique index if not exists players_invite_code_key
  on public.players (invite_code);
create index if not exists players_invited_by_idx
  on public.players (invited_by);

-- ---------------------------------------------------------------------------
-- Every player has a code from the moment they exist
-- ---------------------------------------------------------------------------

create or replace function public.ensure_player(p_email citext)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.players (email, invite_code)
    values (p_email, public.new_invite_code())
    on conflict (email) do nothing;
  select id into v_id from public.players where email = p_email;

  -- Players created before this migration, and any row that somehow slipped
  -- through, get one on first sight rather than never.
  update public.players set invite_code = public.new_invite_code()
   where id = v_id and invite_code is null;

  return public.sync_lives(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Claiming an invite
-- ---------------------------------------------------------------------------

/*
 * Attach an inviter to a player, once and for ever.
 *
 * Every failure is silent and returns false: a code that doesn't exist, your
 * own code, a player who already has an inviter. The caller is a browser
 * replaying a link it found in localStorage, and none of those are worth an
 * error — they're the normal case on the second visit.
 */
create or replace function public.claim_invite(p_player_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return false;
  end if;

  select id into v_inviter from public.players
   where invite_code = upper(trim(p_code));
  if not found or v_inviter = p_player_id then
    return false;
  end if;

  update public.players
     set invited_by = v_inviter
   where id = p_player_id and invited_by is null;

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settling a paid top-up
-- ---------------------------------------------------------------------------

/*
 * Credit a paid top-up, spend any banked bonus, and bank new ones.
 *
 * The order of the three steps is the feature. Bonuses banked *before* this
 * purchase are paid out with it; the qualification this purchase might trigger
 * is banked *after*, so it can only ever be spent on the next one. Getting
 * that backwards would let one purchase qualify itself.
 *
 * Safe to run twice only because its caller isn't: `settleLives` flips the
 * order to paid with a conditional update and calls this once, on the call
 * that won.
 */
create or replace function public.settle_life_purchase(
  p_player_id uuid,
  p_quantity int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_bonus int;
  v_qualified boolean := false;
begin
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'player_not_found');
  end if;

  -- 1. Bonuses banked before now, paid out with this top-up.
  v_bonus := v_player.bonus_lives_pending;

  perform public.sync_lives(p_player_id);
  update public.players
     set lives = lives + p_quantity + v_bonus,
         bonus_lives_pending = 0
   where id = p_player_id
   returning * into v_player;

  -- 2. Does this purchase qualify the referral that brought them here?
  if p_quantity >= public.referral_min_lives()
     and v_player.invited_by is not null
     and v_player.referral_qualified_at is null
  then
    v_qualified := true;

    update public.players
       set referral_qualified_at = now(),
           bonus_lives_pending = bonus_lives_pending + public.invitee_bonus_lives()
     where id = p_player_id
     returning * into v_player;

    -- 3. And the inviter's share, which stacks with every other referral.
    update public.players
       set bonus_lives_pending = bonus_lives_pending + public.inviter_bonus_lives()
     where id = v_player.invited_by;
  end if;

  return jsonb_build_object(
    'result', 'credited',
    'quantity', p_quantity,
    'bonus_applied', v_bonus,
    'lives', v_player.lives,
    'referral_qualified', v_qualified
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Every one of these mints lives or rewrites who invited whom. None of them
-- may be reachable over PostgREST; `public` here is the pseudo-role, which
-- anon and authenticated inherit from.
revoke execute on function
  public.ensure_player(citext),
  public.new_invite_code(),
  public.claim_invite(uuid, text),
  public.settle_life_purchase(uuid, int),
  public.referral_min_lives(),
  public.inviter_bonus_lives(),
  public.invitee_bonus_lives()
from public, anon, authenticated;
