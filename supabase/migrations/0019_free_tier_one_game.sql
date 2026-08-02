-- ---------------------------------------------------------------------------
-- 0019_free_tier_one_game: a free business runs one game at a time.
--
-- Two free games split a business's own audience across two leaderboards, and
-- half a board is a worse prize draw than a whole one — the free tier was
-- quietly making itself look thin. One live game, one board, everyone who taps
-- the link competing with everyone else.
--
-- The cap moves out of the function body and into app_settings, so it can be
-- changed for a promotion without a migration.
--
-- Businesses already running two keep both: the check is on publishing, so
-- nothing goes dark, they simply can't add a third — or a second, once one is
-- paused.
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value)
values ('free_live_games', to_jsonb(1))
on conflict (key) do nothing;

create or replace function public.publish_game(
  p_merchant_id uuid,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant merchants%rowtype;
  v_game games%rowtype;
  v_is_premium boolean;
  v_live_games int;
  v_cap int;
begin
  select * into v_merchant from merchants where id = p_merchant_id for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'merchant_not_found');
  end if;

  select * into v_game from games
   where id = p_game_id and merchant_id = p_merchant_id
   for update;
  if not found then
    return jsonb_build_object('result', 'error', 'error', 'game_not_found');
  end if;

  if v_game.status = 'active' then
    return jsonb_build_object('result', 'published', 'slug', v_game.slug);
  end if;
  if v_game.status = 'archived' then
    return jsonb_build_object('result', 'error', 'error', 'game_archived');
  end if;

  v_is_premium := v_merchant.subscription_tier = 'premium'
    and v_merchant.premium_expires_at is not null
    and v_merchant.premium_expires_at > now();

  select count(*) into v_live_games
    from games
   where merchant_id = p_merchant_id
     and status = 'active'
     and id <> p_game_id;

  select coalesce(
    (select (value #>> '{}')::int from app_settings where key = 'free_live_games'), 1
  ) into v_cap;

  if not v_is_premium and v_live_games >= v_cap then
    return jsonb_build_object(
      'result', 'error',
      'error', 'too_many_games',
      'live_games', v_live_games,
      'max_games', v_cap
    );
  end if;

  update games
     set status = 'active', updated_at = now()
   where id = p_game_id;

  return jsonb_build_object('result', 'published', 'slug', v_game.slug);
end;
$$;

revoke execute on function public.publish_game(uuid, uuid) from public, anon, authenticated;
