-- ---------------------------------------------------------------------------
-- A promo safe you named yourself
-- ---------------------------------------------------------------------------
--
-- 0059 drew the title and the safe's colours along with the password, which
-- confused two very different things. The *password* has to be drawn, because
-- the whole point is that nobody chose it. The name and the design are the
-- half a maker is going to share — and a link somebody is asked to spread
-- should carry a name they picked rather than "Quiet Coffer".
--
-- So both are arguments now, and both are chosen before any money moves.

/*
 * A slug from a title, so the URL matches the name on the card.
 *
 * `boxes.slug` is checked against `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`, so
 * this has to produce something that passes for *any* title — including one
 * that is entirely emoji, entirely punctuation, or a single character. The
 * word-pair fallback is what covers those rather than an error a maker cannot
 * act on, and the four hex characters are what make it unique without a retry
 * loop against a table anybody else may be inserting into at the same moment.
 */
create or replace function public.promo_slug(p_title text)
returns text
language plpgsql
volatile
as $$
declare
  v_base text;
  v_name record;
begin
  v_base := lower(coalesce(p_title, ''));
  -- Anything not a-z0-9 becomes a hyphen, runs collapse, ends are trimmed.
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := substr(v_base, 1, 30);
  v_base := trim(both '-' from v_base);

  -- Two characters is the shortest that still reads as a word; below that the
  -- slug would be mostly suffix, so the drawn name is the better answer.
  if length(v_base) < 2 then
    select * into v_name from public.new_promo_name();
    return v_name.slug;
  end if;

  return v_base || '-' || public.random_hex(4);
end;
$$;

/*
 * Put up a promo safe, named and dressed by whoever is putting it up.
 *
 * The password is still drawn here and still held in one variable that nothing
 * returns. Everything else about the box is theirs, and is settled before the
 * checkout opens rather than after — a box you have already paid for is not
 * the moment to discover you cannot rename it.
 */
create or replace function public.create_promo_box(
  p_contributor_id uuid,
  p_title text default null,
  p_design text default 'midnight'
)
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
  v_title text;
  v_design text;
  v_slug text;
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

  -- An empty or absent title falls back to a drawn one rather than failing:
  -- somebody who does not care what it is called should still get a safe.
  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    select * into v_name from public.new_promo_name();
    v_title := v_name.title;
  end if;
  v_title := substr(v_title, 1, 70);

  -- Checked here rather than trusted from the caller: `boxes_design_check`
  -- would otherwise turn a bad value into a constraint violation the screen
  -- cannot explain.
  v_design := lower(coalesce(p_design, 'midnight'));
  if v_design not in ('brass', 'vault', 'midnight', 'emerald', 'crimson', 'ivory') then
    v_design := 'midnight';
  end if;

  v_slug := public.promo_slug(v_title);
  v_secret := public.new_promo_password();

  insert into public.boxes (
    kind, contributor_id, slug, title, blurb,
    secret, length,
    funding_kobo, reward_kobo, platform_fee_kobo,
    status, design
  )
  values (
    'promo', p_contributor_id, v_slug, v_title,
    'A promo safe. Nobody has ever seen this password — it was drawn by the database and read by no one.',
    v_secret, char_length(v_secret),
    v_cfg.price_kobo, v_cfg.pot_kobo, 0,
    'funding', v_design
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

-- The old one-argument shape would otherwise sit alongside the new one, and
-- PostgREST resolves an rpc call by the arguments it is given: a caller that
-- omitted the title would silently reach the version that ignores it.
drop function if exists public.create_promo_box(uuid);

revoke execute on function public.create_promo_box(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.promo_slug(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
