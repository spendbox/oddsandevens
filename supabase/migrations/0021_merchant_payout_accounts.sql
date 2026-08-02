-- ---------------------------------------------------------------------------
-- 0021_merchant_payout_accounts: the business's share reaches its bank.
--
-- Until now the 70/30 split existed only as arithmetic on a report. Every
-- naira a player spent landed in the platform's Paystack account and somebody
-- would have had to move the business's share by hand, every week, forever.
-- That is not a revenue share, it's an IOU.
--
-- So each business connects its own bank account, we register it with Paystack
-- as a **subaccount**, and every life purchase is initialised against that
-- subaccount. Paystack does the split at settlement: the business's share goes
-- to their bank, ours stays with us. Nobody moves money by hand.
--
-- `percentage_charge` on a Paystack subaccount is the share the *subaccount*
-- receives, so it is set to 100 minus the platform share and kept in step
-- whenever an admin changes the rate.
--
-- A business can't publish a game until this is done. That is deliberate: a
-- game can sell extra plays from the moment it's live, and taking a player's
-- money with nowhere to send the business's half is the one failure here that
-- would be somebody else's money.
-- ---------------------------------------------------------------------------

alter table public.merchants
  -- SUBACCOUNT_xxx, from Paystack. Present = payouts are wired up.
  add column if not exists paystack_subaccount_code text,
  -- What the business chose, kept so the dashboard can show it back to them
  -- and so a re-connect can be diffed against it.
  add column if not exists payout_bank_code text,
  add column if not exists payout_bank_name text,
  add column if not exists payout_account_number text,
  -- As resolved by Paystack, not as typed: proof the number is real and the
  -- name on the account is whose it is.
  add column if not exists payout_account_name text,
  add column if not exists payout_connected_at timestamptz;

-- Which game a player was on when they bought extra plays.
--
-- Lives are a business-wide pool, so a purchase isn't *for* a game — but it
-- was made somewhere, and a business asking "is this game worth running"
-- deserves to see what it brought in. Null when the purchase came from the
-- hub, which belongs to no single game.
alter table public.life_purchases
  add column if not exists game_id uuid references public.games (id) on delete set null;

create index if not exists life_purchases_game_idx
  on public.life_purchases (game_id) where game_id is not null;

create index if not exists merchants_payout_idx
  on public.merchants (paystack_subaccount_code)
  where paystack_subaccount_code is not null;

-- ---------------------------------------------------------------------------
-- publish_game: no payout account, no live game.
--
-- Checked on publishing rather than on drafting, so a business can build and
-- preview a whole game before being asked for bank details — the ask lands
-- when it is obvious why it's being asked.
--
-- Games already live are untouched. This gates the transition, not the state.
-- ---------------------------------------------------------------------------

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

  if v_merchant.paystack_subaccount_code is null then
    return jsonb_build_object('result', 'error', 'error', 'no_payout_account');
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
