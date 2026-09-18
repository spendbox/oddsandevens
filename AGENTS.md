# Pad

A note-taking app for people who take notes for a living. Two screens: the
notes, and a note.

**Everything the reader sees is called a note.** Not a document, not a file.
Two lines or twenty pages, the same word for both.

Four things in it talk to a model, all of them on purpose and all of them
optional: the box that writes a note up, the recorder that writes down what was
said, the question you can ask of your own notes, and the button that puts
everything outstanding in an order. Nothing else does, and nothing runs without
being pressed.

There is one writing surface and it is a page. Lines finish themselves as the
caret leaves them, with no model involved.

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

**A note is a list of blocks, and a block is a line of writing.** A paragraph,
a heading, a bullet, a box to tick, a quote, a rule across the page. That is
the whole of `BlockType` and it is meant to stay that size.

It used to be bigger: every tool was a block type, so there was a spreadsheet
with a formula engine, a code editor with a syntax highlighter, a form builder
and file attachments, all inside the same note. Each was well made and each was
the wrong app — somebody taking notes in a meeting wants to write, and every
one of those was weight in the first download and a control on a bar they had
to read past to reach their own words. Adding one back means being able to say
why a note-taking app needs it more than it needs to stay this small.

The person typing never meets a block. That is the other half of the rule and
the harder half: the model is underneath, where it belongs, and the surface is
a page.

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
- **React must not own text while somebody is typing.** A run paints its lines
  once and then leaves the browser alone; a keystroke that goes to state and
  comes back as a re-render rebuilds the text nodes and throws the caret to the
  start. Blocks store plain text, with the painting in a separate field — an
  offset stays an offset, and nothing from a server can carry markup into the
  page.
- **Do not call setState in an effect body.** The lint rule is on and it is
  right. Use lazy initial state, the render-phase "adjust state when a prop
  changes" pattern (see `compose-note.tsx`), or `useSyncExternalStore` for
  values that live outside React (see `ui-prefs.ts`).
- **The theme is applied by an inline script before first paint.** That is what
  stops a dark-mode user seeing a white flash, and why the theme is read
  through `useSyncExternalStore` rather than an effect.
- **One surface, and the browser does as much of it as possible.** A run of
  paragraphs is one `contenteditable`, so Enter makes a line, Ctrl+A takes the
  page, a selection runs past the end of a paragraph and a copy comes out as
  one piece — none of it reimplemented. The app that owned every paragraph
  separately had to hand-write all four and got each of them slightly wrong.
- **React owns the structure; each run owns its own text.** React must not own
  text while somebody is typing: a keystroke that goes to state and comes back
  as a re-render rebuilds the text nodes and throws the caret to the start. So
  React renders which runs exist and what sits between them, and a run paints
  its own lines once and then leaves the browser alone — repainting only when
  the revision says so, or when the document changed elsewhere and nobody is
  typing in it.
- **The rules for reading the page back live in `lib/plain-doc.ts`**, with no
  DOM in the file, so a paragraph deleted, a paragraph split, a list carried
  on and a spreadsheet the caret ran over are unit tests rather than something
  to reproduce by typing.
- **Pressing Enter clones the element, `data-block-id` and all.** Two lines
  then wear one id, and every question of the form "which line is the caret
  on" answers with the line above — which is why the new ids are stamped back
  onto the children after every read-back, before anything asks. It is an
  attribute write, never a text-node write, so the caret does not feel it.
- **Lines finish when the caret leaves them, never while they are being
  typed.** `lib/beautify.ts` reads "- ", "1.", "[]", "#", ">", "**bold**" and
  gives the line the shape it was plainly aiming at. Nothing is predicted and
  no model is asked: they are string comparisons, they are free and offline
  and identical every time, and every one is a unit test. On leaving the line
  because "#" is a character people write and "- " halfway through a thought
  is a dash.
- **Nothing rewrites a word.** Markers come off because they were notation;
  emphasis is painted rather than retyped. The two rules that guess rather than
  read — a shouted short line is a heading, a short line ending in a colon is a
  lead-in — are kept narrow for the same reason, and neither touches a line
  that is already something. An editor that rewrites your sentences is one
  people stop trusting the first time it is wrong.
- **Every automatic change is one undo away**, and the capital that arrives as
  you type is one Backspace away, because it replaced the keystroke rather than
  rewriting the text after it. An editor that cannot be told "no" is one people
  switch off.
- **List markers and numbering are drawn with CSS**, not put into the DOM. A
  marker that is a real node is a node the caret can be put inside, a node a
  copy carries into the clipboard, and a node that has to be stripped out again
  on every read-back. A counter is also right at every moment by construction,
  where stamped numbers have to be corrected every time an item is added.
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
- **Structural rewrites bump `revision`.** A run never repaints a focused
  element, which is what stops the caret jumping while typing — and which also
  blocks the repaint a split needs. Splitting, merging and converting bump the
  revision to override it; typing must never bump it.
- **The editable surface is `white-space: pre-wrap`.** HTML collapses a leading
  space, and splitting a line at one produced blocks that silently lost it.
- **"Saved" is a word, not a button.** There is no save button and an app with
  no save button has to say so. It says "Saving…" between the keystroke and the
  disk, so it is demonstrably live rather than a label printed on the bar — and
  that means the state has to be true: `update` sets it, the debounced write
  clears it.
- **A bar the page scrolls under is opaque, never 95% with a blur.** The words
  showed through, which on a bar that never moves reads as a rendering fault.
- **Undo is over whole notes, and takes Ctrl+Z from the browser.** The
  browser keeps a stack per contenteditable, which here is per paragraph, so
  its undo knew nothing about a split, a delete, a conversion or a rewrite
  applied to the page. `lib/history.ts` keeps snapshots — cheap, because every
  edit already produces a whole new `Doc` immutably — coalesces edits closer
  together than 600ms, and is thrown away when a different note is opened.
  Restoring one bumps a revision the editor adds to its own, because a run will
  not repaint a focused element otherwise.
- **An icon never costs a model call.** `lib/doc-icon.ts` is a table of words
  matched against the title first and the opening lines second. Paying for a
  decoration on every document forever is a bad trade, and it would mean no
  document had an icon until a network round trip finished. Only whole words
  count — substring matching made everything containing "planning" a plane —
  and a word earns its place only if it almost always means the same thing:
  "call", "numbers", "draft", "book" and "release" were all in there once and
  are all deliberately gone.
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
- **Nothing in this app folds itself on scroll any more, and that is a rule.**
  The header did: folding it made the scroller taller, that relayout fired
  another scroll event, and the first version read the change it had caused
  itself as a fresh scroll and oscillated forever. It took two thresholds with
  a gap wider than the header to settle. Anything that moves because the page
  moved will find its way back to that bug; there is one bar now and it stays
  where it is.
- **Weigh every dependency against the first load, and load the big ones
  lazily.** The sign-in client (~100KB) and the PDF reader (~500KB) are both
  dynamic imports, fetched the first time they are actually needed. `npm run
  e2e` asserts that pdf.js is absent from the first load; keep it that way.
- **Sharing publishes a snapshot into its own table.** Never widen the `docs`
  policy to make a document public — one mistake there exposes every private
  document. `shared_docs` has its own public-read policy and only holds what
  was deliberately published.

- **A pull fetches what changed, not everything.** Each table keeps a cursor —
  the newest `updatedAt` this device has accepted — in the `meta` store beside
  the documents, and asks only for rows past it. Asking for every row every
  twenty seconds is invisible with five documents and megabytes over a phone
  connection with five hundred. Two things stop the cursor losing a row: it
  reaches back a minute beyond itself, because `updatedAt` comes from whichever
  device made the edit and clocks disagree, and every half hour it is ignored
  for a full reconcile. A cursor moves only to a timestamp actually seen, never
  to "now", and is written only after every row it covers has been stored.
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
- **The debounced save captures the note it was scheduled for.** Reading
  "whichever note is current" when the timer fires loses every keystroke made
  in the 400ms before leaving a note, because by then that is a different
  note. Anything that reads the store back calls `flushSave()`
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
- **A purge empties a note but keeps its row.** Removing the row lets
  another device push its copy back on the next sync. Free the attachment
  bytes at the same time — they are the part that occupies space.

- **An optional property that was never set is absent from the object.**
  `'html' in block` is false on a freshly made block, which silently dropped
  the formatting from every imported note. Narrow by block type instead.
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
- **The cheap model is the default, and the job picks the expensive one.**
  Nothing in this app is agentic and nothing uses tools, so nothing asks for the
  largest model. Punctuating a dictated paragraph and expanding "mtg" to
  "meeting" are reading tasks: the small model does them as well as the large
  one, costs a fraction, and is the faster of the two — which matters because it
  is the one somebody is sitting and waiting for. `effort: 'high'` is the only
  thing that moves a request up, and only two callers set it: answering a
  question about the notes, and ordering what is outstanding. Both are a
  judgement rather than a reading. `output_config` goes only to the model that
  understands it, because a 400 back would turn "the cheap model does the cheap
  jobs" into "writing help stopped working".
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
- **A note with no title is called by its first line.** The caret starts in
  the body, so plenty of notes never get a title; three rows reading "Untitled"
  tell the reader nothing. `docLabel` is the one place that decides.
- **The recorder is the one thing allowed to be a floating button.** Every
  other corner-pinned control was taken out of this app, because a button
  pinned to the bottom right is furniture and furniture is invisible after the
  first day. A recorder is the exception everywhere: a phone, a voice memo app
  and a dictaphone all put one round button where a thumb already is, because
  you reach for it rather than going looking — usually while somebody else is
  still talking.
- **Two things listen, and they are listening for different reasons.** The
  browser's recogniser runs while somebody talks: free, live, weighs nothing,
  and the only one of the two that can answer "is it hearing me" as they
  speak. The microphone is also recorded, and the audio is transcribed
  properly when the recording stops — because what the recogniser hands back
  is a stream of guesses with no punctuation that loses names, figures and
  anything said across another voice, and approximately what was said is the
  one thing a meeting note must not be. This rule used to say the browser did
  all of it and gave cost as the reason; the cost is real, and is why this
  needs a key and a press, and it is not a reason to write down wrong words.
- **The live words are the fallback, never the discard.** No key, a refused
  microphone, a failed upload, one piece of a long recording that did not
  arrive, a browser with only one of the two abilities: whatever exists is
  what goes into the note, and a missing piece is said out loud rather than
  left as a silent hole. A recording must never be lost to a request.
- **Audio is uploaded as complete files, cut into pieces by restarting the
  recorder.** A slice of a WebM stream has no header and nothing can decode
  it, which is the trap this looks like it should fall into. Pieces exist
  because a serverless request body caps out around 4.5MB, and because one
  upload failing at minute fifty must not cost fifty minutes — five minutes
  of Opus at 24kbps is about 900KB, which is inside every limit involved.
- **Ask for the microphone by name.** `echoCancellation`, `noiseSuppression`
  and `autoGainControl` are the difference between a phone on a meeting-room
  table and a recording of a meeting room, and the defaults are not them.
- **A recorder holds the microphone open until its tracks are stopped.** The
  light stays on, and that is the thing people notice. Every way out —
  stopping, cancelling, unmounting, leaving the page — goes through one
  release.
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
- **Nothing is reachable only by a keyboard shortcut.** Search has Ctrl+K and a
  field across the top of the notes that says what it searches. The same test
  applies to anything added later: if the only route to it is a chord, half the
  people using this will never find it. For the same reason a placeholder never
  promises a shortcut — a hint that is wrong on half the devices is worse than
  no hint.
- **Whether the model is configured is asked once, by the workspace.** The box,
  the recorder and the search panel each asking `/api/ai` on mount is three
  requests for one answer that cannot change while the tab is open.
- **Folds are one store, not one per component.** `lib/folds.ts`, and the
  snapshot is the raw string for the same reason the theme's is: a freshly
  parsed Set is a new object every time, which `useSyncExternalStore` reads as
  a change and turns into an infinite render loop.
- **An optional field on the note has to reach the row, or it does not sync.**
  Favourites were on the note and silently dropped by `toRow`, so a star set on
  a laptop was not a star on the phone. `0004_doc_settings.sql` is the column;
  the lesson is that "it is one field on the note, so it travels with
  everything else" is only true once `toRow` and `toDoc` know.
- **A note appears in exactly one list.** Notes and Favourites are two lists,
  not a list with a shelf on top of it: a favourite used to sit at the top of
  the same column and push everything else down while answering a question
  nobody was asking.
- **A favourite is one optional field on the note** (`favoritedAt`). One home for the fact, so it syncs with everything else and
  there is no second list to disagree with it.
- **The notes screen is the way back, not the way in.** Opening straight into a
  note with the caret already in it is this app's oldest promise; a screen in
  front of that is one press between somebody and their first sentence.
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

- **Return is read from the input event, never from the key.** A laptop's
  Return arrives as a keydown saying "Enter"; a phone's does not — virtual
  keyboards report keydown as `Unidentified`, and the only reliable account of
  what happened is `inputType`, which says `insertParagraph` on every keyboard
  there is. Reading the key meant that on a phone none of the Return rules ran:
  a numbered list could not be got out of, because "Return on an empty item
  leaves the list" lives in `enter` and `enter` was never called, so every
  press added another number. It is the same rule as the one about typed
  characters, and it is the second time this bug has been paid for.
- **The opening line of an untitled note becomes its name, not a heading.** It
  was a heading, which left the note wearing its name twice — an empty title
  box the size of a headline, and the same words again as the first line under
  it. The line and the name are written in one change (`publish(blocks, title)`
  down to one `onChange`), because two changes in one keystroke means the
  second reads a note that does not have the first. A line carrying emphasis is
  never taken: a title is plain text, and promoting one would throw the bold
  away.
- **A note's kind is a table of words, never a model call.** `lib/kind.ts`, six
  kinds and the sixth is "Note". Same bargain as the icons: instant, offline,
  free, identical every time, and a unit test rather than something to notice
  by eye. It reads the icons table for the kinds that table already implies
  rather than keeping a second list of the same words, because two lists of
  words about the same thing is one of them quietly disagreeing.
- **Green says what kind of note it is, and nothing else may use it.** Yellow
  marks a searched word, and nothing else may use that. Two colours with one
  job each are learnt in a day; a palette where everything is coloured says
  nothing at all. The recorder is black for the same reason: a microphone
  button is black on every phone ever made, and a recorder is not a kind of
  note.
- **The writing is a serif; the app around it is not.** A note set in the same
  font as the buttons reads as a field in a form. It is the system serif, for
  exactly the reason there is no web font anywhere in here.
- **`when` and `stamp` answer different questions.** "3 minutes ago" is what
  somebody wants in a sentence about one note; in a column beside forty of them
  every row saying "ago" is noise, and the eye is scanning for *today* against
  *not today*. So a list gets a clock time, "Yesterday", or a date — which is
  what every mail client settled on.
- **A count shown to the reader must be the honest one.** The search index
  deliberately counts a note's title several times over so a word in the name
  outranks the same word in the body. That is right for ranking and a lie to
  print, and "6 mentions" is printed — so `SearchHit.mentions` comes from a
  second, unweighted count. Any number this app shows has to be countable by
  the person reading it.
- **A note is a row in a list, not a card in a grid.** Cards make the eye
  travel in two directions and give every note the same weight; a row lets the
  kind, the name, two lines of the note and the time line up in columns that
  can be read down separately. Two lines of the note, not one: one is a label,
  and most notes never get a title at all.
- **Only one recorder may be on screen.** It is a portal pinned to the corner
  of the window, so the note's own goes on floating over whatever covers the
  note — and two identical microphone buttons in one corner is one of them
  doing something other than what it looks like. The editor is told when it is
  covered.

- **The box is how a note is made, and it must never be a gate.** Type, save,
  done — and what happens next is the model's. Everything about it is written
  so a refusal, a missing key, a timeout or being offline costs the tidying and
  never the note: the local answer is worked out *before* the request, and
  every failure path saves it. A box that can lose what somebody typed is worse
  than no box.
- **Nobody is ever made to name a note.** The name comes from the writing — the
  model's when there is one, the opening line otherwise — and stays an ordinary
  editable field, because a name that cannot be corrected is worse than no
  name. The line the name was taken from is then taken out of the writing, or a
  one-line note is shown twice on its own page.
- **The model writes a note up; it does not write a note.** Expanding "mtg" to
  "meeting" and breaking a run-on into bullets is writing up. A decision nobody
  took, a date nobody gave or a name nobody wrote is making something up, and
  one invented line in a note about a lease outweighs every minute this saves.
  That rule is the top line of the prompt, and it is the same rule the
  dictation prompts are written against.
- **A reply from the model is parsed forgivingly, and in a file with no DOM.**
  `lib/compose.ts` reads a title line, a heading, a code fence or nothing at
  all, and the whole reply is the note if nothing can be recognised. Every
  awkward reply is a unit test. Rejecting a malformed reply would mean losing
  somebody's note to a stray "Sure, here you go".
- **The list is the front page, and a note is what you go into.** Opening
  straight into the last note touched was this app's oldest habit, and it was
  opening a filing cabinet at whichever drawer was left out. The first screen
  is what you have written; writing is one press from it.
- **Signing in lives on the first screen.** It was a button in a header above a
  note, then a row at the foot of a side menu: both are places somebody looking
  for their account would never think to look.
- **A note read back from storage may hold blocks this app no longer has.**
  `readBlocks` turns any of them into a paragraph of whatever text it carried.
  Dropping them silently would be losing somebody's work, and rendering them is
  exactly the weight that was taken out. Every read goes through it.
- **The picture on a row is the icon, not the kind.** Six kinds is a useful
  thing to say and a poor thing to draw — forty notes wearing six pictures
  between them is a column where the pictures say nothing. `doc-icon.ts` has a
  few hundred words behind it; the kind is a word on the line above a note's
  title, where a word is the right shape for it.

- **A control that only appears on hover does not exist on a phone.** The trash
  had two: putting a note back and destroying it for good were `opacity-0`
  until a pointer was over them, so on a touch screen "delete for good" could
  not be pressed at all — and the note somebody was trying to destroy stayed
  exactly where it was, which is what "permanently deleted notes are not
  actually deleting" turned out to mean. Hover may *reveal* a control on a
  desktop; below `sm` it is simply there.
- **A purge has to survive the wire, and it does it by being recognisable.**
  Emptying the row and keeping it is what stops another device pushing its copy
  back — but for a while nothing carried that fact across, so the other device
  pulled a row that was merely "deleted" and put the empty note back in its
  trash. `toDoc` reads it off the row instead: deleted, with nothing left in
  it, is what a purge looks like. No column, no migration, and nothing that can
  get out of step with the data because it *is* the data.
- **A control inside a line of text is a caret position.** The box on a task
  was an inline element at the front of the line, so the first place a caret
  could go was between the left edge and the box, and everything typed there
  went in front of a control rather than into the task. It is painted in the
  margin now — absolute, in the padding the line already leaves — exactly like
  the bullet and the number, which were drawn that way for the same reason.
- **A sheet pinned to the bottom of the window ends up under the keyboard.** A
  phone does not make the page shorter when the keys come up; it draws them
  over the bottom of it, and `100dvh` is the same viewport. `components/
  keyboard.ts` reads the difference between the two viewports and the box is
  lifted by it — plus `interactiveWidget: 'resizes-content'` for the browsers
  that will do it properly.
- **Formatting appears with a selection and is nowhere otherwise.** Bold is
  something you do to words you have already written; a bar of controls across
  the top of a page is in the way on every line and useful on one in fifty.
  `format-toolbar.tsx` is the only formatting surface in the app. Its marks go
  through `execCommand`, which is the only API that edits a contenteditable
  and keeps the browser's undo; its line styles cannot, because the kind of a
  line is a property of the block, so those are handed up and applied exactly
  the way typing "# " is.
- **A list carries on in the box, or every item after the first is typed by
  hand.** `nextListPrefix` is the rule and it is a unit test. Inserting the
  marker goes through `execCommand` to keep undo; *removing* one uses
  `setRangeText`, because asking execCommand to insert an empty string deletes
  by implication and it deleted one character more than was selected — the line
  break above it — so the next thing typed joined the line before.
- **A pasted or written "1." is a numbered list, not a bulleted one.**
  `PastedBlock.ordered` exists because the marker was being read and the kind
  of list it meant thrown away one line later. An `<ol>` from the clipboard
  says the same thing, and both end up on the block.
- **Notes are grouped by the day they were written, and the list renders a page
  at a time.** Days because "that was Tuesday" is how people remember writing
  something, and forty timestamps in a column is forty things to read. Ten at a
  time because somebody with six hundred notes should not pay for five hundred
  and ninety of them to open their list — the next ten arrive from an
  `IntersectionObserver`, not a scroll handler, so nothing runs while the list
  is sitting still.
- **A swipe is never the only way to do something.** Dragging a row to the left
  deletes it, because that is the gesture every list on a phone has and the one
  people try first — and the same delete is a button on the row and a row in
  the note's own ⋯, because a gesture nobody discovers is a feature nobody has.
  The drag takes the pointer only after it has moved sideways past a threshold:
  capturing on pointerdown kills every button inside the row, and a drag that
  starts vertical belongs to the scroller.

- **Deleting from the list asks, and names the note.** A swipe is easy to start
  by accident on a list a thumb is scrolling, and a row vanishing with no
  question reads as data loss even though the trash has it. The question is a
  sheet rather than an inline "are you sure?": an inline one turns one row into
  two and moves every row under it, which is the wrong thing to do to a list
  somebody is already moving through. The safe answer takes the focus, so
  Return keeps the note. The trash's own "delete for good" stays inline,
  because by then the list has stopped.
- **The bin is not on a row on a phone.** There is no hover on a touch screen,
  so a control that reveals itself on hover is a control that is simply always
  there — forty small destructive buttons under a scrolling thumb. The swipe is
  the gesture there, and the note's own ⋯ is the other way in, so nothing is
  reachable only by a gesture.
- **The top of the notes greets the reader; it does not label the screen.** It
  said "Notes", which is a filing cabinet's label on the only screen this app
  opens to. The name is derived from the account's email — and derived means
  guessed, so `nameFromEmail` returns nothing rather than "Hi, A_l99", and what
  somebody types always wins. It lives in localStorage beside the theme, read
  through `useSyncExternalStore` with an empty server snapshot, because a name
  is a preference about this browser's chrome and not something to hold on a
  server.
- **The page follows the caret.** Typing past the bottom of the window with the
  page staying put is an editor you cannot write more than a screenful in. The
  scroll is worked out from the selection's own rect — falling back to the
  line's, because a collapsed range at the start of an empty line has no rect —
  and it keeps the caret inside the band between the bar and the keyboard.
  Driven from `selectionchange`, never from a keystroke, because the caret also
  moves by arrow, by tap and by the handles on a phone.
- **A caret at the front of a line goes into the text, not in front of the
  control.** `contenteditable=false` children — the box on a task — are
  positions the caret can legally occupy, and everything typed there lands
  outside the text. `settleCaret` moves it into the first text node before
  anything else reads the selection.
- **The selection bar sits under the words, not over them.** Above is where a
  bar like this usually goes and it is wrong here: on a phone the selection is
  made with a thumb and the line above is often what is being compared against.
  Only when there is no room below does it go back above, which is the one case
  where covering something beats being off the screen.
- **What is still to do is a tab, not a feature inside a note.** Nobody writes
  their tasks in one place; they write them where they happened. `lib/actions.ts`
  reads every note at once, and the two groups are kept apart on purpose: a box
  somebody drew is certain and ticking it here ticks it there, and a line of
  prose is this app reading words — so it says why it was picked and the only
  thing offered is turning it into a box. Nothing is moved, nothing is copied
  into a second list, and the note it came from is named on the row, because a
  task without its context is a line somebody has to go and re-read anyway.
- **The Actions tab is complete before the model is asked anything.** The list
  is built on the device, offline, free and identical every time. The model is
  one button that puts it in an order, it is pressed and never automatic, and
  it is given only the lines and the note names — never the notes. A screen
  that spends money when somebody glances at it is a screen they stop opening.
- **Actions are grouped by note, and a group goes at once.** Six lines from
  Tuesday's meeting are one piece of work with one set of names and one reason
  for existing; scattered through a flat list of forty they are six separate
  things to reconstruct. It is also what makes "I am finished with this
  meeting" one press instead of six — and that press asks, because several of
  those lines are writing rather than boxes.
- **Turning down a suggestion must never touch a word of what was written.**
  Getting rid of a box means taking that line out of the note, because the box
  *is* the line. A suggestion is only this app's guess about a line, so no is
  remembered in `lib/dismissed.ts` — beside the theme, on the device — and the
  line stays exactly where it was. A screen of guesses that can delete writing
  is a screen nobody should swipe on.
- **What is done is folded away, not thrown away.** A list that keeps
  everything ever finished at the bottom of it gets longer forever, and a list
  that silently discards it cannot answer "did I actually do that" — which is a
  real question, and the tick is the only record of the answer. So it is one
  quiet line that opens, every item can be put back, and clearing it for good
  is a deliberate press that asks.
- **A favourite is a way of looking at your notes, not a place to go.** It was
  a top-level tab, and before that a shelf on top of the list, and both said
  the same wrong thing — that the notes you keep coming back to live somewhere
  other than your notes. The tabs are places (Notes, Actions, World); the pills
  under Notes are the same notes seen three ways (All, Favourites, Dashboard),
  and they are drawn differently on purpose, because a second row of tabs would
  say there were six places when there are three.
- **Whether a note is read for tasks is asked while it is written.**
  `ignoreTasks` on the note, absent by default, because a diary and a page of
  quotes are notes too and the Actions tab reading them is noise nobody asked
  for. It is asked in the box, at the one moment somebody knows what kind of
  note this is, and changeable afterwards from the note's own ⋯ — and it leaves
  the note exactly as it was: not hidden, not changed, simply not one of the
  notes that question is asked of. `gatherActions` and `gatherDone` both honour
  it through one helper, because two places deciding which notes are in scope
  is two places to disagree.
- **A sparkle is not a picture of anything.** It is the badge every app now
  puts on whatever a model touched, and it says "this is the AI bit" — a fact
  about how the thing was built rather than about what it does. The button that
  orders the Actions list wears an arrow ordering a list. The same test applies
  to anything added later: draw the job, not the implementation.
- **The screen does not explain its own privacy in small print.** "Only these
  lines are sent, never your notes" was true, and it was a footnote under a
  button asking to be trusted — which is where a notice goes when the design
  cannot make the point on its own. What is sent is in `digest`, and it is one
  function with the reason written above it.
- **A way in that only appears after something else has been pressed is not a
  way in.** Listing a note in the World was a tickbox inside the ⋯ that
  appeared only once a link existed, so the route to the World began with a
  row that does not mention the World — and nobody found it. Sharing is one
  panel now, opened from a row that says what it does, and both answers are
  in it whether or not either is on. The test for anything added here: can
  somebody who wants it find it without already knowing where it is.
- **A panel opened from the ⋯ is not drawn inside the ⋯.** The menu closes on
  a press outside itself, so a panel rendered within it is unmounted by the
  first press anywhere in it. The note owns the share panel; the menu asks
  for it. Anything else opened from a menu goes the same way.
- **A button pressed while somebody is typing must not take the focus.** Every
  button steals it, and a phone takes the keyboard down with it — so the
  switch in the writing box threw people out of the note they were writing
  and moved the box half a screen. `preventDefault` on **mousedown** is what
  stops the focus moving; the click still arrives. It applies to every control
  that sits beside a field somebody is in the middle of using.
- **Taking a line out of a note asks first, and is undoable for five
  seconds.** Both, not one: the question stops the swipe nobody meant, the
  undo covers the yes that was pressed too fast, and only the second of those
  catches the commonest mistake. `withoutBlocks`/`withBlocksBack` in
  `lib/blocks.ts` hold the ordering, the emptied-note case and the
  put-it-back-twice case, with no React around them. The undo lives in the
  component for as long as the bar is up and is never written anywhere: a
  saved undo is a second, invisible copy of somebody's writing. Past five
  seconds the answer is the note's own Ctrl+Z, which has had it all along.
- **A save is the only number the World keeps.** Not views, not likes, not
  followers, and no record of who saved what — the World is ordered by date
  on purpose, so no counter decides what anybody sees. `world_saved()` adds
  one and returns nothing, and it is called after the note is already safely
  the reader's: a counter that failed must never look like a save that did
  not happen.
- **A link share and a World listing are two decisions, and one is never
  implied by the other.** `listed` on the shared row is the whole difference,
  it defaults to false, and publishing without it leaves a note exactly as
  private as it was. Turning a listing off leaves the link working for whoever
  already has it, because those people were given it on purpose.
- **Reading `shared_docs` is limited to what is listed, plus your own.** A
  policy of `using (true)` was fine while nobody could enumerate the table and
  wrong the moment the anon key was in a bundle: one unfiltered select returned
  every link-shared note there was. A link is served by `shared_doc(id)`, a
  security-definer function that can return the one row whose id you already
  have — the id is the secret, as it always was. Never widen that select policy
  to make the World easier to query.
- **A note saved out of the World is a copy, and nothing more.** New ids, your
  note, on your device. It does not follow the original, the original changing
  does not change it, and the original being taken down does not take it with
  it. A row in somebody's list that another person can edit or delete is not a
  thing a notes app may have.
- **The World is searched by the server; your own notes never are.** Your notes
  are already on the device, so the index is local — see `lib/search.ts`. The
  World is everybody's and unbounded, so downloading it to search it is the one
  thing that could not be made fast: it is a generated tsvector, a GIN index
  and a page of twenty rows carrying a stored two-line preview each. Never
  select `blocks` or `body` to draw a list.
- **The dashboard's own numbers are local; the World's arrive late or not at
  all.** What you have put into the World and how many copies were taken of it
  are facts about a server and cannot be anything else, so they are their own
  section, fetched after the page is already complete, and absent when they
  cannot be had. A dashboard showing a spinner where a number should be looks
  broken every time somebody opens it on a train.
- **The dashboard is counted on the device, and every number is one the reader
  could check.** `lib/stats.ts`, pure, unit-tested, no network and no model —
  the same bargain as the icons and the kinds. Its boxes are every box in every
  live note, deliberately not the Actions tab's list, which is capped per note
  and filtered by what somebody turned down: right for a list to read, and a
  lie to print.
- **No palette, on the dashboard least of all.** Green says what kind of note
  something is and yellow marks a searched word; a dashboard is exactly where
  a third and fourth colour creep in, and the moment they do neither of the
  first two means anything. Bars are ink at two weights, and a day with nothing
  on it is a hairline rather than a gap.
- **A tab nobody has opened is not in the first download.** The World and the
  dashboard are `next/dynamic`, like the sign-in client and the PDF reader, and
  `npm run e2e` asserts both are absent from a page that has never pressed
  their tab. Keep it that way for anything added beside them.
- **An install is offered by the app as well as by the browser.** Chrome's
  own offer is a 16-pixel icon at the end of the address bar that most people
  have never looked at, and on an iPhone there is no offer at all — it is two
  taps inside the Share menu. `beforeinstallprompt` is caught at module scope
  in `lib/install.ts`, never in an effect: it fires once, early, often before
  hydration, and a listener added afterwards is one that missed it. The
  button appears only when there is something to do and is gone for good once
  the app is installed or the offer has been answered — anything still
  sitting in the bar after somebody has said no is furniture.
- **Every manifest icon was `maskable`, which is why nothing offered to
  install it.** Maskable is a different promise — "crop me to whatever shape
  this platform uses" — and Chrome needs a 192 and a 512 PNG with
  `purpose: "any"` before it will offer at all. They are declared both ways
  now, and `npm run e2e` checks the manifest for it, because this is the kind
  of thing that breaks silently and is noticed months later.
- **The manifest is read out on the install prompt and then sits under the
  icon forever.** It described a spreadsheet, a code editor and a form
  builder for months after all three were taken out of the app. Its name,
  description and theme colour are part of the app, not metadata.
- **The device belongs to whoever last signed in, and it remembers that.**
  IndexedDB is the store, not a cache, and it knew nothing about accounts —
  so signing out left every note on the device and signing in as somebody
  else showed them and then *uploaded* them into the new account, because
  signing in pushes what is on the device up. `lib/handover.ts` stamps an
  owner beside the notes: a different account arriving wipes first and fills
  from the server after, and a device with no owner is somebody's own notes
  written before they had an account, which are adopted exactly as before.
  Nothing is ever merged — there is no honest way to merge two people's
  notes.
- **A wipe takes the sync cursors with it.** The quiet half of the same bug:
  a cursor is "the newest row this device has accepted", so one left behind
  from another account makes the next account's first pull ask only for rows
  newer than it, and every older note silently never arrives. `clearAll()`
  empties every store including `meta`, and the in-memory fallbacks with
  them.
- **Signing out pushes before it clears, and clears only if that worked.**
  That order is the whole safety of it: a failed push means notes that exist
  nowhere else, and clearing those because somebody pressed Sign out on a
  train is the worst thing this app could do. So a clean sign-out leaves an
  empty browser and a failed one keeps the notes and says so — and either
  way the next account to sign in wipes what is left before showing
  anything.
- **The theme survives a hand-over; a name does not.** The theme and the
  page width are about this screen. A name somebody typed and the
  suggestions they turned down are about *them*, and the first is printed
  across the top of the screen — "Hi, Ada" to whoever signs in next is the
  complaint. Both are cleared through their own stores rather than by
  removing the key: these are read through `useSyncExternalStore`, and a key
  removed behind its back leaves the old value on screen.
- **An installed app is not a tab somebody closes.** It is resumed rather
  than reopened, so it will run a version from three deploys ago until
  something makes it reload. `lib/update.ts` checks on opening, every half
  hour, and on coming back after a while away, and then *offers* — it never
  reloads on its own, because somebody may be halfway through a sentence.
- **The service worker waits to be told before taking over.** It used to
  call `skipWaiting()` on install, which sounds like "updates arrive
  promptly" and is actually "the page you are typing into is now served by a
  different version of the app than the one running in it". It takes a
  `skip-waiting` message instead, sent when somebody presses Update.
- **The button that opened a panel is not "outside" it.** Half of the
  outside-press rule, and the half that kept being missed: pressing the ⋯ a
  second time closed the menu on pointerdown and then the button's own click
  toggled it straight back open, so the control that opened it could not
  shut it. `components/dismiss.ts` is the shared hook and it takes the
  trigger as well as the panel. Every panel opened from a control uses it.
- **Team mode is a mode, not a fourth tab.** A team is a different thing the
  app is for, with its own screen and its own rules about who sees what; a
  tab beside Notes and Actions would say it was one more list of yours, and
  the first question anybody would have is whether their notes are now
  shared. They are not, and nothing in Team mode reads, moves or copies a
  note. Mine is the default and everything in it still works with no account
  at all.
- **A task has to be a thing somebody actually said.** The rule the team
  chat lives or dies by, and it is written three times on purpose: the
  device reads the message with string rules, the prompt tells the model to
  pick lines out rather than think of any, and `keepOnlyReal` then throws
  away anything made of words the message did not contain. A model asked to
  pull tasks out of a conversation will eventually add the obvious next one
  — and on a team's board that is a job with somebody else's name against it
  that nobody agreed to, which is how a whole list stops being believed.
  Never loosen that check to catch more tasks; missing one costs a manual
  add, inventing one costs the feature.
- **The chat is the record and the tasks are a reading of it.** The message
  is saved first and separately, and everything after it is best effort: the
  reading failing must never cost somebody the thing they said. Every task
  carries the message it came from, so it can always be traced back to the
  sentence that was typed.
- **A team's dates are the words somebody wrote**, the same as everywhere
  else here. "Friday" is not turned into a date, because which Friday was
  meant is not something this knows and a wrong date on another person's
  task is worse than a vague one.
- **You cannot look somebody up by email from a browser, and must not try.**
  `auth.users` is not readable with the anon key and never should be. So a
  member added by address is a row with no user id, and `claim_invites()` —
  security definer, matching on the address in the caller's own token —
  attaches it the first time they sign in. That is why somebody added while
  they are asleep simply has the team waiting for them.
- **Membership is checked by one function.** `in_team()` is security
  definer, because a policy on `team_members` that reads `team_members` to
  decide is infinitely recursive and Postgres only says so at query time.
  One function called by every policy is also one place to be wrong instead
  of twelve.
- **One swipe, written once.** `swipe-away.tsx` is the shared gesture: the
  distance, the slop, the word that slides in underneath, and the three ways it
  goes wrong (capturing on pointerdown kills every button inside; a vertical
  drag belongs to the scroller; the click that completes the gesture has to be
  swallowed). A gesture that behaves differently in two places in the same app
  is a gesture nobody trusts. `note-row.tsx` keeps its own copy because it is
  welded into the one list this app is built around; everything after it uses
  this.

## Checking work

`npm test` covers the line beautifier, the compose parsing, the search index,
the transcript handling and the page's read-back.
`npm run e2e` drives a real browser through every feature and is the one that
catches what the others cannot — caret behaviour, saving, and whether a note
survives a reload. Run both before claiming something works.
