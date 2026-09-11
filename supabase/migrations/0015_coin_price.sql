-- ============================================================================
-- What a coin costs, moved out of the code and into the settings row.
--
-- Run this after 0014_welcome_coin.sql. Safe to run twice.
--
-- ₦100 a coin was a constant in the app (NAIRA_PER_COIN in src/lib/money.ts),
-- which meant that changing the price of the only thing this site sells was a
-- deploy — the same problem the box limit had in 0008 and the prize had in
-- 0012, and the one with the shortest fuse of the three. A price is the number
-- an operator wants to move on a Saturday afternoon, in response to what people
-- are actually paying, and it is quoted on the landing page, on every box page,
-- in the wallet, in the terms and on the how-it-works page. All of those read
-- it from here now.
--
-- What this deliberately does NOT do, and the reason there is no trigger in
-- this file the way there is in 0012:
--
--   * It does not touch a payment that has already been opened. A `topups` row
--     carries the coins bought and the amount in kobo, written when the
--     transfer or the checkout was opened, and that pair is the price the
--     player was quoted. Moving this number changes what the next payment
--     costs; it cannot reprice one somebody is halfway through making, and
--     `creditTopup` in src/lib/wallet.ts still pays out the coins the row says.
--
--   * It does not need a trigger to keep the browser out of it. A box carries
--     its prize in a column the caller's own client writes, which is why 0012
--     has to overrule that insert. Nothing writes a `topups` row but the
--     service role — there is no insert policy on that table at all, by design
--     (see 0002_policies.sql) — so the amount charged is already only ever the
--     server's arithmetic on the server's price.
--
--   * It does not change what a coin already in a wallet is worth. A coin is a
--     go at a box, not a store of naira; "worth ₦x" on the wallet screen is the
--     price of buying that many today, and it moves with the price like every
--     other quote on the site.
-- ============================================================================

-- The row everything below depends on. `where id` matches nothing without it.
insert into public.settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- settings.naira_per_coin — what one coin costs, in naira.
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists naira_per_coin integer not null default 100;

-- Named, so it can be re-run: an unnamed check would stack up a new constraint
-- every time this migration is applied.
alter table public.settings
  drop constraint if exists settings_coin_price_sane;

-- The floor is not squeamishness about cheap coins, it is Paystack. Every
-- top-up is a real bank transfer with a real fee behind it, and a payment of a
-- few naira is one the fee swallows whole and the gateway may refuse outright.
-- The smallest top-up is a handful of coins, so the smallest payment this site
-- can open is that many times this number — see MIN_NAIRA_PER_COIN in
-- src/lib/money.ts, which the admin screen checks against and explains.
--
-- The ceiling is the same kind of guard as MAX_PRIZE_NAIRA: a typo catcher. A
-- stray zero turns ₦100 a coin into ₦1,000 a coin, and the first anybody would
-- know about it is a player being asked for ₦5,000 for the smallest top-up.
alter table public.settings
  add constraint settings_coin_price_sane
  check (naira_per_coin between 1 and 1000000);

-- ---------------------------------------------------------------------------
-- set_coin_price — the admin's way to move it.
--
-- Upserts and returns what is stored rather than what it was asked for, so the
-- screen can only ever report the truth. Same arrangement as set_prize and
-- set_welcome_rules.
--
-- Zero is refused. A free coin is not a cheaper coin: it is a payment of
-- nothing, which Paystack will not open, on a screen that would be inviting
-- somebody to transfer ₦0 for five of them. Giving coins away is what the
-- welcome grant in 0014 is for, and it is counted apart from coins sold
-- precisely so that free coins never arrive through the till.
-- ---------------------------------------------------------------------------
create or replace function public.set_coin_price(p_naira integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored integer;
begin
  if p_naira is null then
    raise exception 'a coin price is required';
  end if;

  if p_naira <= 0 then
    raise exception 'a coin has to cost something — to give coins away, use the welcome coin';
  end if;

  insert into public.settings (id, naira_per_coin, updated_at)
       values (true, p_naira, now())
  on conflict (id) do update
          set naira_per_coin = excluded.naira_per_coin,
              updated_at     = now()
    returning naira_per_coin into v_stored;

  return v_stored;
end;
$$;

revoke all on function public.set_coin_price(integer) from public, anon, authenticated;
grant execute on function public.set_coin_price(integer) to service_role;
