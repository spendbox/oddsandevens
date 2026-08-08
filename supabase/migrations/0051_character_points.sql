-- Characters stop being interchangeable.
--
-- Every scale before this one — 0027's three tiers, 0048's four — priced a
-- character by *how* it was found and never by *which* character it was. A `q`
-- in its right place and a `7` in its right place were the same hundred points,
-- so a four-character password had four equal quarters and a player who had
-- placed one character knew exactly what the next one would be worth. Reading
-- the board was arithmetic on a constant.
--
-- Now each character carries its own worth, and the four quarters are four
-- different sizes. The consequence is the point of the change: a score is no
-- longer a count of characters wearing a percentage sign. 25% used to mean "one
-- of four", full stop; it now means "a quarter of this password's *value*",
-- which could be one expensive character or two cheap ones, and the guess that
-- scored it cannot be reconstructed from the number. Every attempt log on the
-- site gets harder to read without a single extra thing being hidden.
--
-- ---------------------------------------------------------------------------
-- What a character is worth
-- ---------------------------------------------------------------------------
--
-- Four classes, three of them scattered and one of them ordered:
--
--     lowercase   10–20     scattered
--     uppercase   20–30     scattered
--     digits       1–10     `0` is 1, `9` is 10, in that order
--     symbols     10–25     scattered
--
-- Uppercase outranking lowercase is the one deliberate leak, and it is a leak
-- the game already had: 0048 pays a wrong-case hit less than a right-case one,
-- so case was always worth money. Digits being both cheap and *ordered* is the
-- opposite of a leak — it is a trap. A player who works out that `0` is worth
-- one point has learned something true and nearly useless, because knowing a
-- digit is cheap does not tell you which digit, and the ordering means the
-- cheapest character on the board is also the one people put in passwords most.
--
-- The scattering is deterministic rather than drawn once and stored, and that
-- choice carries the whole design:
--
--   * It is **stable**. A stored table can be edited, dropped, restored from a
--     backup half a day old, or diverge between staging and production — and
--     every one of those silently rescales every score ever recorded. A pure
--     function of the character cannot.
--   * It **already covers characters that don't exist yet**. 0040 lets an admin
--     add symbols to the alphabet without a deploy. Any symbol they add — any
--     code point at all — gets its points from the same hash the moment it is
--     first typed, with nothing to remember to do and no possible state where a
--     live character has no price.
--   * It keeps `score_attempt` **immutable**, which is what lets the backfill at
--     the bottom of this file run as a plain join, and what keeps the scorer
--     unable to read anything but its two arguments.
--
-- The salt is what makes the spread arbitrary, and it is the one thing in here
-- that must never change: changing it re-prices every character and rescales
-- every score on the site. It stays in the function, in Postgres, behind the
-- same revoke as everything else — never in the API, never in a browser.
--
-- ---------------------------------------------------------------------------
-- What a guess earns
-- ---------------------------------------------------------------------------
--
-- Three outcomes, priced against the *password's* character rather than the
-- guess's — the denominator is built out of the password, so the credits have
-- to be too:
--
--     right place, right case                    full value
--     right place, wrong case                    half
--     right character elsewhere, either case     half
--
-- Which is a deliberate flattening of 0048's fourth tier. 0048 paid a
-- wrong-case hit in the wrong place half of what it paid one in the right
-- place, so a player walking a mis-cased character across the positions could
-- still see it dip where it belonged. Under the rule above those two are the
-- same number, and that lesson is gone: while your case is wrong, position is
-- invisible. Getting the case right is what makes a character locatable, and
-- then the doubling names its position exactly.
--
-- Restoring the old behaviour is one number — `w_moved_miscase`, below, is
-- carried as its own constant precisely so that it can be halved again without
-- touching anything else.
--
-- Everything else is 0048's and is unchanged: three passes in order, each
-- position scoring at most once, wrong-place hits budgeted against what is
-- actually spare so a duplicate can't be farmed, greedy left-to-right matching
-- rather than an optimal assignment, and a denominator that grows with an
-- over-long guess so that 100% still means solved and nothing else does.
--
-- The scale itself remains undocumented anywhere a player can reach: not in the
-- API, not in the FAQ, not in a JavaScript bundle.

-- ---------------------------------------------------------------------------
-- The price list
-- ---------------------------------------------------------------------------

/**
 * What one character is worth, in points.
 *
 * `ascii()` gives the Unicode code point under UTF-8, and the classes are
 * decided on the code point rather than on a regex range or a `between`,
 * because both of those read the database collation and a collation is a thing
 * that differs between two servers running the same schema. A price list that
 * depends on `lc_collate` is a price list that changes when somebody restores
 * onto a differently-configured box.
 *
 * The hash is md5 of the salted character, first 32 bits, taken through
 * `bit(32)` to `bigint` — which zero-extends rather than sign-extends, so the
 * value is always non-negative and the modulo is always in range.
 */
create or replace function public.char_points(p_ch text)
returns int
language plpgsql
immutable
as $$
declare
  -- Never change this. See the note at the top of the file.
  c_salt constant text := 'oddsandevens:char-points:v1:';
  v_code int;
  v_hash bigint;
begin
  if p_ch is null or char_length(p_ch) <> 1 then
    return 0;
  end if;

  v_code := ascii(p_ch);

  -- Digits are ordered rather than scattered: '0' is 1 and '9' is 10.
  if v_code between 48 and 57 then
    return v_code - 48 + 1;
  end if;

  v_hash := ('x' || substr(md5(c_salt || p_ch), 1, 8))::bit(32)::bigint;

  if v_code between 97 and 122 then          -- a–z
    return 10 + (v_hash % 11)::int;          -- 10–20
  elsif v_code between 65 and 90 then        -- A–Z
    return 20 + (v_hash % 11)::int;          -- 20–30
  end if;

  return 10 + (v_hash % 16)::int;            -- symbols, 10–25
end;
$$;

/**
 * What a whole password is worth — the sum of its characters.
 *
 * Not used by the scorer, which needs the per-character values anyway and
 * builds its own total as it goes. It exists so that "how much is this box
 * worth in points" is answerable from psql without anybody reimplementing the
 * sum and getting it subtly wrong.
 */
create or replace function public.password_points(p_text text)
returns int
language sql
immutable
as $$
  select coalesce(sum(public.char_points(ch)), 0)::int
    from regexp_split_to_table(coalesce(p_text, ''), '') ch
   where ch <> '';
$$;

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

-- Replaced rather than dropped: the return type is 0048's exactly, so
-- `spend_attempt` still calls this correctly and does not need reproducing, and
-- CREATE OR REPLACE keeps the revoked privileges that a DROP would hand back.
create or replace function public.score_attempt(p_secret text, p_guess text)
returns table (
  length_hint text,
  exact_count int,
  miscase_count int,
  elsewhere_count int,
  elsewhere_miscase_count int,
  score_percent numeric
)
language plpgsql
immutable
as $$
declare
  -- Halves, in a scale doubled so that they are integers. A character's full
  -- worth is 2 units per point; half of it is 1. Nothing here is ever shown.
  w_exact           constant int := 2;  -- right place, right case
  w_miscase         constant int := 1;  -- right place, wrong case
  w_moved           constant int := 1;  -- wrong place, right case
  w_moved_miscase   constant int := 1;  -- wrong place, wrong case

  v_slen int := char_length(p_secret);
  v_glen int := char_length(p_guess);
  v_overlap int := least(v_slen, v_glen);
  v_span int := greatest(v_slen, v_glen);
  v_i int;
  v_s text;
  v_g text;
  v_scored boolean[];
  v_spare text[] := '{}';
  v_idx int;
  v_points int := 0;
  -- What a flawless guess would have earned. The password's own value, plus
  -- the value of whatever a too-long guess padded it out with — so padding is
  -- charged for at the price of the characters wasted on it, and a guess that
  -- is not the password cannot reach 100%.
  v_total int := 0;
begin
  length_hint := case
    when v_glen < v_slen then 'shorter'
    when v_glen > v_slen then 'longer'
    else 'exact'
  end;
  exact_count := 0;
  miscase_count := 0;
  elsewhere_count := 0;
  elsewhere_miscase_count := 0;
  score_percent := 0;

  if v_span = 0 then
    return next;
    return;
  end if;

  for v_i in 1..v_slen loop
    v_total := v_total + w_exact * public.char_points(substr(p_secret, v_i, 1));
  end loop;
  -- Empty when the guess is no longer than the password: plpgsql skips an
  -- ascending FOR whose end is below its start.
  for v_i in v_slen + 1..v_glen loop
    v_total := v_total + w_exact * public.char_points(substr(p_guess, v_i, 1));
  end loop;

  v_scored := array_fill(false, array[greatest(v_overlap, 1)]);

  -- Pass 1: exact hits. Everything they consume leaves the pool.
  for v_i in 1..greatest(v_overlap, 0) loop
    v_s := substr(p_secret, v_i, 1);
    if substr(p_guess, v_i, 1) = v_s then
      exact_count := exact_count + 1;
      v_points := v_points + w_exact * public.char_points(v_s);
      v_scored[v_i] := true;
    end if;
  end loop;

  -- Pass 2: right letter, right place, wrong case. Before pass 3, so a
  -- character standing in its own position is always scored as that rather
  -- than as a wandering copy of itself. Priced on the password's character —
  -- `B` and `b` are not worth the same, and the one being paid for is the one
  -- in the password.
  for v_i in 1..greatest(v_overlap, 0) loop
    if not v_scored[v_i] then
      v_s := substr(p_secret, v_i, 1);
      v_g := substr(p_guess, v_i, 1);
      if lower(v_g) = lower(v_s) then
        miscase_count := miscase_count + 1;
        v_points := v_points + w_miscase * public.char_points(v_s);
        v_scored[v_i] := true;
      end if;
    end if;
  end loop;

  -- What's left of the password after the first two passes. A position beyond
  -- the guess's length is unclaimed too, so a short guess can still find a
  -- character that lives further along.
  for v_i in 1..v_slen loop
    if v_i > v_overlap or not v_scored[v_i] then
      v_spare := array_append(v_spare, substr(p_secret, v_i, 1));
    end if;
  end loop;

  -- Pass 3: right character, wrong place, budgeted against what's spare.
  --
  -- The two tiers pay the same now, but they are still tried in this order and
  -- still counted apart. Which copy gets consumed decides what the *rest* of
  -- the guess can still find, and `x` and `X` are not worth the same, so a
  -- guess holding `x` where both are spare must take the one it actually typed.
  for v_i in 1..greatest(v_overlap, 0) loop
    if not v_scored[v_i] then
      v_g := substr(p_guess, v_i, 1);

      v_idx := array_position(v_spare, v_g);
      if v_idx is not null then
        v_points := v_points + w_moved * public.char_points(v_spare[v_idx]);
        v_spare := v_spare[1:v_idx - 1] || v_spare[v_idx + 1:array_length(v_spare, 1)];
        elsewhere_count := elsewhere_count + 1;
      else
        -- No exact-case copy going spare. Take a differently-cased one if
        -- there is one. `select into` leaves v_idx null when the query finds
        -- nothing, which is the whole of the "no match" case.
        select i into v_idx
          from generate_subscripts(v_spare, 1) i
         where lower(v_spare[i]) = lower(v_g)
         order by i
         limit 1;

        if v_idx is not null then
          v_points := v_points + w_moved_miscase * public.char_points(v_spare[v_idx]);
          v_spare := v_spare[1:v_idx - 1] || v_spare[v_idx + 1:array_length(v_spare, 1)];
          elsewhere_miscase_count := elsewhere_miscase_count + 1;
        end if;
      end if;
    end if;
  end loop;

  if v_total > 0 then
    score_percent := round((v_points::numeric * 100) / v_total, 2);
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Every past attempt is rescored, for 0048's reason and not as tidying: a
-- percentage only means anything if every percentage on the board is on the
-- same scale. Leaving history alone would put two scales in one column, make a
-- player's 62% and a rival's 58% incomparable, and leave `best_percent` as the
-- high-water mark of a measure that moved underneath it.
--
-- Exact rather than approximate — the password is still on the box and the
-- guess is still on the attempt, so the new function is simply run against
-- them. Bests will move in both directions.
--
-- Computed in a subquery rather than a lateral hanging off the UPDATE target:
-- an UPDATE's own table isn't visible to its FROM clause.
update public.attempts a
   set exact_count = s.exact_count,
       miscase_count = s.miscase_count,
       elsewhere_count = s.elsewhere_count,
       elsewhere_miscase_count = s.elsewhere_miscase_count,
       score_percent = s.score_percent
  from (
    select old.id,
           sc.exact_count,
           sc.miscase_count,
           sc.elsewhere_count,
           sc.elsewhere_miscase_count,
           sc.score_percent
      from public.attempts old
      join public.hunts h on h.id = old.hunt_id
      join public.boxes b on b.id = h.box_id
      cross join lateral public.score_attempt(b.secret, old.value) sc
  ) s
 where a.id = s.id;

-- The two high-water marks are derived from the attempts, so they are rebuilt
-- from the attempts rather than nudged. A hunt or a box with nothing under it
-- falls back to zero, which is what it started as.
update public.hunts h
   set best_percent = coalesce(
     (select max(a.score_percent) from public.attempts a where a.hunt_id = h.id),
     0
   );

update public.boxes b
   set best_percent = coalesce(
     (select max(a.score_percent)
        from public.attempts a
        join public.hunts h on h.id = a.hunt_id
       where h.box_id = b.id),
     0
   );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- `char_points` is the price list. Reachable from PostgREST it would be an
-- endpoint that answers "what is `q` worth" one character at a time, which is
-- the entire secret handed over in ninety-odd requests. `password_points` is
-- worse: it prices a whole string. Both are service-role only, and the revoke
-- on `score_attempt` is re-issued for good measure.
revoke execute on function
  public.char_points(text),
  public.password_points(text),
  public.score_attempt(text, text)
from public, anon, authenticated;

notify pgrst, 'reload schema';
