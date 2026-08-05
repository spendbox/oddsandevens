-- A Life Bank order buys no lives, and the table said that was impossible.
--
-- `life_orders` was built in 0024 for one product: a count of guesses, between
-- one and a hundred of them. 0037 added a second product to the same table —
-- Life Bank, which sells the *ceiling* of the pool for a week and hands over
-- no lives outright. The route writes `quantity = 0` for it and settlement
-- reads the reference prefix rather than the number, exactly as intended.
--
-- What nobody moved was the column's own check. `quantity between 1 and 100`
-- rejected every bank order at the insert, so the route returned `order_failed`
-- and the dialog said "Couldn't start that payment. Try again in a moment." to
-- a player who could try all afternoon: Paystack was never reached, the
-- checkout was never opened, and lives and Second Wind — which write a real
-- quantity — went on working perfectly, which is what made it look like a
-- payments problem rather than a schema one.
--
-- So zero becomes legal, and stays meaningful. A life order may only carry a
-- zero if it is a bank, which the reference says and only the server can mint;
-- an ordinary top-up of nothing remains impossible. The invariant belongs here
-- rather than in the route, because the route is not the only thing that could
-- ever write this row.

alter table public.life_orders
  drop constraint if exists life_orders_quantity_check;

alter table public.life_orders
  add constraint life_orders_quantity_check
  check (quantity between 0 and 100);

alter table public.life_orders
  drop constraint if exists life_orders_zero_is_a_bank;

-- `\_` so the underscore is an underscore rather than LIKE's any-character.
alter table public.life_orders
  add constraint life_orders_zero_is_a_bank
  check (quantity > 0 or reference like 'bank\_%');

notify pgrst, 'reload schema';
