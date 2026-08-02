-- ---------------------------------------------------------------------------
-- 0022_business_life_price: the business sets what a block of plays costs.
--
-- The price was one number for the whole platform. That was fine while nobody
-- was earning from it; now that most of it goes to the business, the business
-- is the one who should decide. A café in a student area and a salon doing
-- ₦40,000 treatments do not have the same idea of what "one more go" is worth.
--
-- Null means "use the platform default", so nothing has to be backfilled and
-- an admin changing the default still moves everyone who never set their own.
--
-- The floor is ₦500 in kobo. Below that the Paystack fee eats most of it and
-- the split stops being worth splitting.
-- ---------------------------------------------------------------------------

alter table public.merchants
  add column if not exists life_topup_price_kobo int;

do $$
begin
  alter table public.merchants
    add constraint merchants_life_price_check
      check (life_topup_price_kobo is null or life_topup_price_kobo >= 50000);
exception
  when duplicate_object then null;
end
$$;

-- The floor lives in settings too, so it can be moved without a deploy if
-- Paystack's fees change.
insert into public.app_settings (key, value)
values ('life_topup_min_price_kobo', to_jsonb(50000))
on conflict (key) do nothing;
