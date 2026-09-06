# Forge

**Describe a tool. Get a tool.**

Say what you want in a sentence — *"a calculator that works out import duty on a
car coming into Nigeria"* — and Forge builds it. You change whatever you like,
publish it, and you have a link. Share it, or charge for it.

---

## What it can build

You never choose from this list. Forge reads what you asked for and picks the
engine; you can overrule it.

| | Engine | What it makes | Example |
|---|---|---|---|
| 🧮 | **Calculator** | Someone enters numbers, the tool works something out | Import duty, loan repayments, profit margin |
| 📋 | **Quiz** | Questions in, a scored result out | Business health check, career assessment |
| 📄 | **Generator** | A form that produces a finished document | Invoice, business plan, proposal |
| 📊 | **Tracker** | Entries kept over time, with summaries | Daily expenses, medication, weight |
| 🗂 | **Directory** | A searchable list the creator curates | Scholarships, suppliers, vendors |
| ✨ | **AI assistant** | An expert that answers in the creator's domain | Tenancy law, exam coaching, CV help |

Adding a seventh means adding an engine — a schema, and how to run it — not
touching the rest of the app. See `src/lib/engines/`.

## How building works

Two calls to Claude, not one.

1. **What kind of thing is this?** A cheap, low-effort classification that also
   names the tool, picks an emoji and a colour, and says why it chose that
   engine.
2. **Build that kind of thing.** Against *that engine's* schema, passed to the
   API as a JSON schema through
   [structured outputs](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs).

Splitting them means each response is validated against one tight shape rather
than a union, and **the model cannot hand the app a shape it then has to defend
against.** Every spec is parsed again before it is saved, and again before it is
run.

## Editing

Two ways, and the first is the point:

- **Ask for a change.** *"Add an input for clearing agent fees and include it in
  the total."* Claude rebuilds the tool with that change and leaves the rest
  alone.
- **Edit it by hand.** Every field of every engine, in one editor generated from
  the shape of the spec itself — so a new engine gets an editor for free.

## Two things that are parsed, never evaluated

- **Formulas.** A creator writes `if(age > 10, value * 0.35, value * 0.20)` and
  it runs in every visitor's browser. `src/lib/expression.ts` implements a small
  language — arithmetic, comparisons, and `min`, `max`, `round`, `floor`,
  `ceil`, `abs`, `sqrt`, `if` — and refuses everything else. There is no `eval`
  and there must never be one.
- **Markdown.** Generated documents and assistant replies are rendered into
  React elements, not injected as HTML. No `dangerouslySetInnerHTML` anywhere.

## Money

Paid tools go through Paystack. Two rules hold it together:

- A purchase is marked paid **only after Paystack itself has been asked**, never
  because a browser came back from checkout.
- A buyer can only ever create a *pending* row, for the *correct amount*, on a
  *published* tool. Nothing they can reach flips it to paid — that is done
  server-side with the service role. (An earlier version let a buyer insert a row
  already marked paid. It was caught in testing; the policy in
  `0004_purchase_integrity.sql` is what closed it.)

When a creator sets their Paystack subaccount, the split happens at Paystack, so
their earnings never sit in a platform balance waiting to be paid out by hand.

---

## Running it

### 1. If you are coming from the old project

`supabase/teardown-old-commons.sql` removes everything the previous app created —
all 27 tables, its functions, its triggers and its demo accounts. Run it once in
the Supabase SQL Editor. It is safe to run twice and touches nothing else.

### 2. The database

In Supabase, open **SQL Editor** and run these in order, checking each reports
Success:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_policies.sql`
3. `supabase/migrations/0003_counters.sql`
4. `supabase/migrations/0004_purchase_integrity.sql`

They are safe to re-run. Then check:

```sql
select count(*) from information_schema.tables where table_schema = 'public';
```

You want **6**.

**Turn off email confirmation** — this one is not optional, or nobody can sign
in. **Authentication → Sign In / Providers → Email → untick "Confirm email"**.

### 3. Settings

Create `.env.local` (locally) or add these in Vercel under **Settings →
Environment Variables**:

| Variable | Needed for | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | everything | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | everything | same page, the **anon**/publishable key |
| `ANTHROPIC_API_KEY` | building tools, AI assistants | console.anthropic.com → API Keys |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | paid tools | Paystack → Settings → API Keys |
| `PAYSTACK_SECRET_KEY` | paid tools | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | paid tools | Supabase → Project Settings → API → **service_role** |

The last three are only needed once you want to charge for something. The bottom
two are secrets: server-side only, never with a `NEXT_PUBLIC_` prefix.

On Vercel these are read **when the site is built**, so redeploy after adding
them.

### 4. Run

```bash
npm install
npm run dev
```

Then <http://localhost:3000>. To deploy, push to GitHub and import the repo at
[vercel.com/new](https://vercel.com/new).

---

## Structure

```
src/
  app/
    page.tsx           the landing page
    signin/            sign in and sign up
    new/               describe a tool
    build/[id]/        the editor: preview, ask for a change, publish
    tools/             everything you have built
    t/[slug]/          the public tool — the link you share
    api/assistant/     streams an AI assistant's reply
  components/
    runners/           one per engine: what a tool looks like when used
    markdown.tsx       renders generated documents, safely
  lib/
    claude.ts          plan, build, revise, polish, converse
    engines/           the six engines and their schemas
    expression.ts      the formula language
    paystack.ts        checkout and verification
    supabase/          browser, server and service-role clients
  proxy.ts             session refresh and route protection
supabase/
  migrations/          the database, in order
  teardown-old-commons.sql
```
