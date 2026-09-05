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
| 🚀 | **Progress** | Everyone placed on the same journey. `IDEA 1,240 · VALIDATING 842 · BUILDING 1,104`. You can see who is ahead of you and reach them. |
| 🤝 | **People** | Never a member list. Every person comes with the sentence explaining why they are worth your time. |
| 🙋 | **Help** | "I need…" and "I can help…" — a marketplace of needs and capabilities, matched to each other automatically. |
| 📚 | **Resources** | One knowledge base per outcome, so 8,000 people stop separately asking how to validate an idea. |
| 📅 | **Events** | Challenges, meetups, AMAs and working sessions — the things that make people actually finish. |

Direct messages exist, one-to-one, off to the side.

### The mechanic that makes it self-reinforcing

When you move your progress marker forward, Commons tells the people still
standing where you just were. That single loop is the whole design:

> Tunde moves from *Beta* to *Launched* → the five members at *Idea*,
> *Validating* and *Building* are told that someone who came through their stage
> is now one step ahead.

People ahead pull people behind. People behind ask better questions. People with
complementary skills find each other. And every person who succeeds leaves
knowledge behind for the next one.

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

In **Authentication → Providers → Email**, turn *Confirm email* off while you are
testing, so new accounts can sign in immediately.

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
