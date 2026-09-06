-- Demo data for Commons.
--
-- Run this against a development project only. It creates sign-in-able demo
-- accounts (every one of them uses the password `commons123`) so the app has
-- people, progress and conversation in it from the first minute.

-- Supabase keeps pgcrypto in its own `extensions` schema rather than in public,
-- so crypt() and gen_salt() are only reachable if that schema is on the path.
set search_path = public, extensions;

-- Fail with something a person can act on, rather than "relation does not exist".
do $$
begin
  if to_regclass('public.pursuits') is null then
    raise exception
      'The Commons tables are missing. Run the three files in supabase/migrations first — 0001_init.sql, then 0002_policies.sql, then 0003_grants.sql — and check each one reports Success before running this seed.';
  end if;
end $$;

-- Running this twice should not fail on the second go. Every demo row uses a
-- fixed id, so clearing them by id is exact: it removes the demo data and
-- nothing a real person has created. Deleting a pursuit or a user cascades to
-- their posts, needs, resources and events.
delete from public.pursuits where id in (
  '22222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222202',
  '22222222-2222-2222-2222-222222222203', '22222222-2222-2222-2222-222222222204',
  '22222222-2222-2222-2222-222222222205', '22222222-2222-2222-2222-222222222206'
);
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111104',
  '11111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111106',
  '11111111-1111-1111-1111-111111111107', '11111111-1111-1111-1111-111111111108',
  '11111111-1111-1111-1111-111111111109', '11111111-1111-1111-1111-111111111110',
  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111112'
);

-- A demo account, complete with the auth row Supabase would normally create.
-- The on_auth_user_created trigger fills in the profile; we enrich it after.
create or replace function public.seed_person(
  p_id uuid, p_email text, p_handle text, p_name text,
  p_headline text, p_location text, p_bio text, p_skills text[]
) returns uuid
language plpgsql
-- Pinned on the function too, so it works whatever the caller's path is.
set search_path = public, extensions
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, crypt('commons123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name)
  ) on conflict (id) do nothing;

  update public.profiles
  set handle = p_handle, full_name = p_name, headline = p_headline,
      location = p_location, bio = p_bio, skills = p_skills, onboarded = true
  where id = p_id;

  return p_id;
end;
$$;

select public.seed_person('11111111-1111-1111-1111-111111111101', 'sarah@commons.demo', 'sarahm', 'Sarah Mensah',
  'Product Designer @ Paystack', 'Lagos, Nigeria',
  'I help teams build delightful products. Shipped two SaaS products of my own before this.',
  array['Product Design','UI/UX','Figma','Research']);
select public.seed_person('11111111-1111-1111-1111-111111111102', 'tunde@commons.demo', 'tundeo', 'Tunde Okafor',
  'Founder, building in public', 'Lagos, Nigeria',
  'Second-time founder. Currently in beta with a B2B invoicing tool. Looking for a technical cofounder.',
  array['Sales','B2B','Growth','Fundraising']);
select public.seed_person('11111111-1111-1111-1111-111111111103', 'amara@commons.demo', 'amaran', 'Amara Nwosu',
  'Backend engineer', 'Abuja, Nigeria',
  'Ten years writing APIs. I like small teams and boring technology.',
  array['Python','Postgres','APIs','Infrastructure']);
select public.seed_person('11111111-1111-1111-1111-111111111104', 'james@commons.demo', 'jamesa', 'James Adeyemi',
  'UX designer looking for a startup', 'Remote',
  'Designer who wants equity, not invoices. Happiest at the messy pre-product stage.',
  array['UX','Prototyping','Branding']);
select public.seed_person('11111111-1111-1111-1111-111111111105', 'mary@commons.demo', 'maryk', 'Mary Kamau',
  'Raised a pre-seed last year', 'Nairobi, Kenya',
  'Raised $400k for my first startup. Happy to read anyone''s deck and tell them the truth.',
  array['Fundraising','Pitching','Finance','Strategy']);
select public.seed_person('11111111-1111-1111-1111-111111111106', 'femi@commons.demo', 'femia', 'Femi Ajayi',
  'Product Manager', 'Lagos, Nigeria',
  'PM by day. Learning to run long distances slowly by morning.',
  array['Product','Analytics','Running']);
select public.seed_person('11111111-1111-1111-1111-111111111107', 'bukky@commons.demo', 'bukkyu', 'Bukky Uche',
  'UX Researcher', 'London, UK',
  'I talk to users for a living. Ask me how to run customer interviews.',
  array['Research','Interviewing','UX','Writing']);
select public.seed_person('11111111-1111-1111-1111-111111111108', 'alex@commons.demo', 'alext', 'Alex Thompson',
  'ML Engineer', 'Berlin, Germany',
  'Machine learning engineer. Moved countries twice, happy to explain the paperwork.',
  array['Machine Learning','Python','Immigration']);
select public.seed_person('11111111-1111-1111-1111-111111111109', 'chidi@commons.demo', 'chidio', 'Chidi Obi',
  'Indie hacker, $3k MRR', 'Enugu, Nigeria',
  'Bootstrapped to $3k MRR with a niche B2B tool. No funding, no team, no regrets.',
  array['B2B','SEO','Bootstrapping','No-code']);
select public.seed_person('11111111-1111-1111-1111-111111111110', 'zainab@commons.demo', 'zainabb', 'Zainab Bello',
  'Learning to code, ex-accountant', 'Kano, Nigeria',
  'Six months into a career change. Currently somewhere between confused and dangerous.',
  array['Excel','Accounting','SQL']);
select public.seed_person('11111111-1111-1111-1111-111111111111', 'daniel@commons.demo', 'danielk', 'Daniel Kwame',
  'Marathon runner, 6 completed', 'Accra, Ghana',
  'Six marathons in. I coach two people a season for free, because someone did it for me.',
  array['Running','Coaching','Nutrition']);
select public.seed_person('11111111-1111-1111-1111-111111111112', 'ngozi@commons.demo', 'ngozie', 'Ngozi Eze',
  'Moved to Canada in 2023', 'Toronto, Canada',
  'Express Entry, two suitcases, one very cold January. Ask me anything.',
  array['Immigration','Relocation','Nursing']);

-- ---------------------------------------------------------------------------
-- Pursuits
-- ---------------------------------------------------------------------------

insert into public.pursuits (id, slug, title, tagline, description, category, emoji, accent, tags, created_by) values
('22222222-2222-2222-2222-222222222201', 'build-a-profitable-saas',
 'Build a Profitable SaaS Company',
 'From an idea you cannot stop thinking about to revenue you can live on.',
 'A pursuit for people building software businesses that pay for themselves. Not a place to talk about building — a place to actually get to revenue, with people a few steps ahead of you and a few steps behind.',
 'business', '🚀', 'violet', array['saas','startups','product','revenue'],
 '11111111-1111-1111-1111-111111111102'),
('22222222-2222-2222-2222-222222222202', 'master-product-design',
 'Master Product Design',
 'Go from making things look right to making things work right.',
 'For designers deepening their craft: research, systems, interaction, and the judgement to know which matters when.',
 'skill', '📘', 'emerald', array['design','ux','figma','craft'],
 '11111111-1111-1111-1111-111111111101'),
('22222222-2222-2222-2222-222222222203', 'move-to-canada',
 'Move to Canada',
 'Paperwork, proof of funds, and the first winter.',
 'People at every stage of relocating to Canada, from the first Google search to the second year of settling in.',
 'life', '📍', 'amber', array['immigration','relocation','canada'],
 '11111111-1111-1111-1111-111111111112'),
('22222222-2222-2222-2222-222222222204', 'run-a-half-marathon',
 'Run a Half Marathon',
 '21 kilometres, starting from wherever you are today.',
 'A training pursuit. Couch to 21k, injury setbacks, race-day nerves, and the people one training block ahead of you.',
 'health', '🏃', 'rose', array['running','fitness','training'],
 '11111111-1111-1111-1111-111111111111'),
('22222222-2222-2222-2222-222222222205', 'learn-python-properly',
 'Learn Python Properly',
 'Not another tutorial. Actually learning it.',
 'For people who want to write real Python, not follow along with videos. Built around projects, code review from people further ahead, and finishing what you start.',
 'skill', '🐍', 'sky', array['python','programming','learning'],
 '11111111-1111-1111-1111-111111111103'),
('22222222-2222-2222-2222-222222222206', 'financial-freedom-before-35',
 'Financial Freedom Before 35',
 'Earn more, keep more, put the rest to work.',
 'Income, savings rate, and investing — discussed openly with real numbers by people at very different stages.',
 'money', '🔥', 'orange', array['money','investing','savings'],
 '11111111-1111-1111-1111-111111111105');

-- Stages: the journey each pursuit is organised around.
insert into public.stages (pursuit_id, name, description, position) values
('22222222-2222-2222-2222-222222222201', 'Idea', 'You have something you cannot stop thinking about.', 1),
('22222222-2222-2222-2222-222222222201', 'Validating', 'Talking to people who might pay for it.', 2),
('22222222-2222-2222-2222-222222222201', 'Building', 'Making the first version.', 3),
('22222222-2222-2222-2222-222222222201', 'Beta', 'Real people are using it.', 4),
('22222222-2222-2222-2222-222222222201', 'Launched', 'It is public and earning.', 5),
('22222222-2222-2222-2222-222222222201', 'Profitable', 'It pays for itself and then some.', 6),

('22222222-2222-2222-2222-222222222202', 'Learning the tools', 'Figma, files, the basics.', 1),
('22222222-2222-2222-2222-222222222202', 'Copying well', 'Rebuilding good work to understand it.', 2),
('22222222-2222-2222-2222-222222222202', 'Solving problems', 'Design driven by research, not taste.', 3),
('22222222-2222-2222-2222-222222222202', 'Systems thinking', 'Components, tokens, consistency at scale.', 4),
('22222222-2222-2222-2222-222222222202', 'Leading craft', 'Setting direction for other designers.', 5),

('22222222-2222-2222-2222-222222222203', 'Researching', 'Working out which route applies to you.', 1),
('22222222-2222-2222-2222-222222222203', 'Documents', 'Language tests, credentials, proof of funds.', 2),
('22222222-2222-2222-2222-222222222203', 'Applied', 'Submitted and waiting.', 3),
('22222222-2222-2222-2222-222222222203', 'Approved', 'Confirmation in hand, planning the move.', 4),
('22222222-2222-2222-2222-222222222203', 'Landed', 'Arrived and finding your feet.', 5),
('22222222-2222-2222-2222-222222222203', 'Settled', 'Work, housing, community in place.', 6),

('22222222-2222-2222-2222-222222222204', 'Starting out', 'Building the habit of showing up.', 1),
('22222222-2222-2222-2222-222222222204', 'Running 5k', 'Comfortable with the first milestone.', 2),
('22222222-2222-2222-2222-222222222204', 'Running 10k', 'Distance is no longer the problem.', 3),
('22222222-2222-2222-2222-222222222204', 'Long runs', '15k+ and building endurance.', 4),
('22222222-2222-2222-2222-222222222204', 'Race ready', 'Tapering, and slightly terrified.', 5),
('22222222-2222-2222-2222-222222222204', 'Finished', 'You did the thing.', 6),

('22222222-2222-2222-2222-222222222205', 'Syntax', 'Variables, loops, functions.', 1),
('22222222-2222-2222-2222-222222222205', 'First project', 'Something small that actually runs.', 2),
('22222222-2222-2222-2222-222222222205', 'Real programs', 'Files, APIs, databases, errors.', 3),
('22222222-2222-2222-2222-222222222205', 'Reading others'' code', 'Contributing and reviewing.', 4),
('22222222-2222-2222-2222-222222222205', 'Fluent', 'You reach for Python without thinking.', 5),

('22222222-2222-2222-2222-222222222206', 'Getting out of debt', 'Clearing what you owe.', 1),
('22222222-2222-2222-2222-222222222206', 'Building a buffer', 'Six months of expenses saved.', 2),
('22222222-2222-2222-2222-222222222206', 'Growing income', 'Raises, side income, better rates.', 3),
('22222222-2222-2222-2222-222222222206', 'Investing steadily', 'Money working without you.', 4),
('22222222-2222-2222-2222-222222222206', 'Work optional', 'Income covers life without a job.', 5);

-- Stage lookup by position, so the inserts below stay readable.
create or replace function public.seed_stage(p_pursuit uuid, p_position integer)
returns uuid language sql stable as $$
  select id from public.stages where pursuit_id = p_pursuit and position = p_position;
$$;

-- ---------------------------------------------------------------------------
-- Who is pursuing what, and how far along they are
-- ---------------------------------------------------------------------------

insert into public.memberships (pursuit_id, user_id, stage_id, intent) values
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', public.seed_stage('22222222-2222-2222-2222-222222222201', 4), 'Getting my invoicing tool out of beta and to 50 paying customers.'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', public.seed_stage('22222222-2222-2222-2222-222222222201', 6), 'Already launched two. Here mostly to help people earlier on.'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111109', public.seed_stage('22222222-2222-2222-2222-222222222201', 5), 'From $3k MRR to $10k without hiring anyone.'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111105', public.seed_stage('22222222-2222-2222-2222-222222222201', 3), 'Rebuilding after my first startup. Slower this time.'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111103', public.seed_stage('22222222-2222-2222-2222-222222222201', 2), 'Engineer with an idea. Trying not to build it before someone wants it.'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104', public.seed_stage('22222222-2222-2222-2222-222222222201', 1), 'Looking for a founder to join rather than an idea of my own.'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111107', public.seed_stage('22222222-2222-2222-2222-222222222201', 2), 'Validating a research tool for small teams.'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111106', public.seed_stage('22222222-2222-2222-2222-222222222201', 1), 'Still deciding whether to leave my job.'),

('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101', public.seed_stage('22222222-2222-2222-2222-222222222202', 5), 'Building a design team, not just designs.'),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111104', public.seed_stage('22222222-2222-2222-2222-222222222202', 3), 'Getting better at defending decisions with research.'),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111107', public.seed_stage('22222222-2222-2222-2222-222222222202', 4), 'Bringing research and design systems closer together.'),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111106', public.seed_stage('22222222-2222-2222-2222-222222222202', 2), 'A PM learning enough design to be useful, not dangerous.'),

('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111112', public.seed_stage('22222222-2222-2222-2222-222222222203', 6), 'Settled in Toronto. Here to answer the questions I once had.'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111108', public.seed_stage('22222222-2222-2222-2222-222222222203', 5), 'Landed in Berlin first, Canada next. Comparing the two systems.'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111110', public.seed_stage('22222222-2222-2222-2222-222222222203', 2), 'Gathering documents. IELTS booked for March.'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111106', public.seed_stage('22222222-2222-2222-2222-222222222203', 1), 'Working out whether Express Entry is realistic for me.'),

('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', public.seed_stage('22222222-2222-2222-2222-222222222204', 6), 'Six marathons in. Coaching two people this season.'),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111106', public.seed_stage('22222222-2222-2222-2222-222222222204', 4), 'Half marathon in May. Longest run so far is 16k.'),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111102', public.seed_stage('22222222-2222-2222-2222-222222222204', 2), 'Running to stay sane while building a company.'),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111110', public.seed_stage('22222222-2222-2222-2222-222222222204', 1), 'Week three. Everything hurts.'),

('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111103', public.seed_stage('22222222-2222-2222-2222-222222222205', 5), 'Fluent. Here to review beginners'' code.'),
('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111108', public.seed_stage('22222222-2222-2222-2222-222222222205', 5), 'Python daily for ML work.'),
('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111110', public.seed_stage('22222222-2222-2222-2222-222222222205', 2), 'Finished the syntax. Building a small budgeting tool now.'),

('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111105', public.seed_stage('22222222-2222-2222-2222-222222222206', 4), 'Investing steadily since the raise. Aiming for work-optional at 34.'),
('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111109', public.seed_stage('22222222-2222-2222-2222-222222222206', 3), 'Growing MRR is my investing strategy for now.'),
('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111110', public.seed_stage('22222222-2222-2222-2222-222222222206', 1), 'Clearing a loan before anything else.');

-- ---------------------------------------------------------------------------
-- Discussions
-- ---------------------------------------------------------------------------

insert into public.posts (pursuit_id, author_id, kind, title, body, stage_id, created_at) values
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111107', 'insight',
 'I interviewed 7 potential customers today. Here is what I learned.',
 E'Three things surprised me.\n\n1. Nobody described the problem the way I do. I say "reporting takes too long". They say "I do not trust the numbers". Same problem, completely different words — and my landing page used my words, not theirs.\n\n2. Five of the seven already had a workaround. A spreadsheet, mostly. That is not a reason to stop, but it does mean the bar is "better than the spreadsheet they already built", not "better than nothing".\n\n3. The two who had no workaround were the two most excited. They are probably my first customers, and they were the ones I almost did not call.\n\nIf you are validating right now: ask them to describe the problem before you describe your product. Everything changes after that.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 2), now() - interval '2 hours'),

('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111109', 'win',
 'Just crossed $3,000 MRR, bootstrapped, no team',
 E'Took 19 months. No funding, no cofounder, no ads.\n\nWhat actually worked: writing one genuinely useful article a week for a search term my customers type. It is slow for about six months and then it is not slow.\n\nWhat did not work: everything else I tried in the first year.\n\nHappy to answer anything about SEO for boring B2B tools.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 5), now() - interval '1 day'),

('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111103', 'question',
 'How do you know when you have validated enough to start building?',
 E'I have spoken to 12 people. Nine said they would use it. But "would use it" is not money, and I know that.\n\nDo I need a pre-order before I write code, or is that only realistic for some kinds of product? I am an engineer and I can feel myself wanting to build because building is the comfortable part.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 2), now() - interval '5 hours'),

('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'update',
 'Beta is live, 84 people using it',
 E'Opened the beta on Monday. 84 signups, 31 actually created something, 6 came back three days running.\n\nThat last number is the only one I care about.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 4), now() - interval '3 days'),

('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101', 'insight',
 'The fastest way to improve: rebuild something good, badly, then compare',
 E'Pick a screen from a product you admire. Rebuild it from memory. Then put them side by side.\n\nEverything you got wrong is a lesson you will never forget, because you had to notice it yourself. Reading design articles does not do this. Rebuilding does.',
 public.seed_stage('22222222-2222-2222-2222-222222222202', 2), now() - interval '8 hours'),

('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111112', 'insight',
 'Proof of funds: the thing nobody explains properly',
 E'It is not just having the money. It is showing it has been there, in your name, for six months, with documentation the officer can follow without asking questions.\n\nA lump sum that appeared last week will be questioned. Start the clock earlier than you think you need to.',
 public.seed_stage('22222222-2222-2222-2222-222222222203', 2), now() - interval '1 day'),

('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'insight',
 'Run slower. Nearly everyone here is running their easy runs too fast.',
 E'If you cannot hold a conversation while running, you are not doing an easy run — you are doing a medium-hard run, and medium-hard is the least useful pace there is.\n\nEighty percent of your kilometres should feel almost embarrassingly slow. The speed comes from the other twenty.',
 public.seed_stage('22222222-2222-2222-2222-222222222204', 3), now() - interval '6 hours'),

('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111110', 'question',
 'When does it stop feeling like guessing?',
 E'I finished a course, I can read code, but every time I sit down to write something myself I freeze. Is there a specific point where this changes, or does everyone just quietly keep guessing?',
 public.seed_stage('22222222-2222-2222-2222-222222222205', 2), now() - interval '4 hours');

insert into public.replies (post_id, author_id, body, created_at)
select p.id, '11111111-1111-1111-1111-111111111101',
  E'This matches my experience exactly. The "describe the problem first" thing is the whole interview. Everything after it is confirmation bias.',
  now() - interval '1 hour'
from public.posts p where p.title like 'I interviewed 7 potential%';

insert into public.replies (post_id, author_id, body, created_at)
select p.id, '11111111-1111-1111-1111-111111111102',
  E'The workaround point is underrated. I lost a year to a problem people had already solved with a Google Sheet.',
  now() - interval '40 minutes'
from public.posts p where p.title like 'I interviewed 7 potential%';

insert into public.replies (post_id, author_id, body, created_at)
select p.id, '11111111-1111-1111-1111-111111111109',
  E'You do not need a pre-order, you need a commitment that costs them something. Time counts. If someone will give you two hours to set it up with them, that is a real signal. If they will not, "would use it" was politeness.',
  now() - interval '3 hours'
from public.posts p where p.title like 'How do you know when you have validated%';

insert into public.replies (post_id, author_id, body, created_at)
select p.id, '11111111-1111-1111-1111-111111111103',
  E'It never fully stops. What changes is that you get comfortable being stuck, because you have been stuck a hundred times and got out every time. Build something tiny and finish it. Finishing is the skill.',
  now() - interval '2 hours'
from public.posts p where p.title like 'When does it stop feeling like guessing%';

-- ---------------------------------------------------------------------------
-- Needs and offers
-- ---------------------------------------------------------------------------

insert into public.asks (pursuit_id, user_id, kind, title, body, tags, created_at) values
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'need',
 'Someone experienced with B2B customer acquisition',
 'I can build and I can design. I cannot sell. Looking for anyone who has taken a B2B tool from zero to its first fifty customers.',
 array['b2b','sales','growth'], now() - interval '2 days'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111109', 'offer',
 'I can help with SEO for boring B2B products',
 'Bootstrapped mine to $3k MRR almost entirely through search. Happy to look at your keywords and tell you which ones are worth writing for.',
 array['seo','b2b','content'], now() - interval '1 day'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111104', 'offer',
 'I can design your first version, for equity',
 'UX designer looking for a founding team rather than clients. I will do the product design if the idea and the people are right.',
 array['design','ux','cofounder'], now() - interval '4 days'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111103', 'need',
 'A technical review of my architecture before I build',
 'One hour with someone who has scaled a Postgres-backed SaaS. I want to be told what I will regret.',
 array['engineering','postgres','architecture'], now() - interval '6 hours'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111105', 'offer',
 'I will read your pitch deck and be honest about it',
 'Raised $400k for my first startup and read a lot of decks since. I will tell you what an investor would think but not say.',
 array['fundraising','pitching'], now() - interval '3 days'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111110', 'need',
 'Anyone who has done the IELTS recently',
 'Booked for March and I do not know how much preparation is realistic alongside a full-time job.',
 array['ielts','documents'], now() - interval '12 hours'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111112', 'offer',
 'I can walk you through Express Entry end to end',
 'Did it in 2023. Happy to go through the profile, the points, and what actually delayed me.',
 array['express-entry','immigration'], now() - interval '5 days'),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111106', 'need',
 'A training partner for long runs in Lagos',
 'Sunday mornings, 15k and building. Slow pace, no ego.',
 array['lagos','long-runs'], now() - interval '1 day'),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'offer',
 'I coach two people free each season',
 'Six marathons, and someone coached me for nothing when I started. Taking two people through a half marathon block.',
 array['coaching','training-plan'], now() - interval '2 days'),
('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111103', 'offer',
 'I will review your Python code, line by line',
 'Ten years of Python. Send me anything under 300 lines and I will tell you what I would change and why.',
 array['code-review','python'], now() - interval '1 day'),
('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111110', 'need',
 'Someone to pair with once a week',
 'I learn much faster with another person on the call. Any level ahead of mine is fine.',
 array['pairing','accountability'], now() - interval '8 hours');

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------

insert into public.resources (pursuit_id, user_id, kind, title, url, description, stage_id, vote_count) values
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111107', 'book', 'The Mom Test', 'http://momtestbook.com',
 'How to talk to customers without them lying to you to be nice. Read it before your first interview, not after.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 2), 87),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111109', 'template', 'Customer interview script', null,
 'The twelve questions I ask, in order, and the three I never ask any more.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 2), 54),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'tool', 'Plausible Analytics', 'https://plausible.io',
 'Simple analytics that will not drown you in numbers you cannot act on.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 4), 31),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111105', 'experience', 'What raising a pre-seed actually took', null,
 'Ninety-one investor conversations, eleven second meetings, one cheque. The honest numbers, in case yours look discouraging.',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 5), 66),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101', 'course', 'Refactoring UI', 'https://refactoringui.com',
 'The fastest jump in visual quality most self-taught designers will make.',
 public.seed_stage('22222222-2222-2222-2222-222222222202', 2), 72),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111107', 'book', 'Interviewing Users', null,
 'Steve Portigal. How to run a research session that produces something you can act on.',
 public.seed_stage('22222222-2222-2222-2222-222222222202', 3), 40),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111112', 'link', 'Express Entry points calculator', 'https://www.canada.ca',
 'Run your real numbers before you spend money on anything else.',
 public.seed_stage('22222222-2222-2222-2222-222222222203', 1), 95),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111108', 'template', 'Document checklist that got me approved', null,
 'Everything I submitted, in the order I gathered it, with the two things I nearly forgot.',
 public.seed_stage('22222222-2222-2222-2222-222222222203', 2), 61),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'template', '12-week half marathon plan', null,
 'The plan I give the people I coach. Four runs a week, one of them long.',
 public.seed_stage('22222222-2222-2222-2222-222222222204', 2), 78),
('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111103', 'course', 'Automate the Boring Stuff', 'https://automatetheboringstuff.com',
 'Free, project-based, and it gets you writing real programs in week one.',
 public.seed_stage('22222222-2222-2222-2222-222222222205', 1), 83);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

insert into public.events (pursuit_id, created_by, kind, title, description, starts_at, location, is_virtual, url) values
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'challenge',
 '30-Day MVP Challenge',
 'Thirty days, one shipped version. Daily check-ins on the discussion board, and a demo call at the end. You do not need an idea to start — you need to be willing to finish.',
 now() + interval '6 days', 'Online', true, null),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111105', 'ama',
 'AMA: raising a pre-seed in Africa',
 'One hour, no slides. Bring the question you are embarrassed to ask publicly.',
 now() + interval '13 days', 'Online', true, null),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111102', 'meetup',
 'SaaS Founders Meetup — Lagos',
 'In person, twenty people, one long table. Come with something you are stuck on.',
 now() + interval '3 days', 'Yaba, Lagos', false, null),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101', 'workshop',
 'Design Systems Study Group',
 'We take apart one real design system a fortnight. This session: tokens, and when they stop helping.',
 now() + interval '5 days', 'Online', true, null),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111112', 'ama',
 'Ask Me Anything: Moving to Canada',
 'I moved in 2023. Every question welcome, including the money ones.',
 now() + interval '8 days', 'Online', true, null),
('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'challenge',
 'Sunday Long Run Club',
 'Everyone runs their own distance, at their own pace, at the same time on Sunday morning. Post your kilometres afterwards.',
 now() + interval '2 days', 'Online', true, null),
('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111103', 'session',
 'Code review hour',
 'Bring something you wrote. We read it together and I explain what I would change.',
 now() + interval '4 days', 'Online', true, null);

-- ---------------------------------------------------------------------------
-- Stages people have finished, in their own words
-- ---------------------------------------------------------------------------

-- Everyone has finished every stage before the one they are standing on. These
-- accounts are written to be true of almost any journey, so the board reads
-- like people rather than like filler, and they are picked deterministically so
-- re-running the seed does not reshuffle everybody's history.
insert into public.stage_completions (pursuit_id, user_id, stage_id, what_i_did, what_was_hard, completed_at)
select
  m.pursuit_id, m.user_id, s.id,
  (array[
    'Slower than I expected. What finally moved it was doing one small piece every day instead of waiting for a clear run at it.',
    'I asked someone a stage ahead what they would skip if they did it again, then did only what they said mattered. Halved the time.',
    'Got stuck for weeks on something that turned out not to matter. Writing down what actually had to be true is what unstuck it.',
    'Unglamorous. I set a target small enough to hit every week and stopped negotiating with myself about it.',
    'The hard part was starting before I felt ready. Everything I was waiting to learn, I learned by doing this badly first.',
    'Two false starts. What worked was making it smaller, until it was something I could finish inside a week.',
    'I copied somebody else''s approach almost exactly, then changed the parts that obviously did not fit me.',
    'Kept a list of every question I could not answer, and worked through it one a week. That list basically was this stage.'
  ])[1 + (abs(hashtext(m.user_id::text || s.id::text)) % 8)],
  (array[
    'Losing momentum whenever life got busy. Shrinking the weekly target until it survived a bad week fixed it.',
    '',
    'Believing I had to understand everything before starting.',
    '',
    'Doing it alone. It got much easier once I was talking to someone else at the same point.',
    '',
    'Comparing myself to people five stages ahead instead of one.',
    ''
  ])[1 + (abs(hashtext(s.id::text || m.user_id::text)) % 8)],
  now() - ((current_stage.position - s.position) * interval '9 days')
from public.memberships m
join public.stages current_stage on current_stage.id = m.stage_id
join public.stages s on s.pursuit_id = m.pursuit_id and s.position < current_stage.position
on conflict do nothing;

-- A few real accounts, written the way the product asks people to write them.
update public.stage_completions set
  what_i_did = 'Interviewed 12 people before writing a line of code. Nine said they would use it; two paid for it up front. Those two became the whole product.',
  what_was_hard = 'I kept pitching instead of listening. Writing the questions down beforehand, and refusing to say the product name in the first ten minutes, fixed it.'
where user_id = '11111111-1111-1111-1111-111111111102'
  and stage_id = public.seed_stage('22222222-2222-2222-2222-222222222201', 2);

update public.stage_completions set
  what_i_did = 'Wrote one article a week for search terms my customers actually type. Nothing happened for five months. Month six brought 40 signups, and it has not stopped since.',
  what_was_hard = 'Writing into silence. I set a rule that I would not check analytics until I had published twenty.'
where user_id = '11111111-1111-1111-1111-111111111109'
  and stage_id = public.seed_stage('22222222-2222-2222-2222-222222222201', 4);

update public.stage_completions set
  what_i_did = 'Booked the IELTS, got the credential assessment started, and opened a separate account for proof of funds so the six-month history would be clean.',
  what_was_hard = 'The order of operations. Half the delays came from doing things in the wrong sequence, not from the things themselves.'
where user_id = '11111111-1111-1111-1111-111111111112'
  and stage_id = public.seed_stage('22222222-2222-2222-2222-222222222203', 2);

-- ---------------------------------------------------------------------------
-- Appreciation — the thing points are actually made of
-- ---------------------------------------------------------------------------

-- People marking each other's posts useful.
insert into public.post_useful (post_id, user_id)
select p.id, m.user_id
from public.posts p
join public.memberships m on m.pursuit_id = p.pursuit_id and m.user_id <> p.author_id
where p.kind in ('insight', 'win', 'reflection')
on conflict do nothing;

insert into public.reply_useful (reply_id, user_id)
select r.id, p.author_id
from public.replies r
join public.posts p on p.id = r.post_id
where r.author_id <> p.author_id
on conflict do nothing;

insert into public.resource_votes (resource_id, user_id)
select r.id, m.user_id
from public.resources r
join public.memberships m on m.pursuit_id = r.pursuit_id and m.user_id <> r.user_id
where r.vote_count > 50
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The ledger, derived from the appreciation above so the totals are honest
-- ---------------------------------------------------------------------------

insert into public.point_events (user_id, actor_id, pursuit_id, kind, points, subject_type, subject_id)
select p.author_id, pu.user_id, p.pursuit_id, 'post_useful', public.points_for('post_useful'), 'post', p.id
from public.post_useful pu
join public.posts p on p.id = pu.post_id
where pu.user_id <> p.author_id
on conflict do nothing;

insert into public.point_events (user_id, actor_id, pursuit_id, kind, points, subject_type, subject_id)
select r.author_id, ru.user_id, p.pursuit_id, 'reply_useful', public.points_for('reply_useful'), 'reply', r.id
from public.reply_useful ru
join public.replies r on r.id = ru.reply_id
join public.posts p on p.id = r.post_id
where ru.user_id <> r.author_id
on conflict do nothing;

insert into public.point_events (user_id, actor_id, pursuit_id, kind, points, subject_type, subject_id)
select res.user_id, rv.user_id, res.pursuit_id, 'resource_upvote', public.points_for('resource_upvote'), 'resource', res.id
from public.resource_votes rv
join public.resources res on res.id = rv.resource_id
where rv.user_id <> res.user_id
on conflict do nothing;

insert into public.point_events (user_id, actor_id, pursuit_id, kind, points, subject_type, subject_id)
select sc.user_id, null, sc.pursuit_id, 'stage_completed', public.points_for('stage_completed'), 'stage', sc.stage_id
from public.stage_completions sc
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Badges, from the stages actually finished
-- ---------------------------------------------------------------------------

insert into public.user_badges (user_id, badge_slug, pursuit_id, stage_id, label, earned_at)
select sc.user_id, 'stage', sc.pursuit_id, sc.stage_id, s.name, sc.completed_at
from public.stage_completions sc
join public.stages s on s.id = sc.stage_id
on conflict do nothing;

insert into public.user_badges (user_id, badge_slug, label)
select distinct user_id, 'first-steps', ''
from public.stage_completions
on conflict do nothing;

insert into public.user_badges (user_id, badge_slug, label)
select distinct user_id, 'contributor', '' from public.resources where user_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- A quiz and two tools, so the Practice tab is not empty
-- ---------------------------------------------------------------------------

insert into public.quizzes (id, pursuit_id, user_id, stage_id, title, description) values
('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201',
 '11111111-1111-1111-1111-111111111107',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 2),
 'Do you actually know how to validate?',
 'Five questions on customer interviews. Most people get the second one wrong.')
on conflict (id) do nothing;

insert into public.quiz_questions (quiz_id, position, prompt, options, correct_index, explanation) values
('33333333-3333-3333-3333-333333333301', 1,
 'What is the first thing you should ask in a customer interview?',
 array['What do you think of my idea?', 'How do you handle this problem today?', 'Would you pay for this?', 'What features would you want?'],
 1, 'Ask about their present, not your future. Anything hypothetical gets you a polite answer.'),
('33333333-3333-3333-3333-333333333301', 2,
 'Nine of twelve people say they would use your product. What have you learned?',
 array['You have validated the idea', 'You have learned almost nothing', 'You should build immediately', 'You have found your market'],
 1, '"Would use" costs nothing to say. Look for something that costs them: money, time, or an introduction.'),
('33333333-3333-3333-3333-333333333301', 3,
 'Someone already solves this with a spreadsheet. What does that mean?',
 array['The problem is not real', 'They will never pay for software', 'The problem is real, and your bar is now the spreadsheet', 'You should build a spreadsheet'],
 2, 'A workaround is proof of pain. It also tells you exactly what you have to beat.'),
('33333333-3333-3333-3333-333333333301', 4,
 'What is the strongest signal short of payment?',
 array['A like on your launch post', 'They give you two hours to set it up with them', 'They join your mailing list', 'They say it is a great idea'],
 1, 'Time is the currency people spend before money. An hour of their calendar is real.'),
('33333333-3333-3333-3333-333333333301', 5,
 'You describe the problem as "reporting takes too long". Customers say "I do not trust the numbers". What do you do?',
 array['Keep your wording, it is clearer', 'Use their wording everywhere', 'Average the two', 'Ask them to be more specific'],
 1, 'Their words are the ones that will make a stranger stop scrolling. Yours only make sense to you.')
on conflict do nothing;

insert into public.tools (id, pursuit_id, user_id, stage_id, kind, title, description, config) values
('44444444-4444-4444-4444-444444444401', '22222222-2222-2222-2222-222222222201',
 '11111111-1111-1111-1111-111111111105', null, 'calculator',
 'How long your runway lasts',
 'Money in the bank divided by what you spend each month. The number most founders avoid working out.',
 '{"inputs":[{"key":"savings","label":"Money in the bank"},{"key":"burn","label":"Monthly spend"}],"formula":"savings / burn","unit":"months"}'::jsonb),
('44444444-4444-4444-4444-444444444402', '22222222-2222-2222-2222-222222222201',
 '11111111-1111-1111-1111-111111111102',
 public.seed_stage('22222222-2222-2222-2222-222222222201', 4), 'checklist',
 'Before you open the beta',
 'What has to be true before you let real people in. Learned by getting each one wrong.',
 '{"items":["Ten customer interviews done and written up","Someone outside your head has used it start to finish","Payment tested with a real card","You can answer a support email within a day","You know which single number tells you it is working","There is a way for people to tell you it is broken"]}'::jsonb)
on conflict (id) do nothing;

drop function public.seed_stage(uuid, integer);
drop function public.seed_person(uuid, text, text, text, text, text, text, text[]);
