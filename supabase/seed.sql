-- Local/test seed data. Intended for `supabase db reset` on a LOCAL stack only.
-- Creates one test merchant auth user, a free-tier merchant with an active
-- 5x5 grid, and a single reward hidden on one tile.
--
-- Test merchant login: seed-merchant@example.com / password123
-- Play page: /g/mama-put-kitchen

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'seed-merchant@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now()
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"seed-merchant@example.com"}',
  'email',
  '11111111-1111-1111-1111-111111111111',
  now(), now(), now()
)
on conflict do nothing;

insert into public.merchants (id, owner_id, business_name, slug, subscription_tier)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Mama Put Kitchen',
  'mama-put-kitchen',
  'free'
)
on conflict (id) do nothing;

-- Build the grid through the same function the app uses.
select public.create_grid(
  '22222222-2222-2222-2222-222222222222',
  5, 5,
  '[{"description": "Free plate of jollof rice", "expiry_hours": 48, "max_redemptions": 1}]'::jsonb
);
