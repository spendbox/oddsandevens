# Commons

**An intent network.** People connect around what they are trying to achieve,
not around who they already know.

You join a *pursuit* — an outcome like "Build a Profitable SaaS Company" or
"Move to Canada" — and Commons puts you next to the people who want the same
thing: the ones a step ahead who can pull you forward, the ones a step behind
you can help, and the ones whose skills answer the thing you just asked for.

---

## The one rule this product lives or dies by

**A pursuit is not a group chat.** If it becomes another WhatsApp group, the
magic is gone. So a pursuit is a shared workspace with six surfaces, and chat is
deliberately the smallest of them:

| | Surface | What it is for |
|---|---|---|
| 💬 | **Discussions** | Questions and hard-won answers. Posting asks *what kind* of thing this is — a question, an update, something you learned, a win — before it asks for words. That one choice is what makes the board a record instead of a feed. |
| 🚀 | **Progress** | Everyone placed on the same journey. `IDEA 1,240 · VALIDATING 842 · BUILDING 1,104`. One stage at a time — you finish one, then you are on the next. |
| 🤝 | **People** | Never a member list. Every person comes with the sentence explaining why they are worth your time. |
| 🙋 | **Help** | "I need…" and "I can help…" — a marketplace of needs and capabilities, matched to each other automatically. |
| 📚 | **Resources** | One knowledge base per outcome, so 8,000 people stop separately asking how to validate an idea. |
| 🧠 | **Practice** | Quizzes and small tools — checklists and calculators — built by members for the people coming after them. |
| 📅 | **Events** | Challenges, meetups, AMAs and working sessions — the things that make people actually finish. |

Direct messages exist, one-to-one, off to the side.

### Finishing a stage costs you a paragraph

There is no percentage slider. A stage is either behind you or ahead of you, and
to put one behind you, you answer two questions in public:

> **What did you actually do?**
> **What was hard, and how did you get past it?**

That answer is posted into the discussion, where people can reply to it and mark
it useful. Then you move to the next stage and earn a badge for the one you
finished. Everyone still standing on that stage is told that somebody who just
came through it is now one step ahead of them.

People ahead pull people behind. People behind ask better questions. And every
person who gets somewhere leaves the account of how behind them.

### Points, and why you cannot see anyone else's

You earn points when **other people** find you worth their time:

| | |
|---|---|
| Someone you connected with accepts | **+5** (and +1 to whoever asked) |
| Your post or your reply marked useful | **+2** |
| A resource you shared gets upvoted | **+3** |
| You finish a stage | **+10** |
| Someone takes a quiz you wrote | **+2** |
| Someone uses a tool you built | **+2** |

You cannot award them to yourself, and the database refuses any points row whose
value disagrees with the table above — so a forged client cannot mint standing.

**Adding to a pursuit's knowledge base needs 20 points in that pursuit, or 100
across Commons.** Newcomers read the knowledge base before they write to it.
Quizzes and tools are deliberately *not* gated: building something useful is how
a new member earns their way in.

Points are **never shown inside a pursuit** — not beside a post, not on the
progress board, not in a member list. A visible score next to what somebody wrote
changes how it gets read, and a pursuit only works if people answer each other as
equals. They appear in exactly two places: on a profile, where you went looking
for them, and on a *people you should meet* card, where they are part of the case
for spending your time on that person.

## Starting a pursuit

You do not fill in a form. You type a sentence — *"I want to learn AI automation
this year"* — and Commons does three things:

1. **Reduces it to what it is about.** "learn", "ai", "automation" — the filler
   goes.
2. **Shows you what already exists**, ranked, before you create anything. A
   pursuit split across four near-identical copies helps nobody.
3. **Proposes the journey.** Only if none of them fit. It recognises the shape of
   what you asked for — learning a skill, building a business, relocating,
   getting fit, money, creative work, a habit, a career move — and suggests the
   stages people pass through, with the reason it picked them. You rename,
   reorder, and delete freely; editing a suggestion is a far easier job than
   inventing one from an empty box.

The matching lives in [`src/lib/stage-suggestions.ts`](src/lib/stage-suggestions.ts)
and is keyword-driven on purpose: you can read exactly why a journey was
proposed, and a language model can be dropped in behind the same function later
without anything around it changing.

## How the matching works

Every suggestion carries its reason, in plain language:

- *"Offers help with b2b — which you asked for"*
- *"Two stages ahead of you — already at Profitable"*
- *"Behind you, at Validating — you have done this part"*
- *"Needs Postgres and APIs — which you have"*

The scoring lives in [`src/lib/matching.ts`](src/lib/matching.ts). It is
deterministic and explainable on purpose: it works from what people wrote about
themselves — their skills, their stage, the needs and offers they posted — so
every introduction can be traced back to something a real person actually said.
There is no opaque score and no unexplained "92% match".

---

## Running it

You need a free [Supabase](https://supabase.com) account. Nothing else.

### 1. Create the database

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor** and run these files in order, one at a time:
   - `supabase/migrations/0001_init.sql` — the tables
   - `supabase/migrations/0002_policies.sql` — security rules and counters
   - `supabase/migrations/0003_grants.sql` — API permissions
3. Optional but recommended for a first look: run `supabase/seed.sql`. It fills
   the app with six pursuits and twelve people so nothing is empty. Every demo
   account signs in with the password `commons123` (for example
   `tunde@commons.demo`). **Do not run the seed on a real project.**

### 2. Connect the app

In Supabase go to **Project Settings → API** and copy the two values into a file
called `.env.local` in this folder:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both are safe to expose in a browser — row level security is what protects the
data, not the key.

**Turn off email confirmation.** This one is not optional — without it nobody can
sign in. In Supabase go to **Authentication → Sign In / Providers → Email**,
untick **Confirm email**, and save. New accounts then work immediately, with no
email involved anywhere.

### 3. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### 4. Deploy

Push to GitHub, then import the repository at
[vercel.com/new](https://vercel.com/new). Add the same two environment variables
in Vercel's project settings and deploy. Nothing else to configure.

---

## Notes for whoever works on this next

- **Next.js 16.** `src/proxy.ts` is what used to be called middleware; `cookies()`,
  `params` and `searchParams` are all async. See `AGENTS.md`.
- **Every table has row level security.** A new table without policies is a bug.
  The policies are verified by hand against a real Postgres: a non-member cannot
  post into a pursuit, nobody can write as someone else, and signed-out requests
  reach nothing.
- **Data fetching** happens in Server Components through `src/lib/queries.ts`.
  Mutations are Server Actions in `actions.ts` files beside each route.
- **Embedded joins need their foreign key named** wherever two tables are related
  more than one way — `author:profiles!posts_author_id_fkey(*)`. Without it
  PostgREST cannot tell which relationship you mean and the query fails at
  runtime rather than at build time.
- **Progressive web app.** Installable, with a manifest, icons, and a service
  worker that keeps it from dying on a dropped connection.

## Structure

```
src/
  app/
    (app)/            signed-in application
      home/           your pursuits, people to meet, what is coming up
      discover/       search for an outcome
      pursuits/       your pursuits, and creating one
      p/[slug]/       a pursuit workspace — the six surfaces
      people/         connection requests and your connections
      messages/       one-to-one conversations
      u/[handle]/     someone else's profile
    login/            sign in and sign up
    onboarding/       first-run profile setup
  components/         shared interface pieces
  lib/
    matching.ts       who you should meet, and why
    queries.ts        every read the app makes
    supabase/         server and browser clients
  proxy.ts            session refresh and route protection
supabase/
  migrations/         the database, in order
  seed.sql            demo data
```
