-- ---------------------------------------------------------------------------
-- 0010_auth_verification: email verification codes (custom OTP over Resend).
--
--   * verification_codes backs three flows, all delivered as 6-digit codes by
--     Resend: merchant signup, merchant password reset, and customer email
--     verification. Codes are stored hashed with a short expiry + attempt cap.
--   * customers.email_verified gates winning/redeeming: a customer must confirm
--     their email with a code before the play endpoint will accept their taps.
--   * auth_user_id_by_email lets the service-role password-reset route find the
--     auth user for an email without listing every user.
-- ---------------------------------------------------------------------------

create table public.verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null
    check (purpose in ('merchant_signup', 'password_reset', 'customer_verify')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index verification_codes_lookup
  on public.verification_codes (email, purpose, created_at desc);

-- Service-role only: every read/write goes through the /api/auth/* routes.
alter table public.verification_codes enable row level security;

alter table public.customers
  add column if not exists email_verified boolean not null default false;

-- Resolve an auth user id from an email (service-role reset flow only).
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where email = lower(trim(p_email)) limit 1;
$$;

revoke execute on function public.auth_user_id_by_email(text) from anon, authenticated;
