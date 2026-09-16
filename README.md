# Pad

One place to write, plan, calculate and build. Open it and start typing.

Notes, spreadsheets, tasks, code and forms are not five apps here. They are
five kinds of block inside one document, so a meeting note can carry its own
budget, its own list of actions and the form you are about to send out —
without leaving the page or picking a file type first.

It types like a word processor, not like a stack of components. There is a
toolbar above the page, the page is a sheet of paper, and Enter, Tab, Ctrl+B
and Alt+Up do what they have done in every editor for thirty years. The block
model is underneath, where it belongs.

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
| File | Attach anything, download it back | `/file`, or drop a file in |
| Bullet, divider | List item, horizontal line | `-` + space, or `---` |

Type `/` anywhere to see all of them, or use **Insert** in the toolbar.

**The toolbar.** Along the top of the page, always visible, always in the same
order: the paragraph style (Normal text, Heading 1–3, lists, task, quote), bold,
italic, underline, strikethrough and inline code, lists, indent, alignment, the
size of the type, and Insert. There are no handles in the margin that appear
when you hover a paragraph — the controls are in one place you can learn, which
is the point of a toolbar.

**Formatting.** Select any text and a small bar appears over it as well: bold,
italic, underline, strikethrough, inline code. Or use `Ctrl+B`, `Ctrl+I`,
`Ctrl+U`, `Ctrl+E`. Typing `**bold**`, `*italic*` or `` `code` `` formats it
the moment you close the span, and the markers disappear.

**Alignment** is left, centred, right or justified, per paragraph, from the
toolbar. It belongs to the paragraph, so pressing Enter carries it to the next
one.

**The size of the type** is the two **A**s in the toolbar. It moves the whole
typographic scale — headings, lists, the title — not just the paragraphs, and
it is remembered.

**Typing does the obvious things for you.** The first letter of a line, and
the first after a full stop, are capitalised — but not after "e.g.", "Dr." or
a decimal point. A line ending in a colon starts a bullet list when you press
Enter. The opening line of a new document becomes its heading. Every one of
these is undone by a single Backspace, and none of them happens twice.

**Tab makes sub-lists.** Tab indents the line you are on instead of jumping
away; Shift+Tab brings it back out, and so does Backspace at the start of an
indented line. Bullets change shape as they nest, the way a word processor
does. Press Escape first if you actually want Tab to move focus onward.

**Pasting keeps its shape.** Paragraphs stay separate paragraphs, headings
stay headings, lists stay lists, and nesting survives — from a web page, a
document, or plain text with `-` bullets in it. Inline bold and italic come
through; scripts, links and styling do not. `Ctrl+Shift+V` pastes as plain
text instead.

**Moving things.** Hold `Alt` and press the up and down arrows to move the
paragraph you are in. `Ctrl+A` selects the paragraph, and again selects the
whole document; holding `Shift` with the up and down arrows extends a selection
across paragraphs.

**The sidebar** holds four things and nothing else: **New**, **Search**, the
**Library**, and three short lists — what else is in this document's folder,
what you have starred, and what you had open recently. Everything that used to
be here as well is still in the app, one press away, on the home screen or in
the Library.

**The home screen** is the grid button in the header, or the Pad mark at the
top of the sidebar. It fills the window and shows the document you are writing,
large, with its opening lines; the others in its folder; your favourites; and
what was open recently. It is not what the app opens into — opening straight
into a document with the caret already in it matters more.

**Favourites.** The star on a row in the sidebar, or on a card on the home
screen. Starred documents get their own section in both.

**Folders.** The **⋯** menu on any row in the sidebar: **New folder…** makes
one named after that document, and the folders you already have are listed
above it to move a document into. Once a document is in a folder, a bar appears
above it listing the others, so you can move between them without opening the
sidebar. The magnifying glass in that bar (or `Ctrl+P`) searches **within that
folder only**. A folder left with one document dissolves by itself.

**The Library** is both the way documents come in and the one place all of them
are listed. Drop a pile of files in and each one is read, titled from its
contents rather than its filename, and given a sentence saying what it covers;
nothing is added until you have seen it. Underneath, every document you have is
listed and searchable — the app's own search, over contents as well as names.

**Writing help.** Press `Ctrl+J`, or type `++`, or press **Ask** in the
toolbar. A small box opens next to the line you are writing. Type what you want
— "expand this", "make it less annoyed", "turn this into an email to the
landlord" — or press one of Expand, Continue writing, Tidy up, Bullet points,
Shorten, Summarise. It can work on what you have selected, on the paragraph you
are in, or on the whole document, and it says which. **It never changes
anything on its own** — you read the result and choose Insert below, Replace,
Again, or Discard. Needs an API key (see below); without one it is simply
absent.

**Tasks it notices.** Write "I need to call the landlord by Friday" in the
middle of a meeting note and a strip appears above the page offering to make it
a task. Every line is shown with a tick beside it and confirmed one at a time;
a date found in the line is kept in your own words, ready for a calendar. This
runs on your device with no key and no network. Sending tasks to Google
Calendar is not connected yet, and the app says so rather than implying it.

**Deleting is undoable.** A deleted document goes to the trash on the home
screen and stays there for 7 days, with each row saying how long it has left.
You can put it back, or delete it for good straight away — that one asks first,
because it means it.

**Getting out of the way.** `Ctrl+\` collapses the sidebar. The page is a
reading measure by default, because a line that runs the width of a large
monitor is genuinely harder to read; there is a **Wide** toggle at the foot of
the sidebar for anyone who disagrees.

The spreadsheet understands `=SUM(A1:A5)`, `=AVERAGE(...)`, `=IF(A1>50,
"big", "small")`, `=ROUND(x, 2)`, cell references, ranges, `&` to join text,
and comparisons. A cell shows its result when you are not in it and its
formula when you are. A formula that refers to itself says `#CYCLE` instead
of freezing the page.

## Getting things in and out

The **⋯** button, top right:

- **Save as PDF** — opens your browser's print window; choose *Save as PDF* as
  the destination. This costs no download at all, because your browser already
  has a typesetter that handles page breaks and fonts properly.
- **Download Markdown** — opens in any editor, and keeps the structure. This is
  the one to use if you ever want to leave; a document you can only read inside
  one app is not really yours.
- **Download plain text** — for when markdown would just be noise.
- **Download as Word** — a real .docx that opens in Word, Pages or Google Docs.
- **Import a Word document** — opens a .docx so you can edit it.
- **Import a PDF as text** — pulls the words out of a PDF so you can edit them.
  A scanned PDF (a photograph of a page) has no text to pull out; that would
  need character recognition, which is a much larger thing again.
- **Share a link** — publishes a read-only copy at a public address. Needs an
  account (see below). The link shows a snapshot, so editing the document does
  not silently change what someone you shared it with is looking at; there is
  an **Update the shared copy** button for when you want it to.

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

## Turning on writing help (optional)

Writing help uses Claude. Get a key from
[console.anthropic.com](https://console.anthropic.com), then put it in
`.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The key stays on the server and is never sent to the browser — that is why
this is the one feature with a server route behind it. Requests are limited to
20 a minute per address, which is enough to stop a stuck loop but is not a
substitute for a proper limiter if you put this somewhere public.

## Turning on sign-in and sync (optional)

Without this, Pad still works completely — it just keeps everything on the one
device, and the corner shows "On this device" instead of a sign-in button.

1. Make a free project at [supabase.com](https://supabase.com).
2. In its SQL editor, paste and run the files in `supabase/migrations/` in
   order: `0001_docs.sql`, then `0002_shared_docs.sql` (which makes **Share a
   link** work), then `0003_projects.sql` (which syncs projects between
   devices).
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
- No web fonts, no editor library, no syntax-highlighting library, no PDF
  writer. Those are the things that usually make an app like this heavy, and
  each is replaceable with a few hundred lines — or, for PDF export, with the
  browser's own print pipeline and no JavaScript at all.
- The two genuinely large dependencies are loaded only when they are used:
  the sign-in client the first time somebody signs in, and the PDF reader the
  first time somebody imports a PDF. Neither is in the first download.

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
src/lib/rich-text.ts    inline formatting, and the HTML sanitiser
src/lib/slash-items.ts  what "/" offers, and how a query is ranked
src/lib/store.ts        saving to the device (IndexedDB), documents and files
src/lib/sync.ts         optional sync to Supabase
src/lib/projects.ts     grouping documents, and searching within a group
src/lib/tasks.ts        finding the things somebody has agreed to do
src/lib/smart-typing.ts capitalisation, list and formatting rules
src/lib/paste.ts        turning pasted content into blocks
src/lib/trash.ts        the seven-day retention rules
src/lib/share.ts        publishing a read-only copy to a link
src/lib/export.ts       turning a document into markdown or plain text
src/lib/pdf.ts          reading text out of a PDF (loaded on demand)
src/lib/zip.ts          reading and writing ZIP archives, with no dependency
src/lib/docx.ts         Word documents in and out, built on zip.ts
src/app/api/ai/         the one server route: writing help
src/lib/ui-prefs.ts     theme, sidebar, width and text size, before first paint
src/components/         the editor, the toolbar, and one file per block type
src/app/s/[id]/         the public page a shared link opens
supabase/migrations/    the database tables and their security policies
scripts/make-icons.py   regenerates the app icons from src/app/icon.svg
scripts/e2e.mjs         drives a real browser through every feature
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

- **Attachments stay on the device that added them.** The file's bytes live in
  that browser, not in the document, which is what keeps documents small enough
  to sync on every keystroke. Syncing attachments needs file storage on the
  server — a separate piece of work. The screen says "on this device" so this
  is never a surprise.
- **Sync resolves conflicts per document, last edit wins.** Two devices editing
  the *same* document while both offline will keep the later one. Different
  documents on different devices merge fine. Doing better needs real
  collaborative-editing machinery, which is a large piece of work.
- **A shared link is read-only, and a shared form cannot be answered.**
  Collecting responses from other people needs the answers to go to the server
  rather than into the document, which is the next step for forms.
- **Writing help was not tested against the real service.** There is no API
  key in this repository, so every failure path is tested, and the interface
  around it is tested against a stubbed route, but the real rewrite is not.
  Try it once before relying on it.
- **Tasks do not reach a calendar yet.** The detection is real and runs on
  your device; what it makes is a task block in the document it found. Google
  Calendar is the next step and is not connected, which the screen says
  plainly rather than implying otherwise.
- **The detector is a set of rules, not a model.** It reads lines beginning
  with an action verb, lines saying you need to do something, and anything
  under a "next steps" heading. It will miss an oddly worded one and will
  occasionally offer a sentence that was not a task — which is why every
  suggestion is confirmed one at a time rather than applied.
- **A Word table becomes a list, not a spreadsheet, on import.** Merged cells
  and nested tables have nowhere to go in a grid. Going the other way, a
  spreadsheet becomes a real Word table.
- **Sub-lists are an indent, not a nested list.** A block records how deep it
  is; the document stays a flat run of blocks. That keeps dragging a line out
  of a sub-list the same operation as any other move, but it means numbered
  lists do not renumber themselves per level yet.
- **The trash sweep runs when the app opens**, not on a schedule, because
  there is no server here to run a nightly job. A document that expired while
  the app was closed is removed the next time you open it.
- **A project is a flat group, not a folder tree.** There are no projects
  inside projects, and a document belongs to one project or none. Nesting is a
  much larger change and, so far, not one anything has asked for.
- **A scanned PDF imports nothing.** If the PDF is a photograph of a page there
  is no text layer to read, and getting one needs OCR.
- **Sharing has not been tested against a live database** in this repository,
  because there is no Supabase project wired up here. The code, the policies
  and every failure path are tested; the successful publish is not.
