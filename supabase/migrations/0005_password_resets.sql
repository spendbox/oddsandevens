-- ============================================================================
-- Password resets, sent by us rather than by Supabase.
--
-- Run this after 0004_guests_and_banks.sql. Safe to run twice.
--
-- Supabase's own resetPasswordForEmail sends through its built-in mailer, which
-- is rate limited hard enough that resets quietly stop arriving under real
-- traffic. Spendbox sends its own mail through Resend instead, which means it
-- has to own the tokens too. This is that table.
--
-- What is stored is a SHA-256 of the token, never the token. Anybody who gets a
-- copy of this table — a leaked backup, an over-broad read — still cannot reset
-- a single password with it, because the thing in the email cannot be worked
-- back out of the thing in the row.
-- ============================================================================

create table if not exists public.password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Looking up "recent resets for this person", which is what the rate limit and
-- the consume step both do.
create index if not exists password_resets_user_idx
  on public.password_resets (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- No policies at all, on purpose.
--
-- Row level security with nothing granted denies everything, which is exactly
-- right here: a browser has no business reading, writing or even counting these
-- rows. Only the server, holding the service-role key, ever touches this table.
-- ---------------------------------------------------------------------------
alter table public.password_resets enable row level security;
