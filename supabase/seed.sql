-- Local/test seed data. Intended for `supabase db reset` on a LOCAL stack only.
--
-- Creates one contributor account, the free public box, and one funded
-- contributor box, so a fresh clone has something to play the moment it boots.
--
-- Contributor login: seed@example.com / password123
-- Public box:        /b/the-opening-night
-- Staked box:        /b/adas-safe
--
-- The passwords are in plain sight here on purpose — that is the point of a
-- seed file, and the reason it must never be pointed at a real project.
--   THE OPENING NIGHT → oPen
--   ADA'S SAFE        → Na1ra!
--
-- Case matters, so those are exact. Neither box tells a player how long it is.

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'seed@example.com',
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
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"seed@example.com"}',
  'email',
  '11111111-1111-1111-1111-111111111111',
  now(), now(), now()
)
on conflict do nothing;

insert into public.contributors (id, owner_id, display_name, handle)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Ada Obi',
  'ada-obi'
)
on conflict (owner_id) do nothing;

-- The public box: funded by the platform, so no split to make.
insert into public.boxes (
  id, kind, slug, title, blurb, secret, length,
  funding_kobo, reward_kobo, platform_fee_kobo, status, published_at
) values (
  '33333333-3333-3333-3333-333333333333',
  'general', 'the-opening-night', 'The Opening Night',
  'Short, free, and on us. Somewhere to learn how the marking works.',
  'oPen', 4,
  0, 5000000, 0, 'live', now()
)
on conflict (id) do nothing;

-- A funded box: ₦1,000,000 in, ₦700,000 reward, ₦300,000 to the platform.
insert into public.boxes (
  id, kind, contributor_id, slug, title, blurb, secret, length,
  funding_kobo, reward_kobo, platform_fee_kobo, status, published_at
) values (
  '44444444-4444-4444-4444-444444444444',
  'contributor', '22222222-2222-2222-2222-222222222222',
  'adas-safe', 'Ada''s Safe',
  'Not every character is a letter, and not every letter is lowercase.',
  'Na1ra!', 6,
  100000000, 70000000, 30000000, 'live', now()
)
on conflict (id) do nothing;
