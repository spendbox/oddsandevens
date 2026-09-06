-- Nobody marks their own payment as complete.
--
-- The first version let a buyer insert a purchase row already set to "paid",
-- which handed out paid tools for free. A buyer may now only ever create a
-- pending row, and nothing they can reach may change it: the flip to paid is
-- made by the server with the service role, and only after Paystack itself has
-- confirmed the money arrived.

drop policy if exists "start a purchase" on public.purchases;
create policy "start a purchase" on public.purchases
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and status = 'pending'
    and amount_kobo = (select price_kobo from public.tools where id = tool_id)
    and exists (select 1 from public.tools where id = tool_id and status = 'published')
  );

-- Deliberately no update or delete policy for authenticated users. A pending
-- purchase can only be completed by the service role.
drop policy if exists "settle a purchase" on public.purchases;
