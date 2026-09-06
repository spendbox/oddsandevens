-- Remove everything Commons created.
--
-- Run this in the Supabase SQL Editor. It deletes all 27 tables and the data in
-- them, the functions and triggers, and the demo accounts the seed created.
-- This cannot be undone.
--
-- It does NOT touch anything Supabase itself owns: your project, your real
-- users, storage, or any table you created yourself.

-- 1. The trigger Commons attached to Supabase's own auth.users table.
drop trigger if exists on_auth_user_created on auth.users;

-- 2. Every table. CASCADE clears the policies, indexes and foreign keys with them.
drop table if exists
  ask_responses, asks, badges, connections, conversations, event_rsvps, events,
  memberships, messages, notifications, point_events, post_useful, posts,
  profiles, pursuits, quiz_attempts, quiz_questions, quizzes, replies,
  reply_useful, resource_votes, resources, stage_completions, stages,
  tool_uses, tools, user_badges
cascade;

-- 3. Every function Commons defined.
drop function if exists public.apply_points() cascade;
drop function if exists public.bump_counter() cascade;
drop function if exists public.can_add_resources(uuid) cascade;
drop function if exists public.collective_progress(uuid) cascade;
drop function if exists public.default_membership_stage() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_member(uuid) cascade;
drop function if exists public.is_steward(uuid) cascade;
drop function if exists public.member_progress(uuid, uuid) cascade;
drop function if exists public.points_for(text) cascade;
drop function if exists public.stage_counts(uuid) cascade;
drop function if exists public.touch_conversation() cascade;
drop function if exists public.words(text[]) cascade;
drop function if exists public.seed_person(uuid, text, text, text, text, text, text, text[]) cascade;
drop function if exists public.seed_stage(uuid, integer) cascade;

-- 4. The twelve demo accounts the seed created. Real sign-ups are untouched:
--    these are removed by their fixed ids, nothing else.
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111104',
  '11111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111106',
  '11111111-1111-1111-1111-111111111107', '11111111-1111-1111-1111-111111111108',
  '11111111-1111-1111-1111-111111111109', '11111111-1111-1111-1111-111111111110',
  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111112'
);

-- 5. Confirm nothing is left.
select coalesce(string_agg(tablename, ', '), 'clean — no tables left in public')
from pg_tables where schemaname = 'public';
