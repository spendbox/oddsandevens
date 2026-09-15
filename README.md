# Pad

One place to write, plan, calculate and build. Open it and start typing.

Notes, spreadsheets, tasks, code and forms are not five apps here. They are
five kinds of block inside one document, so a meeting note can carry its own
budget, its own list of actions and the form you are about to send out —
without leaving the page or picking a file type first.

Everything is saved on your device as you type. Signing in is optional and
lives in one small button in the top right corner; it adds a copy on the
server so your other devices catch up. Nothing waits for it.

## What it does

| Block | What it is | How to get one |
| --- | --- | --- |
| Text, headings, quotes | Ordinary writing | Just type, or `#` + space for a heading |
| Task | A checkbox you can tick | `[]` + space, or `/task` |
| Spreadsheet | A grid with real formulas | `/sheet` |
| Code | Syntax highlighted, in 12 languages | `/code` |
| Form | Questions, answers and responses | `/form` |
| Bullet, divider | List item, horizontal line | `-` + space, or `---` |

Type `/` anywhere to see all of them.

The spreadsheet understands `=SUM(A1:A5)`, `=AVERAGE(...)`, `=IF(A1>50,
"big", "small")`, `=ROUND(x, 2)`, cell references, ranges, `&` to join text,
and comparisons. A cell shows its result when you are not in it and its
formula when you are. A formula that refers to itself says `#CYCLE` instead
of freezing the page.

## Installing it as an app

Open the site in a browser and choose **Install** (Chrome and Edge put it in
the address bar; on an iPhone it is Share → Add to Home Screen). It then opens
from your dock or home screen in its own window, with no address bar, and
starts with no internet connection at all.

## Running it yourself

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. That is the whole setup — no database, no
accounts, no keys. Everything works.

To put it online, deploy to [Vercel](https://vercel.com); it needs no
configuration beyond pointing it at this repository.

## Turning on sign-in and sync (optional)

Without this, Pad still works completely — it just keeps everything on the one
device, and the corner shows "On this device" instead of a sign-in button.

1. Make a free project at [supabase.com](https://supabase.com).
2. In its SQL editor, paste and run `supabase/migrations/0001_docs.sql`.
3. Copy `.env.example` to `.env.local` and fill in the two values from
   Supabase's Settings → API page:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Restart the app. A **Sign in** button appears in the top right.

The migration sets up row level security so each person can only ever read and
write their own documents. That is enforced by the database, not by the app.

## How it is built

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**, configured in `src/app/globals.css` — there is no
  `tailwind.config` file in v4
- **IndexedDB** for local storage, **Supabase** for optional accounts and sync
- No web fonts, no editor library, no syntax-highlighting library. Those are
  the three things that usually make an app like this heavy, and all three are
  replaceable with a few hundred lines that do only what is needed here.

### The one rule

A document is a list of blocks, and every tool is a block type. Adding a sixth
tool means adding a block type — not a second application, a second save path
or a second toolbar. If a change would need its own mode to switch into, it is
probably the wrong shape for this app.

### Where things live

```
src/lib/types.ts        what a document and a block are
src/lib/blocks.ts       making blocks, and the markdown shortcuts
src/lib/formula.ts      the spreadsheet engine
src/lib/highlight.ts    the syntax highlighter
src/lib/slash-items.ts  what "/" offers, and how a query is ranked
src/lib/store.ts        saving to the device (IndexedDB)
src/lib/sync.ts         optional sync to Supabase
src/components/         the editor and one file per block type
supabase/migrations/    the database table and its security policies
scripts/make-icons.py   regenerates the app icons from src/app/icon.svg
```

## Checking it works

```bash
npm test        # the formula engine, highlighter and slash ranking
npm run lint
npm run typecheck

npm run build && npm start &
npm run e2e     # drives a real browser through every feature
```

`npm run e2e` is the one that matters most: it opens a browser, types into the
page, builds a spreadsheet, checks the formula, fills in a form, reloads, and
confirms the work is still there. It writes screenshots to `e2e-shots/` so you
can see what it saw.

## Known limits

These are real and worth knowing before you rely on them:

- **No bold or italic inside a paragraph yet.** Text blocks store plain text.
  This keeps the caret behaviour correct and the app small, but it is the most
  obvious missing thing and the first thing to add.
- **Sync resolves conflicts per document, last edit wins.** Two devices editing
  the *same* document while both offline will keep the later one. Different
  documents on different devices merge fine. Doing better needs real
  collaborative-editing machinery, which is a large piece of work.
- **Blocks cannot be dragged to reorder** yet. The handle is drawn but not
  wired up.
- **A form's responses live in the document**, so sharing a form to collect
  answers from other people is not possible yet — that needs a public link and
  a server-side table.
