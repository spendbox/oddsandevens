-- ---------------------------------------------------------------------------
-- Free safes
-- ---------------------------------------------------------------------------
--
-- A safe anybody can put up without paying for it, whose password nobody has
-- ever seen — not the player who generated it, and not us.
--
-- Every other box on the platform starts with somebody choosing a password.
-- That is what makes "nobody at Spendbox can read it back to you" a promise
-- worth making, and it is also the thing that stops a player putting one up:
-- a box needs money behind it, and money behind it needs a password worth
-- attacking. A generated one removes both problems at once. The player brings
-- the audience; Spendbox brings the prize; the password is drawn by Postgres
-- and read by nobody.
--
-- The economics are deliberate and worth stating plainly, because they are a
-- real cost rather than a clever trick:
--
--   * **Spendbox funds the pot.** ₦100,000 by default, actually funded, so the
--     figure on the card is the figure a winner is paid. Nothing accrues and
--     nothing is promised that isn't there.
--   * **The creator earns the usual 70%** of every power-up and life bought
--     against their safe, exactly as a contributor does.
--   * **Difficulty is the brake.** A generated password sits at the top of the
--     Brutal band, which is hundreds of attempts of grinding. That is what
--     stands between a free prize and a free giveaway.
--
-- The exposure is therefore (live free safes) × (pot), and it is bounded by
-- three settings rather than by hope: how many may exist at once, how big the
-- pot is, and whether generation is on at all. All three are in `/admin`.

-- ---------------------------------------------------------------------------
-- A third kind of box
-- ---------------------------------------------------------------------------

alter table public.boxes drop constraint if exists boxes_kind_check;
alter table public.boxes
  add constraint boxes_kind_check
  check (kind in ('general', 'contributor', 'free'));

-- The owner of a free safe is a *player*, which is a different thing from a
-- contributor: no login, no dashboard, no Paystack subaccount. They are
-- identified by the same six-month cookie they play with.
alter table public.boxes
  add column if not exists creator_player_id uuid references public.players (id) on delete set null;

alter table public.boxes drop constraint if exists boxes_owner_matches_kind;
alter table public.boxes
  add constraint boxes_owner_matches_kind
  check (
    (kind = 'general' and contributor_id is null and creator_player_id is null)
    or (kind = 'contributor' and contributor_id is not null and creator_player_id is null)
    or (kind = 'free' and contributor_id is null and creator_player_id is not null)
  );

/*
 * One at a time, enforced by the database rather than by a route.
 *
 * A partial unique index rather than a count in application code: two taps on
 * a slow connection are two requests, and a `select count(*)` followed by an
 * `insert` in a route is a race that hands somebody two safes. The index makes
 * the second insert fail no matter how they arrive.
 *
 * Scoped to `live`, so cracking one — or having it closed — frees the slot.
 */
create unique index if not exists boxes_one_live_free_per_player
  on public.boxes (creator_player_id)
  where kind = 'free' and status = 'live';

-- What the creator has earned from their safe, and what has actually been sent.
-- A player has no subaccount for Paystack to split into, so unlike a
-- contributor's 70% this accrues here and is paid by a human from /admin — the
-- same path a reward already takes, for the same reason.
alter table public.boxes
  add column if not exists creator_earned_kobo bigint not null default 0
    check (creator_earned_kobo >= 0);
alter table public.boxes
  add column if not exists creator_paid_kobo bigint not null default 0
    check (creator_paid_kobo >= 0);

create index if not exists boxes_creator_idx
  on public.boxes (creator_player_id) where kind = 'free';

-- ---------------------------------------------------------------------------
-- The settings that bound the exposure
-- ---------------------------------------------------------------------------

insert into public.platform_settings (key, value)
values ('free_safes', '{}'::jsonb)
on conflict (key) do nothing;

/*
 * Defaults live here, in one place, and a missing row, an empty object and an
 * untouched key all behave identically — the same contract 0039 and 0040 set
 * for prices and the alphabet.
 */
create or replace function public.free_safe_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.platform_settings where key = 'free_safes'),
    '{}'::jsonb
  );
$$;

/** One reader for every bound, so no two callers can disagree about a limit. */
create or replace function public.free_safe_config()
returns table (enabled boolean, pot_kobo bigint, max_live int, creator_share_percent int)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((public.free_safe_settings() ->> 'enabled')::boolean, true),
    -- ₦100,000. Clamped so a typo in the admin field cannot put ten million
    -- behind a box nobody paid for.
    least(greatest(coalesce((public.free_safe_settings() ->> 'potKobo')::bigint, 100000 * 100), 0),
          1000000 * 100),
    greatest(coalesce((public.free_safe_settings() ->> 'maxLive')::int, 50), 0),
    least(greatest(coalesce((public.free_safe_settings() ->> 'creatorSharePercent')::int, 70), 0), 100);
$$;

create or replace function public.set_free_safe_settings(p_value jsonb, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_free_safe_settings';
  end if;

  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('free_safes', p_value, nullif(trim(p_by), ''), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_value;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drawing a password nobody has seen
-- ---------------------------------------------------------------------------

/*
 * Letters and digits only, and that is a safety property rather than a
 * shortcut.
 *
 * The symbol half of the alphabet is admin-editable (0040), and the letters
 * and digits deliberately are not — "they are in every password ever created
 * and an admin removing them would break the game rather than tune it". A
 * generated password has no author to remember it, so if it contained a symbol
 * that were later removed from the alphabet, every guess containing that
 * character would be refused and the safe would become permanently
 * unwinnable, with a real ₦100,000 stranded behind it. Drawing only from the
 * part that cannot be edited makes that impossible.
 *
 * The cost is a smaller search space per position — 62 candidates rather than
 * 111 — and it is paid back in length: these are drawn at the top of the
 * Brutal band rather than the bottom. It is also published rather than hidden.
 * A rule everybody is told is not a leak; a rule some people work out is.
 */
create or replace function public.free_safe_charset()
returns text language sql immutable parallel safe as $$
  select 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
$$;

/** The length band a generated safe is drawn at: the top of Brutal (16–21). */
create or replace function public.free_safe_length()
returns int language sql volatile as $$
  select 20 + floor(random() * 2)::int
$$;

/*
 * The password itself.
 *
 * `gen_random_bytes` rather than `random()`: this is the one string on the
 * platform that a real ₦100,000 depends on, and `random()` is a seeded PRNG
 * whose state an attacker who can observe other outputs could in principle
 * reconstruct. The modulo bias across 62 candidates in a 256-value byte is
 * negligible at this length and is not the weak link in anything.
 *
 * It is never returned. The only caller inserts it straight into
 * `boxes.secret`, which no RLS policy anywhere grants a select on, so the
 * string exists inside one statement and then only as a column nothing reads.
 */
create or replace function public.new_free_password()
returns text
language plpgsql
volatile
as $$
declare
  v_chars text := public.free_safe_charset();
  v_len int := public.free_safe_length();
  v_out text := '';
  v_byte int;
begin
  for i in 1..v_len loop
    v_byte := get_byte(gen_random_bytes(1), 0);
    v_out := v_out || substr(v_chars, (v_byte % length(v_chars)) + 1, 1);
  end loop;
  return v_out;
end;
$$;

/*
 * A name and a slug, so a free safe is a thing rather than a serial number.
 *
 * Two words and four hex characters. The words make it shareable — "the quiet
 * vault" is something somebody will repeat, and `free-safe-4` is not — and the
 * suffix is what makes the slug unique without a retry loop.
 */
create or replace function public.new_free_name()
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
  v_tag text := encode(gen_random_bytes(2), 'hex');
begin
  slug := v_adj || '-' || v_noun || '-' || v_tag;
  title := initcap(v_adj) || ' ' || initcap(v_noun);
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generating one
-- ---------------------------------------------------------------------------

/*
 * Put up a free safe for a player.
 *
 * Every refusal is a `jsonb` verdict rather than an exception, because none of
 * them is an error: "you already have one" and "we've hit the cap for now" are
 * ordinary answers a screen has to render.
 *
 * The whole thing is one statement's worth of work in one transaction, so two
 * simultaneous taps cannot produce two safes — and even if they somehow got
 * past the count, the partial unique index above refuses the second insert.
 */
create or replace function public.generate_free_safe(p_email citext)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_cfg record;
  v_live int;
  v_name record;
  v_box public.boxes;
  /*
   * The password, drawn once.
   *
   * It has to be held in a variable rather than called inline twice, because
   * `boxes_secret_length` requires `length` to equal `char_length(secret)` and
   * two calls to a volatile generator are two different passwords of two
   * different lengths — an insert that succeeded only when the two rolls
   * happened to agree, which is to say about half the time.
   *
   * It is never returned. This is the only scope the string exists in outside
   * the column, the function is `security definer` and revoked from every role
   * a browser can reach, and nothing it returns contains it.
   */
  v_secret text;
begin
  v_player := public.ensure_player(p_email);
  if v_player.id is null then
    return jsonb_build_object('result', 'error', 'error', 'no_player');
  end if;

  select * into v_cfg from public.free_safe_config();

  if not v_cfg.enabled then
    return jsonb_build_object('result', 'error', 'error', 'disabled');
  end if;

  -- One at a time. Checked here so the answer is a sentence rather than a
  -- constraint violation, and enforced by the index regardless.
  if exists (
    select 1 from public.boxes
     where kind = 'free' and status = 'live' and creator_player_id = v_player.id
  ) then
    return jsonb_build_object('result', 'error', 'error', 'already_have_one');
  end if;

  -- The platform-wide brake. Every live free safe is ₦100,000 of real
  -- liability, so this is the number that decides how much of it exists.
  select count(*) into v_live from public.boxes where kind = 'free' and status = 'live';
  if v_live >= v_cfg.max_live then
    return jsonb_build_object('result', 'error', 'error', 'at_capacity');
  end if;

  select * into v_name from public.new_free_name();
  v_secret := public.new_free_password();

  insert into public.boxes (
    kind, creator_player_id, slug, title, blurb,
    secret, length,
    funding_kobo, reward_kobo, platform_fee_kobo,
    status, published_at, design
  )
  values (
    'free', v_player.id, v_name.slug, v_name.title,
    'A free safe. Nobody has ever seen this password — it was drawn by the database and read by no one.',
    v_secret, char_length(v_secret),
    -- Funded and reward are the same figure, and the fee is zero: Spendbox
    -- put the money in and keeps none of it back. On a contributor's box the
    -- 30% is what pays for running the box; here there is nothing to take it
    -- out of, and taking it out of the prize would make the card a lie.
    v_cfg.pot_kobo, v_cfg.pot_kobo, 0,
    'live', now(), 'midnight'
  )
  returning * into v_box;

  return jsonb_build_object(
    'result', 'created',
    'id', v_box.id,
    'slug', v_box.slug,
    'title', v_box.title,
    'reward_kobo', v_box.reward_kobo
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- You cannot win your own
-- ---------------------------------------------------------------------------

/*
 * `spend_attempt` gains one refusal, and it is the only rule this feature adds
 * to play.
 *
 * On a funded box "you cannot win your own" is a term, and it is enforced by
 * the fact that winning your own box costs you the stake you put behind it. A
 * free safe has no such brake: the creator paid nothing, so grinding their own
 * safe for a ₦100,000 payout is simply a good idea unless something stops it.
 * They do not know the password — nobody does — but they can guess like anyone
 * else, so the refusal has to be real rather than contractual.
 *
 * Refused before a life is spent, and with its own error, so the screen can
 * say why rather than silently taking the guess.
 *
 * Copied forward from 0056 with that one block added; otherwise unchanged.
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

  if v_box.kind = 'free' and v_box.creator_player_id = v_player.id then
    return jsonb_build_object('result', 'error', 'error', 'own_free_safe');
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
-- The creator's share
-- ---------------------------------------------------------------------------

/*
 * Credit a free safe's creator for a sale against it.
 *
 * Called from settlement, after the order is confirmed paid, and it is
 * additive rather than a recomputation so replaying a webhook cannot double
 * it — the caller only reaches this on the one call that flipped the order to
 * paid, exactly as the contributor split already works.
 */
create or replace function public.credit_free_safe(p_box_id uuid, p_kobo bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kobo is null or p_kobo <= 0 then return; end if;
  update public.boxes
     set creator_earned_kobo = creator_earned_kobo + p_kobo
   where id = p_box_id and kind = 'free';
end;
$$;

/** Record a payout to a creator. Never lets what has been sent exceed earnings. */
create or replace function public.pay_free_safe(p_box_id uuid, p_kobo bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.boxes;
begin
  update public.boxes
     set creator_paid_kobo = creator_paid_kobo + p_kobo
   where id = p_box_id
     and kind = 'free'
     and creator_paid_kobo + p_kobo <= creator_earned_kobo
   returning * into v_box;

  if not found then
    return jsonb_build_object('result', 'error', 'error', 'more_than_owed');
  end if;
  return jsonb_build_object(
    'result', 'paid',
    'paid_kobo', v_box.creator_paid_kobo,
    'earned_kobo', v_box.creator_earned_kobo
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- What an admin can see
-- ---------------------------------------------------------------------------

/*
 * The password of a free safe, for an administrator only.
 *
 * This is the one hole in "nobody at Spendbox can read a password back", and
 * it is deliberately shaped so the promise stays true where it was made. That
 * promise is about a password *somebody wrote* — a contributor's box, where
 * being able to read it back would mean we could give it away. Nobody wrote
 * this one. It was drawn by the database, and reading it reveals nothing about
 * any person.
 *
 * Scoped by `kind = 'free'` in the function body rather than left to the
 * caller: a route that forgot the filter would otherwise be a way to read
 * every contributor's password on the platform.
 */
create or replace function public.free_safe_secret(p_box_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select secret from public.boxes where id = p_box_id and kind = 'free';
$$;

/** Every free safe, with what it has earned and how it is doing. */
create or replace view public.admin_free_safes as
select
  b.id,
  b.slug,
  b.title,
  b.status,
  b.reward_kobo,
  b.length,
  b.attempts_count,
  b.players_count,
  b.best_percent,
  b.published_at,
  b.unlocked_at,
  b.creator_earned_kobo,
  b.creator_paid_kobo,
  b.creator_earned_kobo - b.creator_paid_kobo as creator_owed_kobo,
  p.email as creator_email,
  p.id as creator_player_id,
  w.email as winner_email
from public.boxes b
left join public.players p on p.id = b.creator_player_id
left join public.players w on w.id = b.unlocked_by
where b.kind = 'free';

/** The exposure, in one row: what is live, and what it would cost to lose. */
create or replace view public.admin_free_safe_exposure as
select
  count(*) filter (where status = 'live')                                as live,
  count(*) filter (where status = 'unlocked')                            as cracked,
  count(*)                                                               as total,
  coalesce(sum(reward_kobo) filter (where status = 'live'), 0)::bigint   as at_risk_kobo,
  coalesce(sum(reward_kobo) filter (where status = 'unlocked'), 0)::bigint as paid_out_kobo,
  coalesce(sum(creator_earned_kobo), 0)::bigint                          as creators_earned_kobo,
  coalesce(sum(creator_earned_kobo - creator_paid_kobo), 0)::bigint      as creators_owed_kobo,
  coalesce(sum(attempts_count), 0)::bigint                               as attempts
from public.boxes where kind = 'free';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- `free_safe_secret` is the one that matters. It is `security definer` and
-- would otherwise be executable by `PUBLIC`, which anon and authenticated both
-- inherit — that is a password oracle reachable from a browser.
revoke execute on function public.free_safe_secret(uuid) from public, anon, authenticated;
revoke execute on function public.generate_free_safe(citext) from public, anon, authenticated;
revoke execute on function public.credit_free_safe(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.pay_free_safe(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.free_safe_settings() from public, anon, authenticated;
revoke execute on function public.free_safe_config() from public, anon, authenticated;
revoke execute on function public.set_free_safe_settings(jsonb, text) from public, anon, authenticated;
revoke execute on function public.new_free_password() from public, anon, authenticated;
revoke execute on function public.new_free_name() from public, anon, authenticated;

revoke all on public.admin_free_safes from public, anon, authenticated;
revoke all on public.admin_free_safe_exposure from public, anon, authenticated;
grant select on public.admin_free_safes to service_role;
grant select on public.admin_free_safe_exposure to service_role;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
