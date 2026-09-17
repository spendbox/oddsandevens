# Pad

A universal document editor. Notes, spreadsheets, tasks, code and forms are
five block types inside one document, not five applications.

Two buttons in it talk to a model. One reads the page back and says what
happens next; one listens and writes down what was said. Nothing else does,
and nothing runs without being pressed.

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
  changes" pattern (see `folder-picker.tsx`), or `useSyncExternalStore` for values
  that live outside React (see `use-theme.ts`).
- **The theme is applied by an inline script before first paint.** That is what
  stops a dark-mode user seeing a white flash, and why the theme is read
  through `useSyncExternalStore` rather than an effect.
- **There is no slash menu and no typing mode.** Typing is a word processor,
  always: Enter makes a paragraph, the markdown shortcuts work, and "/" is a
  slash — which is what somebody writing "and/or" or a date meant by it. Every
  block type is in the toolbar's ⋯ under Insert, so nothing became unreachable.
  A mode to switch into is the shape this app is specifically not.
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
  nothing on a phone, and it is why the markdown shortcuts read the input
  event. The same applies to anything added later that watches for a character
  rather than a modifier.
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
- **The controls live in one toolbar, not in the margin.** The gutter grip and
  "+" that appeared on hover were the thing that made this read as a block
  editor rather than a word processor: you could not see what the app did
  without waving the pointer over the page, and the controls moved as the
  pointer moved. `ribbon.tsx` is fixed above the page and always in the same
  order. Reordering a paragraph is Alt+Up/Down, which is what a word processor
  has always used. Do not put per-block chrome back into the margin.
- **Looking like a toolbar is not the same as looking like Word 2003.** Three
  things date one: a native `<select>` wearing the operating system's chrome, a
  vertical rule between every group, and twenty icons of equal weight. The
  style control is therefore a plain button opening a menu that sets each
  option in its own type; groups are separated by space; buttons have no border
  until the pointer is over them.
- **The side menu is about the open document, not about the collection.**
  Three ways out (home, Library, search), one way onward (New), then Carry on —
  the document you are in — the rest of its folder, and everything the document
  has: where it is filed, the action button, and every way of getting it out or
  bringing something in. Recent and favourites are not
  here: they answer "what was I doing", which is a question asked on the way in,
  so they are on the home screen where the whole collection is. A list of other
  documents beside the one being written is the thing this surface has been cut
  down from twice.
- **"Carry on" exists because the menu covers the page on a phone.** At 390px
  the side menu is the whole screen, so the way back has to be a visible thing
  the size of a card, not a cross in a corner.
- **"Move this to a folder" is one button and a picker, never an inline list.**
  Four menus each printing every folder is a menu you scroll past to reach
  Delete, and it is a different length for everybody. `folder-picker.tsx` is
  shared by the side menu, the folder dropdown and every row in the Library, so
  none of them can quietly stop offering "Take it out of its folder". A document
  in no folder says so at the top of its settings rather than showing nothing —
  an absent row reads as "there is no such thing as a folder here", and the
  loose document is precisely the one somebody wants to file.
- **The home screen has two tabs and will go on having two.** Carry on and
  Library. A tab bar that can grow is a navigation system, and this screen
  exists because the app had one too many of those.
- **Unfiled documents are the first shelf in the Library, not the last.** They
  are the ones whose answer to "where is it" is "nowhere", which is the question
  that screen is for.
- **Dragging to make a folder lives in the Library now.** It is the one place
  every document is listed, so it is the only place there is anything to drag
  between. Selecting several and pressing Move is the same tidying with a thumb,
  and the only one of the two that moves nine documents at once.
- **The toolbar is four controls: undo, redo, ⋯ and the action button.** It had twenty, all
  correct and collectively a band of grey furniture across the top of every
  page somebody opened to write on. Everything else is one press inside the ⋯,
  and the marks are also on the bar that appears over a selection. The line to
  hold: a quieter toolbar is worth a press and is not worth a feature, so
  nothing may become unreachable when something leaves the row.
- **A bar the page scrolls under is opaque, never 95% with a blur.** The words
  showed through, which on a bar that never moves reads as a rendering fault.
- **A toolbar button that applies a command acts on `pointerdown` with
  `preventDefault`; one that opens something acts on `click`.** The first half
  is because a click blurs the block, leaving the command no selection to act
  on. The second half is because acting on pointerdown puts a panel — or its
  backdrop — under a finger that is still down, and the click completing the
  tap then lands on it: on a phone the action button appeared to work only if
  you held it. Keep the `preventDefault` on pointerdown either way, which is what
  saves the selection; only move where the action runs.
- **Undo is over whole documents, and takes Ctrl+Z from the browser.** The
  browser keeps a stack per contenteditable, which here is per paragraph, so
  its undo knew nothing about a split, a delete, a conversion or a rewrite
  applied to the page. `lib/history.ts` keeps snapshots — cheap, because every
  edit already produces a whole new `Doc` immutably — coalesces edits closer
  together than 600ms, and is thrown away when a different document is opened.
  Restoring one bumps a revision the editor adds to its own, because Editable
  will not repaint a focused element otherwise.
- **An icon never costs a model call.** `lib/doc-icon.ts` is a table of words
  matched against the title first and the opening lines second. Paying for a
  decoration on every document forever is a bad trade, and it would mean no
  document had an icon until a network round trip finished. Only whole words
  count — substring matching made everything containing "planning" a plane —
  and a word earns its place only if it almost always means the same thing:
  "call", "numbers", "draft", "book" and "release" were all in there once and
  are all deliberately gone.
- **The header folds by not being rendered, never by a height of zero with the
  overflow hidden.** The clipping version animated nicely and cropped every
  menu opened from inside the header — the document's own ⋯ menu came out cut
  off at the height of the bar, which reads as the menu being behind the page.
- **Nothing between a sticky element and the scroller may clip its overflow.**
  `overflow-hidden` on an ancestor makes that ancestor the scrollport, and a
  box that does not scroll cannot make anything stick. It was on the sheet, for
  rounded corners, and it silently broke both the toolbar and the headings.
- **A sticky heading sticks on the block's wrapper, not on the heading text.**
  A sticky element sticks within its containing block, and a heading's own box
  is exactly one heading tall — so it stuck to nothing at all. The wrapper's
  containing block is the whole run of blocks.
- **Never read localStorage in a lazy `useState` in a component that is
  server-rendered.** The server has no localStorage, so the first client render
  disagrees with the server's HTML and React throws a hydration error on every
  load. `useSyncExternalStore` with a constant server snapshot is the tool, as
  it is for the theme — and the snapshot must be the raw string, because a
  freshly parsed Set is a new object every time and that is a render loop.
- **The header folds from the scroll position, never from its direction.**
  Folding it makes the scroller taller, that relayout fires another scroll
  event, and a direction-based version reads the change it caused itself as a
  scroll the other way and unfolds — then folds — forever. Two thresholds, with
  a gap wider than the header is tall, cannot oscillate.
- **The sidebar is the whole screen on a phone**, not a 16rem drawer over the
  document. A strip with the page showing down one side reads as something
  half-open, and it costs every row the width that made the names readable.
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

- **The Library is a way in, not a place.** Dropped files become ordinary
  documents in the ordinary sidebar — searchable, answerable, syncable like
  everything else. It reuses the readers that already exist (`pdf.ts`,
  `docx.ts`, the clipboard parser), which is why a library needs no editor, no
  store and no document shape of its own. Give it one and it becomes a second
  application inside the first.
- **Titles come from the contents first, the filename second.** A heading at
  the top wins, because a document that has one has already said what it is;
  then the filename, but only when it says anything — `scan_0012`,
  `IMG_20240211` and `Document (3)` are exactly the files that need a title,
  and taking their names would title a tenancy agreement "Scan 0012".
  `isUninformativeName` is the test, and it is the thing to fix when a title
  comes out wrong.
- **The model improves the filing; it is not what makes it exist.** Every title
  and summary is produced locally first and shown either way, so no key, no
  network and a refusal all cost quality rather than the import. The reply is
  parsed forgivingly for the same reason: one malformed entry must not lose a
  batch of forty documents.
- **Nothing is filed until it has been seen.** Titles are editable in the
  review list and the batch can be thrown away whole. A project is offered only
  where at least two documents share a subject — a project of one is a folder
  with a single file in it.
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
- **A pull fetches what changed, not everything.** Each table keeps a cursor —
  the newest `updatedAt` this device has accepted — in the `meta` store beside
  the documents, and asks only for rows past it. Asking for every row every
  twenty seconds is invisible with five documents and megabytes over a phone
  connection with five hundred. Two things stop the cursor losing a row: it
  reaches back a minute beyond itself, because `updatedAt` comes from whichever
  device made the edit and clocks disagree, and every half hour it is ignored
  for a full reconcile. A cursor moves only to a timestamp actually seen, never
  to "now", and is written only after every row it covers has been stored.
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
- **GPT-4o is what this asks for, and every call goes through `complete`.**
  One place knows which provider is configured, one place turns a refusal into
  an exception, and one place changes when the answer to "which model" changes
  again. The Anthropic path is kept as a fallback rather than deleted, because
  anyone with `ANTHROPIC_API_KEY` already set would otherwise find their
  writing help had silently disappeared; it is read only when
  `OPENAI_API_KEY` is empty. `effort` is meaningful only to that fallback, and
  the signature says so rather than pretending both providers have the same
  controls.
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
- **The recorder is the one thing allowed to be a floating button.** Every
  other corner-pinned control was taken out of this app, because a button
  pinned to the bottom right is furniture and furniture is invisible after the
  first day. A recorder is the exception everywhere: a phone, a voice memo app
  and a dictaphone all put one round button where a thumb already is, because
  you reach for it rather than going looking — usually while somebody else is
  still talking.
- **The browser does the listening, not a transcription service.** Chrome,
  Edge, Safari and Chrome on Android all ship a recogniser that is free, live
  and weighs nothing. Uploading audio is more accurate and is also money per
  minute of every meeting anybody records, an upload on a phone connection, and
  a wait at the end instead of words arriving as they are said. The model makes
  up most of the difference afterwards by tidying the text, which costs one
  request rather than one per minute.
- **A recogniser that stops on its own is restarted.** Every browser one stops
  after a pause, however plainly it has been told to run continuously — and in
  a meeting the pauses are where people are thinking. Every stop that was not
  asked for starts it again and keeps what has been settled. That single detail
  is the difference between this working for a dictated line and working for
  forty minutes.
- **The transcript has one home, and what is painted is a separate value.**
  `finals` is a ref, because a phrase arriving while a request is in flight has
  to be in the record whatever React has painted; the live line is state,
  because a ref changing repaints nothing and reading one during render is a
  value React cannot see change. One callback writes both.
- **Tidying speech never adds a word.** The dictation prompt punctuates and
  drops "um"; the meeting prompt makes headings out of what was actually
  discussed. Both are told, at the top of the list, that every fact, name,
  number and date must already be in the transcript. A meeting note containing
  something nobody said is worse than no note, and it is the failure this is
  written against.
- **Speech is written in when the recording stops, not while it runs.** Words
  landing in the document as they are recognised means every correction the
  recogniser makes rewrites the page under the caret. The sign shows the live
  words instead, which answers the question somebody actually has while
  recording — not "is it on" but "is it hearing me".
- **One button reads the page, and it only ever reads it.** Ask rewrote the
  sentence somebody was in the middle of; Brain applied a document's rules to
  lines as they were typed; Goals watched a draft against what it was for. All
  three acted on the writing, which is the part nobody wants help with. What
  replaced them is `action-plan.tsx`: pressed on purpose, it says what happens
  next and changes nothing. If something in this app ever edits a document
  without being told to, that is the rule being broken.
- **A plan says who, and is honest about which half is not wired up.** Every
  step is `you` or `app`, because "ring the plumber" and "draft the email" are
  different kinds of sentence and only one of them is ever software's to take
  on. Nothing marked `app` is done — drafting through the API and putting dated
  steps in a calendar are the two that come next — and the panel says so in as
  many words rather than showing a button that would lie.
- **The plan works with no key.** `lib/plan.ts` builds one on the device from
  `findTasks`, and it is shown either way; the model sorts and shortens it. The
  same bargain as the icons, the Library's titles and the search: a refusal, a
  missing key or a dead network costs the quality of the answer, never the
  answer. `lib/plan.ts` has no JSX and no fetch, so every awkward reply is a
  unit test.
- **A date in a step is the writer's own words.** `whenIn` reads it off the
  step's own wording rather than the model being asked for it, so there is one
  rule about dates instead of two that can disagree — and "Friday" is never
  turned into a timestamp, because a reminder on the wrong day is worse than a
  reminder with no day.
- **Nothing is reachable only by a keyboard shortcut.** The action button is on
  the toolbar at every width, and in the side menu. The same test applies to
  anything added later: if the only route to it is a chord, half the people
  using this will never find it. For the same reason a placeholder never
  promises a shortcut — a hint that is wrong on half the devices is worse than
  no hint.
- **An inline style always beats a class, so never write one a narrow layout
  needs to win.** A panel anchored on a desktop and a sheet on a phone cannot
  have its desktop `left` written inline: `inset-x-2` cannot override it, and
  the sheet collapses to the width of its own text. The same trap in Tailwind's
  own output is why `folder-picker.tsx` and `action-plan.tsx` are centred by a
  flex container rather than by `inset-x-2 … sm:left-1/2`.
- **A `fixed` panel opened from the side menu must be a portal.** `position:
  fixed` is relative to the nearest transformed ancestor, and the side menu
  carries a transform so it can slide. Without the portal the panel is laid out
  inside a 288-pixel column and hangs off the edge of the window.
- **Whether the model is configured is asked once, by the workspace.** Three
  panels each asking `/api/ai` on mount is three requests for one answer that
  cannot change while the tab is open.
- **Folds are one store, not one per component.** `lib/folds.ts`, and the
  snapshot is the raw string for the same reason the theme's is: a freshly
  parsed Set is a new object every time, which `useSyncExternalStore` reads as
  a change and turns into an infinite render loop.
- **Nothing scans a document as it is typed.** A strip appearing over the page
  mid-sentence to ask about a line you have just written is an interruption.
  `lib/tasks.ts` is still the scanner, and it now runs only when the action
  button is pressed — which is the same rule from the other direction: the
  reading happens because somebody asked for it.
- **An optional field on the document has to reach the row, or it does not
  sync.** Favourites were on the document and silently dropped by `toRow`, so a
  star set on a laptop was not a star on the phone. `0004_doc_settings.sql` is
  the column; the lesson is that "it is one field on the document, so it
  travels with everything else" is only true once `toRow` and `toDoc` know.
- **A suggested task is offered, never created.** Whether "speak to Sam about
  the lease" is a task or a description of something that already happened is
  not decidable from the sentence, so `lib/tasks.ts` returns candidates and
  every one is confirmed on its own. It is a pure string scan with no model
  call: it runs with no key, no network and no cost, and every awkward case is
  a unit test rather than something to reproduce by typing.
- **A date in a task is kept as the writer wrote it**, never parsed into a
  timestamp. "Friday" means a different day depending on when it was written,
  and a reminder on the wrong day is worse than a reminder with no day. The
  wording is what a calendar's own parser will want when one is connected.
- **A folder is one button, not a strip of its contents.** The folder's other
  documents used to sit above the open one as a scrolling row of chips: the
  first thing on the page was a list of things that were not the page, and the
  strip was a different width with every folder. `folder-bar.tsx` is a single
  header button that opens to hold the whole folder, searchable, with no
  reflow. Navigating a folder and moving the document out of it are in that one
  menu, because they are the same thought half a second apart.
- **"Put this document in…" is written once.** `folder-choices.tsx`, used by
  the sidebar row menu, the folder button, the document's ⋯ menu and the
  Library row. Four copies is four places for one of them to quietly stop
  offering "Take it out".
- **Browsing is grouped by folder; searching is not.** The Library lists
  documents under their folders because browsing is a question about where
  things are. Search results are a flat ranked list, because a folder heading
  between the matches only pushes the best one further down.
- **A document appears in exactly one section.** Not only tidiness: a row
  carries a menu, and the same document rendered twice opened two menus on top
  of each other, so nothing in either could be pressed.
- **A favourite is one optional field on the document** (`favoritedAt`), like
  its project. One home for the fact, so it syncs with everything else and
  there is no second list to disagree with it.
- **The home screen is the way back, not the way in.** Opening straight into a
  document with the caret already in it is this app's oldest promise; a home
  screen in front of that is one press between somebody and their first
  sentence.
- **Alignment is a property of the paragraph, so it is a class on the block**
  and never markup inside `html`. That is what lets the sanitiser go on
  allowing no attributes at all, which is the rule that makes formatting safe
  to sync.
- **Every size inside the page is a multiple of `--doc-text`.** One variable
  drives the body, the headings, the title and the small print, so the size
  control moves a typographic scale rather than one paragraph — which is what
  stops a large setting producing body text bigger than the heading above it.
- **Never capture the pointer on pointerdown** (restated because it recurred):
  it retargets the following `click` and kills every button inside the element.
- **A menu that closes on an outside press must test where the press landed**,
  not rely on stopPropagation. Relying on propagation closed the row menu on
  pointerdown and unmounted the button before its click could fire.

## Checking work

`npm test` covers the formula engine, the highlighter, the plan and the
transcript handling.
`npm run e2e` drives a real browser through every feature and is the one that
catches what the others cannot — caret behaviour, saving, and whether a
document survives a reload. Run both before claiming something works.
