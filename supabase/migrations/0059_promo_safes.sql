-- ---------------------------------------------------------------------------
-- Promo safes
-- ---------------------------------------------------------------------------
--
-- 0058 called these "free safes", owned them by a player, and generated their
-- passwords with `gen_random_bytes`. All three were wrong, and this corrects
-- them together because they are one decision:
--
--   **`gen_random_bytes` is pgcrypto**, which Supabase installs into the
--   `extensions` schema. Every function here sets `search_path = public`, so
--   the call resolved to nothing and generation failed with 42883 on the first
--   real attempt. It worked locally only because the scratch harness created
--   the extension into `public`. Nothing below needs an extension at all.
--
--   **A promo safe belongs to a contributor, not a player.** It is built in
--   the Build tab beside a custom box, which is a contributor surface — and it
--   means the 70% rides the Paystack subaccount that already exists rather
--   than accruing in a ledger a human has to pay out by hand. The columns 0058
--   added for that ledger are left in place and stop being written.
--
--   **It is not free.** It costs the contributor a small fixed price, and the
--   prize behind it is still ours. That is what makes it a promotion rather
--   than a giveaway: the price filters out nobody-in-particular, and the
--   allocation is finite and visible so it reads as an offer with an end.

-- ---------------------------------------------------------------------------
-- Randomness without an extension
-- ---------------------------------------------------------------------------

/** Letters and digits, and nothing an admin can edit out from under a box. */
create or replace function public.promo_charset()
returns text language sql immutable parallel safe as $$
  select 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
$$;

/** The top of the Brutal band. */
create or replace function public.promo_length()
returns int language sql volatile as $$
  select 20 + floor(random() * 2)::int
$$;

/*
 * A stream of random bytes, built from `gen_random_uuid()`.
 *
 * In PostgreSQL 13 and later that is a core function backed by the platform's
 * strong random source, not the seeded PRNG behind `random()` — so this keeps
 * the property that mattered (a password a real prize depends on is not
 * predictable from other outputs) while depending on nothing that has to be
 * installed, or that lives in a schema our `search_path` excludes.
 *
 * Each uuid contributes 16 bytes, of which 122 bits are random; the version
 * and variant nibbles are fixed. Those fixed nibbles are why this returns hex
 * to be consumed positionally rather than pretending to be uniform bytes — the
 * caller draws two hex digits per character and the small bias that introduces
 * is far below anything that matters across a 20-character password.
 */
create or replace function public.random_hex(p_chars int)
returns text
language plpgsql
volatile
as $$
declare
  v_out text := '';
begin
  while length(v_out) < p_chars loop
    v_out := v_out || replace(gen_random_uuid()::text, '-', '');
  end loop;
  return substr(v_out, 1, p_chars);
end;
$$;

/*
 * The password. Letters and digits only — see 0058 for why that is a safety
 * property rather than a shortcut: the symbol half of the alphabet is
 * admin-editable, and a generated password has no author to remember it, so a
 * symbol later removed from the alphabet would strand a real prize behind a
 * box nobody could ever open.
 *
 * Never returned. `create_promo_box` holds it in one variable and inserts it.
 */
create or replace function public.new_promo_password()
returns text
language plpgsql
volatile
as $$
declare
  v_chars text := public.promo_charset();
  v_len int := public.promo_length();
  v_hex text := public.random_hex(v_len * 2);
  v_out text := '';
  v_byte int;
begin
  for i in 1..v_len loop
    v_byte := ('x' || substr(v_hex, (i - 1) * 2 + 1, 2))::bit(8)::int;
    v_out := v_out || substr(v_chars, (v_byte % length(v_chars)) + 1, 1);
  end loop;
  return v_out;
end;
$$;

/** A name and a slug. Same idea as 0058, without the extension. */
create or replace function public.new_promo_name()
returns table (slug text, title text)
language plpgsql
volatile
as $$
declare
  adjectives text[] := array['quiet','brass','midnight','stubborn','golden','patient',
                             'restless','crooked','iron','velvet','hidden','lucky'];
  nouns text[] := array['vault','strongbox','locker','cabinet','coffer','safehouse',
                        'deposit','chamber','holdall','reserve'];
  v_adj text := adjectives[1 + floor(random() * array_length(adjectives, 1))::int];
  v_noun text := nouns[1 + floor(random() * array_length(nouns, 1))::int];
begin
  slug := v_adj || '-' || v_noun || '-' || public.random_hex(4);
  title := initcap(v_adj) || ' ' || initcap(v_noun);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 'free' becomes 'promo', and belongs to a contributor
-- ---------------------------------------------------------------------------

/*
 * Any 'free' row is deleted rather than migrated, and it is safe to say there
 * are none: `generate_free_safe` called `new_free_password()` before its
 * insert, so every attempt on a real deployment failed at 42883 and no box was
 * ever written. There is also nowhere to migrate one *to* — the new shape
 * requires a contributor, and a player-owned box has none.
 */
delete from public.boxes where kind = 'free';

alter table public.boxes drop constraint if exists boxes_kind_check;
alter table public.boxes
  add constraint boxes_kind_check
  check (kind in ('general', 'contributor', 'promo'));

alter table public.boxes drop constraint if exists boxes_owner_matches_kind;
alter table public.boxes
  add constraint boxes_owner_matches_kind
  check (
    (kind = 'general' and contributor_id is null)
    or (kind = 'contributor' and contributor_id is not null)
    -- A promo safe is a contributor's box that they did not write the password
    -- for. Everything downstream — earnings, the subaccount, the dashboard —
    -- treats it as theirs, because it is.
    or (kind = 'promo' and contributor_id is not null)
  );

drop index if exists public.boxes_one_live_free_per_player;

/*
 * One at a time, and an unpaid one counts.
 *
 * Scoped to `('funding','live')` rather than `live` alone: a promo box is
 * created before it is paid for, so without `funding` in the list somebody
 * could open a checkout, leave it, and open another — reserving two of a
 * finite allocation while paying for neither.
 */
create unique index if not exists boxes_one_promo_per_contributor
  on public.boxes (contributor_id)
  where kind = 'promo' and status in ('funding', 'live');

create index if not exists boxes_promo_idx on public.boxes (kind) where kind = 'promo';

-- ---------------------------------------------------------------------------
-- What it costs and how many are left
-- ---------------------------------------------------------------------------

/*
 * The settings move under their own key and their own names.
 *
 * `create or replace` cannot reshape a function's OUT parameters, so the old
 * one is dropped rather than replaced — and since it has to go anyway, it goes
 * to a name that does not say "free", which these are not.
 */
insert into public.platform_settings (key, value)
select 'promo_safes', value from public.platform_settings where key = 'free_safes'
on conflict (key) do nothing;
insert into public.platform_settings (key, value)
values ('promo_safes', '{}'::jsonb) on conflict (key) do nothing;
delete from public.platform_settings where key = 'free_safes';

create or replace function public.promo_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.platform_settings where key = 'promo_safes'), '{}'::jsonb);
$$;

create or replace function public.set_promo_settings(p_value jsonb, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_promo_settings';
  end if;
  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('promo_safes', p_value, nullif(trim(p_by), ''), now())
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return p_value;
end;
$$;

drop function if exists public.free_safe_config();
drop function if exists public.free_safe_settings();
drop function if exists public.set_free_safe_settings(jsonb, text);

create or replace function public.promo_config()
returns table (
  enabled boolean,
  pot_kobo bigint,
  price_kobo bigint,
  max_total int,
  creator_share_percent int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((public.promo_settings() ->> 'enabled')::boolean, true),
    -- The prize behind it, which is ours. ₦100,000.
    least(greatest(coalesce((public.promo_settings() ->> 'potKobo')::bigint, 100000 * 100), 0),
          1000000 * 100),
    -- What the contributor pays to put one up. ₦5,000 — and never below ₦100,
    -- which is the floor Paystack will take at all.
    greatest(coalesce((public.promo_settings() ->> 'priceKobo')::bigint, 5000 * 100), 100),
    -- The whole promotion, not a concurrency limit: how many may ever be
    -- created. This is the number a contributor sees counting down.
    greatest(coalesce((public.promo_settings() ->> 'maxTotal')::int, 100), 0),
    least(greatest(coalesce((public.promo_settings() ->> 'creatorSharePercent')::int, 70), 0), 100);
$$;

/*
 * How many are left, and it counts *paid* boxes.
 *
 * An abandoned checkout must not eat an allocation nobody paid for, so a box
 * still in `funding` is not counted here — the per-contributor index above is
 * what stops one person opening ten of them.
 */
create or replace function public.promo_availability()
returns table (max_total int, claimed int, remaining int, price_kobo bigint, pot_kobo bigint, enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.max_total,
    (select count(*)::int from public.boxes
      where kind = 'promo' and status in ('live', 'unlocked', 'closed')),
    greatest(c.max_total - (select count(*)::int from public.boxes
      where kind = 'promo' and status in ('live', 'unlocked', 'closed')), 0),
    c.price_kobo,
    c.pot_kobo,
    c.enabled
  from public.promo_config() c;
$$;

-- ---------------------------------------------------------------------------
-- Creating one
-- ---------------------------------------------------------------------------

/*
 * Put up a promo safe for a contributor, unpaid.
 *
 * It lands in `funding`, exactly as a custom box does, and the ordinary
 * funding settlement flips it to `live` when the money arrives — there is no
 * separate payment path and no second way for a box to go live.
 *
 * The difference from a custom box is that `reward_kobo` is not derived from
 * what was paid. The contributor pays the promo price; the prize is ours and
 * is set here.
 */
create or replace function public.create_promo_box(p_contributor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg record;
  v_avail record;
  v_name record;
  v_box public.boxes;
  -- Drawn once. Two calls to a volatile generator are two different passwords
  -- of two different lengths, and `boxes_secret_length` requires them to agree.
  v_secret text;
begin
  if p_contributor_id is null then
    return jsonb_build_object('result', 'error', 'error', 'no_contributor');
  end if;

  select * into v_cfg from public.promo_config();
  select * into v_avail from public.promo_availability();

  if not v_cfg.enabled then
    return jsonb_build_object('result', 'error', 'error', 'disabled');
  end if;
  if v_avail.remaining <= 0 then
    return jsonb_build_object('result', 'error', 'error', 'sold_out');
  end if;
  if exists (
    select 1 from public.boxes
     where kind = 'promo' and status in ('funding', 'live')
       and contributor_id = p_contributor_id
  ) then
    return jsonb_build_object('result', 'error', 'error', 'already_have_one');
  end if;

  select * into v_name from public.new_promo_name();
  v_secret := public.new_promo_password();

  insert into public.boxes (
    kind, contributor_id, slug, title, blurb,
    secret, length,
    funding_kobo, reward_kobo, platform_fee_kobo,
    status, design
  )
  values (
    'promo', p_contributor_id, v_name.slug, v_name.title,
    'A promo safe. Nobody has ever seen this password — it was drawn by the database and read by no one.',
    v_secret, char_length(v_secret),
    -- What they paid, what a winner gets, and nothing kept back. These are
    -- unrelated figures here, which is the whole of the promotion.
    v_cfg.price_kobo, v_cfg.pot_kobo, 0,
    'funding', 'midnight'
  )
  returning * into v_box;

  return jsonb_build_object(
    'result', 'created',
    'id', v_box.id,
    'slug', v_box.slug,
    'title', v_box.title,
    'length', v_box.length,
    'price_kobo', v_cfg.price_kobo,
    'reward_kobo', v_box.reward_kobo
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- You still cannot win your own
-- ---------------------------------------------------------------------------

/*
 * The refusal moves from a player id to the contributor behind the box.
 *
 * `contributors.player_id` is the link 0032 added when the two identities were
 * merged, so this is exact rather than a name match: the person playing and
 * the person who put the safe up are the same row or they are not.
 *
 * Copied forward from 0058 with that one condition changed.
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

  if v_box.kind = 'promo' and exists (
    select 1 from public.contributors c
     where c.id = v_box.contributor_id and c.player_id = v_player.id
  ) then
    return jsonb_build_object('result', 'error', 'error', 'own_promo_safe');
  end if;

  insert into public.hunts (box_id, player_id) values (p_box_id, v_player.id)
    on conflict (box_id, player_id) do nothing;
  select * into v_hunt from public.hunts
    where box_id = p_box_id and player_id = v_player.id for update;

  if v_hunt.won_at is not null then
    return jsonb_build_object('result', 'error', 'error', 'already_won');
  end if;

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
    exact_count, miscase_count, elsewhere_count, elsewhere_miscase_count,
    score_percent
  )
  values (
    v_hunt.id, v_ordinal, p_guess, v_score.length_hint,
    v_score.exact_count, v_score.miscase_count, v_score.elsewhere_count,
    v_score.elsewhere_miscase_count, v_score.score_percent
  );

  perform public.touch_player(v_player.id, 'attempt');

  update public.hunts
     set attempts_count = v_ordinal + 1,
         last_attempt_at = now(),
         best_percent = greatest(best_percent, v_score.score_percent),
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
-- What an admin sees
-- ---------------------------------------------------------------------------

/** The password of a promo safe, and of nothing else. See 0058 on why. */
create or replace function public.promo_box_secret(p_box_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select secret from public.boxes where id = p_box_id and kind = 'promo';
$$;

drop view if exists public.admin_free_safes;
drop view if exists public.admin_free_safe_exposure;

create or replace view public.admin_promo_boxes as
select
  b.id, b.slug, b.title, b.status,
  b.reward_kobo, b.funding_kobo, b.length,
  b.attempts_count, b.players_count, b.best_percent,
  b.published_at, b.unlocked_at,
  c.display_name as creator_name,
  c.handle as creator_handle,
  w.email as winner_email
from public.boxes b
left join public.contributors c on c.id = b.contributor_id
left join public.players w on w.id = b.unlocked_by
where b.kind = 'promo';

/** The exposure: prizes we have promised, against what was charged for them. */
create or replace view public.admin_promo_exposure as
select
  count(*) filter (where status = 'live')                                  as live,
  count(*) filter (where status = 'funding')                               as awaiting_payment,
  count(*) filter (where status = 'unlocked')                              as cracked,
  count(*)                                                                 as total,
  coalesce(sum(reward_kobo) filter (where status = 'live'), 0)::bigint     as at_risk_kobo,
  coalesce(sum(reward_kobo) filter (where status = 'unlocked'), 0)::bigint as paid_out_kobo,
  coalesce(sum(funding_kobo) filter (where status in ('live','unlocked','closed')), 0)::bigint
                                                                           as collected_kobo,
  coalesce(sum(attempts_count), 0)::bigint                                 as attempts
from public.boxes where kind = 'promo';

-- ---------------------------------------------------------------------------
-- Retiring what 0058 got wrong
-- ---------------------------------------------------------------------------

-- A password oracle is not something to leave lying about because it is merely
-- unused, and the ledger functions describe a payout path that no longer
-- exists — a contributor's share settles through their subaccount.
drop function if exists public.free_safe_secret(uuid);
drop function if exists public.new_free_password();
drop function if exists public.new_free_name();
drop function if exists public.free_safe_charset();
drop function if exists public.free_safe_length();
drop function if exists public.generate_free_safe(citext);
drop function if exists public.credit_free_safe(uuid, bigint);
drop function if exists public.pay_free_safe(uuid, bigint);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.promo_box_secret(uuid) from public, anon, authenticated;
revoke execute on function public.create_promo_box(uuid) from public, anon, authenticated;
revoke execute on function public.promo_availability() from public, anon, authenticated;
revoke execute on function public.promo_config() from public, anon, authenticated;
revoke execute on function public.promo_settings() from public, anon, authenticated;
revoke execute on function public.set_promo_settings(jsonb, text) from public, anon, authenticated;
revoke execute on function public.random_hex(int) from public, anon, authenticated;
revoke execute on function public.new_promo_password() from public, anon, authenticated;
revoke execute on function public.new_promo_name() from public, anon, authenticated;

revoke all on public.admin_promo_boxes from public, anon, authenticated;
revoke all on public.admin_promo_exposure from public, anon, authenticated;
grant select on public.admin_promo_boxes to service_role;
grant select on public.admin_promo_exposure to service_role;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
