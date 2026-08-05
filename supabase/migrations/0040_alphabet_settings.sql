-- The alphabet, out of the build and into the database.
--
-- 0039 did this for prices. This is the same idea applied to the other number
-- the whole economy rests on: how many characters are possible at each
-- position. Every symbol added is another candidate everywhere, so the list is
-- the difference between a safe taking four hundred attempts and eighteen
-- hundred — and it was a TypeScript array, changeable only by a deploy.
--
-- Same shape as the pricing row, and for the same reasons: one jsonb blob
-- under its own key, one `security definer` reader, one writer, and the
-- built-in list in `constants.ts` remains the default for an install where
-- nobody has touched it. A missing row, an empty object and an empty list all
-- mean "use the default".
--
-- What is *not* here: the letters and the digits. They are in every password
-- ever created and an admin removing them would break the game rather than
-- tune it, so only the symbol list is stored.

insert into public.platform_settings (key, value)
values ('alphabet', '{}'::jsonb)
on conflict (key) do nothing;

/** The alphabet blob, or an empty object. Never null, so callers needn't check. */
create or replace function public.alphabet_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.platform_settings where key = 'alphabet'),
    '{}'::jsonb
  );
$$;

/**
 * Replace the alphabet blob wholesale.
 *
 * Wholesale rather than merged, exactly as with pricing: the admin screen
 * sends the entire list it is displaying, so removing a symbol there removes
 * it here, and clearing the field is how the list goes back to the built-in
 * default.
 *
 * The shape is checked but the *contents* are not — what counts as a usable
 * character (one code point, printable, not a letter or a digit) is decided in
 * `alphabet.ts`, by the same function the reader uses, so a value that somehow
 * gets past this is still dropped on the way out.
 */
create or replace function public.set_alphabet_settings(p_value jsonb, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_alphabet';
  end if;

  if p_value ? 'symbols' and jsonb_typeof(p_value -> 'symbols') <> 'array' then
    raise exception 'invalid_alphabet';
  end if;

  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('alphabet', p_value, nullif(trim(p_by), ''), now())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_value;
end;
$$;

-- Nothing reads these from a browser: both go through the service role.
revoke execute on function public.alphabet_settings() from public, anon, authenticated;
revoke execute on function public.set_alphabet_settings(jsonb, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
