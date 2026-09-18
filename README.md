# Pad

A note-taking app for people who take notes for a living.

Open it and you are looking at your notes. Write one and it is saved on your
device before you have finished the sentence. Find one by searching for a word
that is inside it, not by remembering what you called it — because nobody
remembers what they called it.

Notes are set in a serif on white paper and the app around them is not, so what
you wrote never reads like a field in a form.

## Two screens

**Your notes.** One column, newest first, grouped under the day they were
written — Today, Yesterday, then the weekday, then the date. Each row has a
small green tile saying what the note is about, its name, the first two lines of
it and the time it was last written in. Swipe a row to the left to delete it, or
press the bin on it. Across the top — and staying there as you scroll — the
name of the screen, a search field that reads inside every note, and two tabs:
**Notes** and **Favourites**. At the bottom, a bar to write a note, and a black
button to record one.

Long lists stay quick: ten notes are rendered at a time and the next ten arrive
as you reach them.

**A note.** The way back, a word saying it is saved, and a **⋯**. Under the bar,
in green: what kind of note this is — Meeting, Task, Idea, Person, Research or
Note — and when it was last written in. Then its name, then your writing.

There is nothing else. No sidebar, no library, no folder tree, no formatting
toolbar, no ribbon of controls across the top of the page you came to write on.

## Writing

**Write a note** opens a box that sits above the keyboard on a phone and stays
there. Type into it however you like — shorthand, three words, no punctuation —
and press Save. A list carries on as you write it: Return after "- milk" starts
another bullet, Return after "1. first" starts "2.", and Return on an empty one
ends the list. What happens next:

- It is **named for you**, from the writing. You are never made to fill in a
  title before you are allowed to write, and the name is an ordinary field you
  can correct.
- With a key configured, the model **writes it up**: full sentences in your own
  vocabulary, headings only where there is genuinely more than one subject,
  lists as lists, and anything you plainly have to do as a box to tick. It is
  told, at the top of its instructions, that every fact, name, number and date
  it returns must already be in what you typed.
- Without a key, or if the request fails, the note is saved **exactly as you
  typed it** with a name taken from its first line. A refusal, a dead network
  or a busy server costs the tidying and never the note.

Tap a note to open it and write properly. **Lines finish themselves** as you
leave them:

| You type | You get |
| --- | --- |
| `- milk` | a bullet, dash gone |
| `1. Book the venue` | a numbered item |
| `[] ring the bank`, `- [ ] ring the bank` | a box to tick — `[x]` for one already done |
| `TODO: chase the invoice` | a box to tick too |
| `# Title`, `## Section` | a heading |
| `> as they put it` | a quote |
| `---` | a line across the page |
| `the **whole** point` | **the whole point** |
| `a *slanted* word` | *a slanted word* |
| `NEXT STEPS` | a heading |
| `Next steps:` | **Next steps:** — a bold lead-in, and Return starts a list |

Two things make this worth having rather than annoying. It happens when you
**leave** the line, never while you are typing it — `#` is a character people
write and a dash halfway through a thought is a dash. And **not a word is ever
changed**: the markers come off because they were notation, emphasis is painted
rather than retyped, and nothing is invented, reordered or reworded. Every one
of these is one `Ctrl+Z` away.

None of it involves a model. They are string comparisons: instant, free,
offline, and the same every time.

**Formatting appears when you select something.** Highlight any words and a
small bar comes up over them: bold, italic, underline, strikethrough, inline
code, and the kind of line it is — heading, smaller heading, bulleted list,
numbered list, box to tick, quote. There is no permanent toolbar anywhere in the
app, and `Ctrl+B`, `Ctrl+I`, `Ctrl+U` and `Ctrl+E` still work.

Return in a list carries the list on, and Return on an empty item leaves it.
Backspace at the start of a bullet, a box, a heading or a quote takes that off
and leaves the words. Tab indents, Shift+Tab brings it back. `Ctrl+A` takes the
whole note and a selection runs straight across paragraphs, because the page is
one editable element and the browser is doing it rather than the app imitating
it.

**Undo and redo** are `Ctrl+Z` and `Ctrl+Shift+Z` (`Ctrl+Y` also redoes) and
work over the whole note, so they take back a paragraph you split, a line you
converted or a dictation that went in — none of which a browser's own undo knows
anything about.

## Talking

The black round button in the bottom right. Tap it once and it starts listening
— a red dot, a clock, and the words appearing as you say them, so you can see it
is hearing you. Tap it again and what you said is written down: into the note if
one is open, as a new note if you are on the list.

It handles a sentence and it handles a meeting. Speak a paragraph and it comes
out punctuated, in your own words, with the "um"s and false starts gone. Leave it
running through a forty-minute conversation and it comes out as notes: short
headings for what was actually discussed, bullets under them, and an **Actions**
list at the end with anything anybody committed to — with the day kept in the
words it was said in.

The listening is done by your browser, which already has a speech recogniser
built in. That means it is free, it starts instantly, and the words appear as you
speak rather than after an upload. It works in Chrome, Edge, Safari and Chrome on
Android; in a browser without one the button simply is not there. A pause does
not end the recording — browsers stop listening after a silence, and this starts
them again and keeps everything already heard, which is what makes a long meeting
survive.

Nothing is written down until you stop, so a correction the recogniser makes half
a sentence later does not rewrite the page under your caret. One `Ctrl+Z` takes
the whole thing back out.

## Finding

The field across the top of your notes, or `Ctrl+K`. It reads inside every note
rather than filtering their names, and it says what it found — *4 notes · 6
mentions* — with the words you searched for marked in yellow in the name and in
the passage it found them in.

Ask a question rather than typing a word — "what did I decide about the printing
quote" — and it answers from your notes, with the note each claim came from
attached. The retrieval happens on your device: the index picks the notes and
only the matching passages are sent, so your collection never leaves the machine
and the cost of a question does not grow with how much you have written.

## Keeping

Everything is saved on your device as you type. The bar says so.

**Favourites** are a tab of their own: the handful you keep coming back to. The
star is on every row, and in a note's **⋯**.

**The ⋯** on a note holds everything else: favourite it, share a read-only link,
save as PDF, download as Markdown or as Word, and delete.

**Deleting is undoable.** A deleted note goes to the trash at the foot of your
notes and stays for 7 days, with each row saying how long it has left. You can
put it back, or delete it for good straight away — that one asks first, because
it means it.

**Signing in is optional** and lives at the top right of your notes. It adds a
copy on the server so your other devices catch up. Nothing waits for it, and
signing out leaves every note where it was.

## Installing it as an app

Open the site in a browser and choose **Install** (Chrome and Edge put it in the
address bar; on an iPhone it is Share → Add to Home Screen). It then opens from
your dock or home screen in its own window, with no address bar, and starts with
no internet connection at all.

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

## Turning on the model (optional)

Three things use it, and nothing else: writing up a note from the box, writing
up what you dictate, and answering a question about your notes. All three work
without it — more roughly, on your device. It is **GPT-4o**. Get a key from
[platform.openai.com](https://platform.openai.com/api-keys), then put it in
`.env.local`:

```
OPENAI_API_KEY=sk-...
```

If you already had `ANTHROPIC_API_KEY` set from before, it still works — it is
read only when `OPENAI_API_KEY` is empty.

The key stays on the server and is never sent to the browser — that is why this
is the one feature with a server route behind it. Requests are limited to 20 a
minute per address, which is enough to stop a stuck loop but is not a substitute
for a proper limiter if you put this somewhere public.

## Turning on sign-in and sync (optional)

Without this, Pad still works completely — it just keeps everything on the one
device, and the corner shows "On this device" instead of a sign-in button.

Create a project at [supabase.com](https://supabase.com), run the migrations in
`supabase/migrations/` in its SQL editor, and put the project URL and anon key in
`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Row-level security is on and the policies only ever let somebody read and write
their own notes. That is enforced by the database, not by the app.

## How it is built

- **Next.js 16, React 19, TypeScript, Tailwind v4.** No editor library, no
  rich-text framework, no state library, no web fonts.
- **IndexedDB is the store, not a cache.** Nothing waits for the network, and
  nothing in the writing surface reports a network failure.
- **The writing surface is one `contenteditable` per run of paragraphs**, so
  Return, selection, copy and `Ctrl+A` are the browser's own behaviour rather
  than three hundred lines imitating it.
- **The sign-in client is a dynamic import**, so the ~100KB it costs stays out
  of the first download for everyone who never signs in.

### The one rule

A note is a list of blocks, and a block is a line of writing: a paragraph, a
heading, a bullet, a box to tick, a quote or a rule across the page. There used
to be a spreadsheet, a code editor, a form builder and file attachments in there
too. They were good and they were the wrong app: somebody taking notes wants to
write.

### Where things live

```
src/lib/types.ts        what a note and a block are
src/lib/blocks.ts       making blocks, and the markdown shortcuts
src/lib/beautify.ts     what a line was trying to be, with no model in it
src/lib/plain-doc.ts    the page read back into blocks
src/lib/compose.ts      a typed note in, a named and tidied note out
src/lib/kind.ts         what kind of note it is, from its own words
src/lib/doc-icon.ts     which picture a note gets, and why
src/lib/search.ts       the BM25 index over everything
src/lib/ask.ts          retrieval on the device, and citations
src/lib/dictation.ts    speech into paragraphs, and cutting it up to send
src/lib/rich-text.ts    inline formatting, and the HTML sanitiser
src/lib/store.ts        saving to the device (IndexedDB)
src/lib/sync.ts         optional sync to Supabase
src/lib/history.ts      undo and redo, over whole notes
src/lib/trash.ts        the seven-day retention rules
src/lib/share.ts        publishing a read-only copy to a link
src/lib/export.ts       turning a note into markdown or plain text
src/lib/docx.ts         Word files out, built on zip.ts
src/lib/when.ts         "3 minutes ago", and the stamp a list prints
src/app/api/ai/         the one server route: compose, speech, questions
src/components/         the notes screen, the note, and the box
src/app/s/[id]/         the public page a shared link opens
supabase/migrations/    the database tables and their security policies
scripts/e2e.mjs         drives a real browser through every feature
```

## Checking it works

```bash
npm test        # the beautifier, compose, search, transcripts, the page
npm run lint
npm run typecheck

npm run build && npm start &
npm run e2e     # drives a real browser through every feature
```

`npm run e2e` is the one that matters most: it opens a browser, writes a note
through the box, types into it, reloads, searches, deletes, restores, records
something and confirms the work is still there. It writes screenshots to
`e2e-shots/` so you can see what it saw.

## Known limits

These are real and worth knowing before you rely on them:

- **Sync resolves conflicts per note, last edit wins.** Two devices editing the
  *same* note while both offline will keep the later one. Different notes on
  different devices merge fine. Doing better needs real collaborative-editing
  machinery, which is a large piece of work.
- **The model was not tested against the real service.** There is no API key in
  this repository, so every failure path is tested and the interface around it
  is tested against a stubbed route, but a real write-up from a real model is
  not. Try it once before relying on it.
- **Writing up a note is a model call**, and so is stopping a recording, and so
  is asking a question. Nothing else in the app costs anything: the names, the
  pictures, the kinds, the search and the line rules are all worked out on your
  device.
- **The line rules are rules, not understanding.** They read notation and two
  narrow shapes, so a line that meant to be a list and did not say so stays a
  paragraph. That is deliberate: a guess that is right nine times in ten is a
  guess that is wrong in your note, and undoing a surprise costs more than
  typing "- ".
- **Dictation is as accurate as your browser's recogniser.** That is very good
  in Chrome and good in Safari, and it is not Whisper. Names and unusual words
  are where it slips; the model fixes the obvious mis-hearings and is told to
  leave the rest alone rather than guess.
- **Dictation needs Chrome, Edge, Safari or Chrome on Android.** Firefox has no
  speech recogniser, so the button is not shown there rather than shown and
  broken.
- **A long recording is sent to the model in pieces**, because an hour of speech
  is tens of thousands of characters and one request for all of it times out.
  The pieces are cut on sentence ends and joined back up; a very long meeting
  can therefore repeat a heading at a seam.
- **Notes written before this version keep their words, not their shape.** A
  note that contained a spreadsheet, a code block, a form or an attachment
  still loads, and each of those becomes a paragraph of whatever text it
  carried. Nothing is dropped; the grid is not a grid any more.
- **Sub-lists are an indent, not a nested list.** A block records how deep it
  is; the note stays a flat run of lines. Numbered lists do not renumber
  themselves per level yet.
- **The trash sweep runs when the app opens**, not on a schedule, because there
  is no server here to run a nightly job. A note that expired while the app was
  closed is removed the next time you open it.
- **A shared link is read-only and is a snapshot**, so editing a note does not
  silently change what somebody you shared it with is looking at. There is an
  **Update the shared copy** button for when you want it to.
- **Sharing has not been tested against a live database** in this repository,
  because there is no Supabase project wired up here. The code, the policies and
  every failure path are tested; the successful publish is not.
