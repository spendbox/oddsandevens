# Pad

A universal document editor. Notes, spreadsheets, tasks, code and forms are
five block types inside one document, not five applications.

Read `README.md` before changing anything structural.

> Running `next dev` prepends a Next.js version block to this file. Commit it
> along with your work rather than deleting it — removing it only recreates an
> uncommitted change on the next dev run.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS v4, configured in `src/app/globals.css` (there is no
  `tailwind.config` file in v4)
- IndexedDB for local storage; Supabase (Postgres + Auth) for optional sync
- Deployed on Vercel

## The one rule

**A document is a list of blocks, and every tool is a block type.** Adding a
sixth tool means adding to `BlockType` in `src/lib/types.ts`, a case in
`makeBlock`, an entry in `SLASH_ITEMS` and a component — never a second editor,
a second save path, or a mode to switch into. If a feature needs its own screen
to work, it is the wrong shape for this app.

## Conventions that bite

- **Nothing waits for the network.** IndexedDB is the primary store, not a
  cache. Sync is a copy that lets a second device catch up, so it may fail
  freely and must never report into the editing surface. A save that waits on a
  server is a bug.
- **Supabase is optional and must stay optional.** `isSyncConfigured()` is the
  check; `getSupabase()` returns null rather than throwing, and is a dynamic
  import so its ~100KB stays out of the first download for the many visitors
  who never sign in. A missing environment variable makes the sign-in button
  disappear; it never makes a page fail.
- **React must not own text while the user is typing.** `Editable` is
  uncontrolled: it seeds the DOM on mount and only writes back when the value
  changed elsewhere *and* the element does not have focus. Making it controlled
  puts the caret back at the start on every keystroke. Blocks store plain text,
  never HTML — an offset stays an offset, and nothing from the server can carry
  markup into the page.
- **Do not call setState in an effect body.** The lint rule is on and it is
  right. Use lazy initial state, the render-phase "adjust state when a prop
  changes" pattern (see `slash-menu.tsx`), or `useSyncExternalStore` for values
  that live outside React (see `use-theme.ts`).
- **The theme is applied by an inline script before first paint.** That is what
  stops a dark-mode user seeing a white flash, and why the theme is read
  through `useSyncExternalStore` rather than an effect.
- **Slash matching is ranked, not filtered.** A label hit always beats a
  keyword hit, and keywords match whole words by prefix. A plain substring
  search made `/form` insert a spreadsheet, because "formula" contains "form".
  `rankItems` lives in `src/lib/slash-items.ts` with no JSX so it can be tested.
- **The formula engine matches Excel where they disagree with maths.** `^` is
  left-associative, so `2^3^2` is 64. Blank cells are skipped by `AVERAGE`
  rather than counted as zero. A cycle returns `#CYCLE` instead of recursing
  until the tab dies.
- **Cells are a sparse map keyed `"A1"`, and an emptied cell is deleted** rather
  than stored as `""`, so the map does not fill with blanks.
- **The code block's two layers must agree on every text metric.** The `<pre>`
  and the `<textarea>` share one CSS class for font, size, line height,
  padding and wrapping. Change it in one place or the caret drifts from the
  text, further on every line.
- **No web fonts, no editor library, no highlighting library.** Those are the
  three things that make an app like this heavy. The system font stack is
  already in memory; the highlighter and formula engine are a few hundred lines
  each. Weigh any new dependency against the first-load cost.
- **No emoji in the interface.** Icons come from `lucide-react`.
- **Deletes are tombstones**, not removed rows, or a second device will
  helpfully upload its copy back.
- **`scripts/make-icons.py` regenerates the PNG app icons** from the same
  numbers as `src/app/icon.svg`. Run it if the logo changes, so the two do not
  drift.
- **Detect typed characters from the input event, never from keydown.** Virtual
  keyboards report keydown as `Unidentified` with keyCode 229 and only reveal
  the character afterwards. A keydown-based "/" check is why the slash menu did
  nothing on a phone. The same applies to any future shortcut that watches for
  a character rather than a modifier.
- **Formatted text is two fields.** `text` is plain and stays the source of
  truth for search, preview and export; `html` is only how it is painted, and
  is absent when there is no formatting. Everything painted goes through
  `sanitizeInline` — including stored HTML, because a value that has been to a
  server and back is not ours. The sanitiser allows a few inert tags and **no
  attributes at all**; do not add an attribute allowlist.
- **Structural rewrites bump `revision`.** Editable never repaints a focused
  element, which is what stops the caret jumping while typing — and which also
  blocks the repaint a split needs. Splitting, merging and converting bump the
  revision to override it; typing must never bump it.
- **The editable surface is `white-space: pre-wrap`.** HTML collapses a leading
  space, and splitting a line at one produced blocks that silently lost it.
- **Gutter controls live in the left margin, not inline.** Laid out inline they
  push every block right, leave the title out of line with its own text, and
  shift the text sideways as the pointer moves down the page.
- **Weigh every dependency against the first load, and load the big ones
  lazily.** The sign-in client (~100KB) and the PDF reader (~500KB) are both
  dynamic imports, fetched the first time they are actually needed. `npm run
  e2e` asserts that pdf.js is absent from the first load; keep it that way.
- **PDF export is the browser's print pipeline plus a print stylesheet**, not a
  PDF writer. Anything that is a control rather than content gets
  `print:hidden`.
- **Attachment bytes never go on the block.** They live in the `files` store in
  IndexedDB under a `ref`; only the description travels in the document, which
  is what keeps a document small enough to sync on every change.
- **Sharing publishes a snapshot into its own table.** Never widen the `docs`
  policy to make a document public — one mistake there exposes every private
  document. `shared_docs` has its own public-read policy and only holds what
  was deliberately published.

- **A project is the axis above a document, not a block type.** The "one rule"
  covers the tools inside a document; grouping documents is a different thing
  and correctly lives outside it. Keep a project thin — the moment it carries
  content of its own it becomes a second kind of document and the model forks.
- **Membership lives on the document (`doc.projectId`), never as a list on the
  project.** One home for the fact, so moving a document is one field on one
  row and there is no second list that can disagree — which is exactly how two
  devices end up showing different contents for the same project. A document
  naming a project that does not exist is shown as ungrouped, never hidden: a
  dangling id is recoverable, a vanished document looks like data loss.
- **Projects push before documents in sync**, so a document naming a new
  project never lands on a device that has not heard of it. Project sync never
  fails the run: an un-migrated database should cost the user their grouping,
  not their documents.
- **Do not mutate a ref inside a memoised callback.** The React Compiler
  forbids it. `workspace.tsx` keeps `latest` in step with `doc` in a single
  effect rather than assigning it from each action — which is also one place to
  forget instead of six. Declare hooks before the callbacks that read them;
  a callback defined above a `useRef` compiles but the compiler cannot follow it.

- **Smart typing is bound as a native `beforeinput` listener**, never through
  React's `onBeforeInput`. React's synthetic version is a polyfill over older
  events and does not reliably carry `inputType` or `data`, which are the two
  fields every rule needs to tell a keystroke from a paste or a composition.
- **Correct by replacing the keystroke, not by rewriting the text after it.**
  `preventDefault` then `execCommand('insertText')` keeps the browser's own
  undo stack intact; rewriting afterwards destroys it. Every automatic change
  must also be reversible with one Backspace — see `autocorrected` in
  `editable.tsx`. An editor that cannot be told "no" is one people switch off.
- **After `insertHTML`, step out of what was inserted twice over.** The caret
  is left inside the new element *and* the browser's typing style is set to
  it, so the next word joins the span. Collapse to the parent after the
  element, then clear the style: `queryCommandState` + a toggle for bold and
  italic, and for `code` — which has no command — a zero-width perch, stripped
  by `stripInvisible` from everything that is stored, searched or exported.
- **The debounced save captures the document it was scheduled for.** Reading
  "whichever document is current" when the timer fires loses every keystroke
  made in the 400ms before switching documents, because by then that is a
  different document. Anything that reads the store back calls `flushSave()`
  first.
- **Never `setPointerCapture` on pointerdown.** It retargets the whole gesture,
  including the following `click`, to the capturing element — which silently
  kills every button inside it. Capture only once a drag threshold has been
  crossed, and suppress the click that follows a real drag.
- **Paste is parsed into blocks, never flattened.** `parseClipboard` is a
  string scanner with no DOM so the awkward cases (Word's nested divs, a list
  inside a list, a hard-wrapped email) are unit tested. Collapsing a paste to
  one line is the most destructive thing this editor can do to content nobody
  here wrote.
- **A purge empties a document but keeps its row.** Removing the row lets
  another device push its copy back on the next sync. Free the attachment
  bytes at the same time — they are the part that occupies space.

- **A .docx is a ZIP of XML, and the browser can already unzip it.**
  `src/lib/zip.ts` is a hand-written container reader/writer over
  `DecompressionStream('deflate-raw')`; `docx.ts` is the format translation on
  top. mammoth alone is 2.1MB unpacked. Read the ZIP central directory, never
  the local headers — a local header may carry zero sizes with the truth in a
  trailing data descriptor.
- **An optional property that was never set is absent from the object.**
  `'html' in block` is false on a freshly made block, which silently dropped
  the formatting from every imported document. Narrow by block type instead.
- **The API key lives only on the server.** `src/app/api/ai/route.ts` is the
  one server route in this app, and the only reason it exists. A key in client
  code is a key anyone can read out of the bundle and spend.
- **Search is one thing, not two.** A box that filters the list of file names
  and a box that searches inside documents behave differently and teach people
  to distrust both. `src/lib/search.ts` is a BM25 index over everything, built
  once per opening of the panel — never per keystroke, because it is linear in
  the size of the whole collection.
- **Every query word must appear — unless that finds nothing.** Requiring all
  of them stops a two-word search returning everything containing either.
  Requiring all of them also returns nothing for a whole sentence, so strict
  runs first and the relaxed pass is the fallback.
- **A question's asking words are not search terms.** "What did I *write
  about* the Lagos meeting" is a question about Lagos; `write` and `about`
  appear in no note, and requiring them found nothing at all. `queryTerms`
  drops that vocabulary from questions only — a search for the word "said"
  must still find it.
- **Retrieval happens on the device, and only passages are sent.** The local
  index picks the notes, `src/lib/ask.ts` cuts the matching passages out of
  them, and those go to the model. The collection never leaves the machine,
  the cost of a question does not grow with how much has been written, and
  every claim comes back carrying the note it came from. An answer that cannot
  show its source has to be either trusted completely or checked completely.
- **A document with no title is called by its first line.** The caret starts in
  the body, so plenty of notes never get a title; three rows reading "Untitled"
  tell the reader nothing. `docLabel` is the one place that decides.
- **Writing help never changes the document on its own.** Every result is
  shown and applied only on request. An assistant that silently rewrites what
  someone wrote is one they stop trusting the first time it makes a sentence
  worse, and by then they cannot tell what it changed.
- **Never capture the pointer on pointerdown** (restated because it recurred):
  it retargets the following `click` and kills every button inside the element.
- **A menu that closes on an outside press must test where the press landed**,
  not rely on stopPropagation. Relying on propagation closed the row menu on
  pointerdown and unmounted the button before its click could fire.

## Checking work

`npm test` covers the formula engine, the highlighter and the slash ranking.
`npm run e2e` drives a real browser through every feature and is the one that
catches what the others cannot — caret behaviour, saving, and whether a
document survives a reload. Run both before claiming something works.
