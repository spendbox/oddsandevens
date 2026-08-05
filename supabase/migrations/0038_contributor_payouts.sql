-- Paying contributors what didn't settle itself.
--
-- Most of a contributor's money never touches us: a power-up or a life bought
-- against their box is split by Paystack at settlement, against their own
-- subaccount, so their 70% goes straight to their bank and never sits in our
-- balance waiting for somebody to move it.
--
-- That is the happy path and it covers everything *after* they connect an
-- account. Before that — and for every sale made while a subaccount was
-- missing or rejected — the split still exists on the order row, but the money
-- landed with us. Somebody has to send it, and until now there was nowhere to
-- record having done so.
--
-- So: a ledger of payments made, and one view of what is owed. Owed is simply
-- everything earned minus everything already paid, which is the only definition
-- that stays correct when a payout is recorded late, twice, or for a partial
-- amount.

-- ---------------------------------------------------------------------------
-- 1. The ledger
-- ---------------------------------------------------------------------------

create table if not exists public.contributor_payouts (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.contributors (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  /** Free text: a transfer reference, or "settled via subaccount". */
  note text,
  paid_at timestamptz not null default now(),
  /** Whoever ticked it off. */
  paid_by text,
  created_at timestamptz not null default now()
);

alter table public.contributor_payouts enable row level security;

create index if not exists contributor_payouts_who_idx
  on public.contributor_payouts (contributor_id, paid_at desc);

-- A contributor may read their own history. Nobody may write from a browser:
-- every insert comes from the admin route, through the service role.
drop policy if exists contributor_payouts_read_own on public.contributor_payouts;
create policy contributor_payouts_read_own on public.contributor_payouts
  for select using (
    contributor_id in (select id from public.contributors where owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. What is owed
-- ---------------------------------------------------------------------------

/*
 * Every contributor, what they have earned, what they have been sent, and the
 * difference.
 *
 * Earnings are read off the order rows rather than recomputed from prices: the
 * split was decided and stored when the order was created, so a later change to
 * the platform share can never silently rewrite what somebody is owed for work
 * already done.
 *
 * `settled` counts the sales that went out through their own subaccount and so
 * need no transfer from us. It is reported rather than subtracted, because
 * whether a given order settled that way is a fact about the order and not
 * something to infer — a contributor who connected an account halfway through a
 * month has some of each.
 */
create or replace function public.contributor_balances()
returns table (
  contributor_id uuid,
  display_name text,
  handle text,
  bank_name text,
  account_number text,
  account_name text,
  has_subaccount boolean,
  earned_kobo bigint,
  paid_kobo bigint,
  owed_kobo bigint,
  last_paid_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with earned as (
    select contributor_id, sum(contributor_kobo)::bigint as kobo
      from (
        select contributor_id, contributor_kobo
          from public.power_up_orders
         where status = 'paid' and contributor_id is not null
        union all
        select contributor_id, contributor_kobo
          from public.life_orders
         where status = 'paid' and contributor_id is not null
      ) sales
     group by contributor_id
  ),
  sent as (
    select contributor_id,
           sum(amount_kobo)::bigint as kobo,
           max(paid_at) as at
      from public.contributor_payouts
     group by contributor_id
  )
  select
    c.id,
    c.display_name,
    c.handle,
    c.payout_bank_name,
    c.payout_account_number,
    c.payout_account_name,
    c.paystack_subaccount_code is not null,
    coalesce(e.kobo, 0),
    coalesce(s.kobo, 0),
    greatest(coalesce(e.kobo, 0) - coalesce(s.kobo, 0), 0),
    s.at
  from public.contributors c
  left join earned e on e.contributor_id = c.id
  left join sent s on s.contributor_id = c.id
  where coalesce(e.kobo, 0) > 0 or coalesce(s.kobo, 0) > 0
  order by greatest(coalesce(e.kobo, 0) - coalesce(s.kobo, 0), 0) desc;
$$;

/** Record a transfer. Returns the row, so the caller can show what it wrote. */
create or replace function public.record_contributor_payout(
  p_contributor_id uuid,
  p_amount_kobo bigint,
  p_note text default null,
  p_paid_by text default null
)
returns public.contributor_payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.contributor_payouts;
begin
  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'invalid_amount';
  end if;

  insert into public.contributor_payouts (contributor_id, amount_kobo, note, paid_by)
  values (p_contributor_id, p_amount_kobo, nullif(trim(p_note), ''), nullif(trim(p_paid_by), ''))
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.contributor_balances(),
  public.record_contributor_payout(uuid, bigint, text, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tell PostgREST
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
