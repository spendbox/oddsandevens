-- One account, many featured boxes, and a schema cache that knows about both.
--
-- Three changes, plus the reload that the last two migrations needed and this
-- one finally says out loud.
--
-- 1. **One identity.** A person had two: a player row (email, lives, a cookie)
--    and, if they ever put a box up, a Supabase auth user with a completely
--    separate password. Same human, same inbox, two sign-ins. Contributors are
--    now keyed to the *player*, so creating a box and playing one are the same
--    account. Existing contributors keep working: `owner_id` stays, and the
--    lookup tries the player first and falls back to it.
--
-- 2. **Featuring.** The landing page used to be structural — our box on top,
--    everyone else's below — which is a strange thing to hard-code and a worse
--    one to explain, since every box plays identically. It is editorial now: an
--    admin features whichever boxes are worth the top of the page, however many
--    of them, whoever made them.
--
-- 3. **More than one of ours.** A partial unique index allowed exactly one live
--    platform box, on the reasoning that "the public game" is singular. With
--    featuring doing the promotion, that reasoning is gone.

-- ---------------------------------------------------------------------------
-- One identity
-- ---------------------------------------------------------------------------

alter table public.contributors
  add column if not exists player_id uuid references public.players (id) on delete cascade;

-- `owner_id` was `not null unique` and is now optional: a contributor created
-- from a player session has no Supabase auth user at all.
alter table public.contributors alter column owner_id drop not null;

create unique index if not exists contributors_player_id_key
  on public.contributors (player_id) where player_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contributors_has_an_owner') then
    alter table public.contributors
      add constraint contributors_has_an_owner
      check (owner_id is not null or player_id is not null);
  end if;
end $$;

-- Anyone who already had both — the same address as an auth user and as a
-- player — gets them joined up, so their dashboard follows them to the new
-- sign-in without a migration step they have to perform themselves.
update public.contributors c
   set player_id = p.id
  from auth.users u
  join public.players p on p.email = u.email::citext
 where c.owner_id = u.id and c.player_id is null;

-- RLS on `contributors` was written against `auth.uid()`. It still holds for
-- the auth-user half; the player half is served only through service-role
-- routes, which RLS doesn't apply to. Adding a player-side policy would be
-- meaningless — a player has no Postgres identity to match against.

-- ---------------------------------------------------------------------------
-- Featuring
-- ---------------------------------------------------------------------------

alter table public.boxes
  add column if not exists featured_at timestamptz;

-- Newest-featured first, and only ever over live boxes.
create index if not exists boxes_featured_idx
  on public.boxes (featured_at desc) where featured_at is not null;

-- A cracked box stops being featured the moment it's cracked. The landing page
-- is a place to start, and a safe with nothing left in it is a poor invitation.
create or replace function public.claim_box(p_hunt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hunt public.hunts;
  v_box public.boxes;
begin
  select * into v_hunt from public.hunts where id = p_hunt_id;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'hunt_not_found');
  end if;

  -- The conditional update is the whole race resolution: exactly one caller
  -- can move a box out of 'live', so exactly one can win it.
  update public.boxes
     set status = 'unlocked',
         unlocked_by = v_hunt.player_id,
         unlocked_at = now(),
         featured_at = null
   where id = v_hunt.box_id and status = 'live'
   returning * into v_box;

  if not found then
    return jsonb_build_object('result', 'pipped');
  end if;

  insert into public.reward_claims (box_id, player_id, amount_kobo)
    values (v_box.id, v_hunt.player_id, v_box.reward_kobo)
    on conflict (box_id) do nothing;

  return jsonb_build_object('result', 'won', 'reward_kobo', v_box.reward_kobo);
end;
$$;

-- ---------------------------------------------------------------------------
-- More than one platform box
-- ---------------------------------------------------------------------------

drop index if exists public.boxes_one_live_general;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.claim_box(uuid) from public, anon, authenticated;

-- The admin view added in 0031: service-role only, and named explicitly so the
-- grant is a decision rather than an inheritance.
grant select on public.admin_players to service_role;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

/*
 * PostgREST caches the schema and does not notice DDL on its own.
 *
 * This is the cause of "Could not find the table 'public.admin_players' in the
 * schema cache" and of "Could not find the 'design' column of 'boxes'" — the
 * migration ran, the column or view exists, and the API is still working from
 * a snapshot taken before it did. It resolves itself eventually; this makes it
 * immediate, and every future migration should end the same way.
 */
notify pgrst, 'reload schema';
