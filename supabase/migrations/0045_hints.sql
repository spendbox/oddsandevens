-- Hints: a strategy on the way into a guess.
--
-- The guess dialog is the one moment in the game when a sentence about how to
-- play is welcome rather than in the way — somebody has decided to spend a
-- life and has not yet decided what to type. So one line of method appears
-- there, drawn at random.
--
-- Stored beside the prices and the alphabet, in the same shape and for the
-- same reason: these want tuning after watching people play, and a good one
-- thought of on a Tuesday should not need a deploy. The built-in list in
-- `hints.ts` remains the default, so a missing row, an empty object and an
-- empty list all behave identically.
--
-- Nothing here is derived from a password, which is why it is safe to hand the
-- whole list to every browser: a hint is about the shape of the problem, never
-- about the safe in front of you.

insert into public.platform_settings (key, value)
values ('hints', '{}'::jsonb)
on conflict (key) do nothing;

/** The hints blob, or an empty object. Never null, so callers needn't check. */
create or replace function public.hint_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.platform_settings where key = 'hints'),
    '{}'::jsonb
  );
$$;

/**
 * Replace the hint list wholesale.
 *
 * Wholesale, as with pricing and the alphabet: the admin screen sends the
 * entire list it is displaying, so deleting a line there deletes it here and
 * clearing the field is how the built-in list comes back.
 *
 * The shape is checked; the contents are not. What counts as a usable hint —
 * long enough to be a sentence, short enough to read, not a duplicate — is
 * decided in `hints.ts`, by the same function the reader uses, so anything
 * that gets past this is still dropped on the way out.
 */
create or replace function public.set_hint_settings(p_value jsonb, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_hints';
  end if;

  if p_value ? 'hints' and jsonb_typeof(p_value -> 'hints') <> 'array' then
    raise exception 'invalid_hints';
  end if;

  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('hints', p_value, nullif(trim(p_by), ''), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_value;
end;
$$;

revoke execute on function public.hint_settings() from public, anon, authenticated;
revoke execute on function public.set_hint_settings(jsonb, text)
  from public, anon, authenticated;

grant execute on function public.hint_settings() to service_role;
grant execute on function public.set_hint_settings(jsonb, text) to service_role;

notify pgrst, 'reload schema';
