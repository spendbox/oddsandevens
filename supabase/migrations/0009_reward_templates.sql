-- ---------------------------------------------------------------------------
-- 0009_reward_templates: a merchant-level library of reusable rewards.
--
-- Rewards are now defined up front (in the dashboard's Build → Rewards tab) and
-- only later assigned to a grid. When a grid is built, the chosen templates are
-- copied into grid-bound `rewards` rows (unchanged), so the play/redeem logic
-- keeps working exactly as before — this table is just the reusable catalogue.
-- ---------------------------------------------------------------------------

create table public.reward_templates (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  details text check (char_length(details) <= 300),
  default_expiry_days int not null default 30
    check (default_expiry_days between 1 and 60),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index reward_templates_merchant_idx
  on public.reward_templates (merchant_id, created_at desc);

alter table public.reward_templates enable row level security;

-- Merchants read their own catalogue directly (dashboard); writes go through
-- the service-role API routes only.
grant select on public.reward_templates to authenticated;
create policy reward_templates_owner_select on public.reward_templates
  for select to authenticated
  using (
    merchant_id in (
      select id from public.merchants where owner_id = (select auth.uid())
    )
  );
