import { APP_NAME } from './app.ts'

/**
 * What this app is, written for a model to read.
 *
 * ## Why it exists
 *
 * Brainstorm is asked about a piece of somebody's work, and the work is
 * often the app itself: "write the announcement for this", "how do I get
 * this in front of people", "draft the email telling the team about it".
 * A model that has never heard of this app answers those with a paragraph
 * of plausible software — the wrong features, in the wrong words, said with
 * complete confidence. Given this, it answers with what is actually here.
 *
 * It is also the honest place for the app to describe itself. Every other
 * account of what this does is scattered: a manifest, a README, a page of
 * conventions for whoever is writing the code. None of those is a
 * paragraph anybody would read out loud.
 *
 * ## Why it is one constant and not a folder of documents
 *
 * Because it has to stay true, and the only version of that which survives
 * a year is the one that is small enough to update in the same change as
 * the feature. It is a page of prose, it goes into one prompt, and
 * `FEATURES` below is the list a unit test checks it still covers — so a
 * screen added without a sentence here fails the tests rather than quietly
 * becoming a thing the model invents an answer about.
 *
 * ## The rule for changing it
 *
 * Add a feature, add its sentence, add its word to `FEATURES`. Take a
 * feature out, take its sentence out. Never describe something that is
 * planned: a model told about a screen that does not exist will tell
 * somebody to go and press it.
 */

/**
 * The parts of the app the description has to cover.
 *
 * One word each, matched case-insensitively against `ABOUT_APP` by the
 * test. It is a checklist rather than a schema on purpose: the point is to
 * notice the omission, not to generate the prose.
 */
export const FEATURES = [
  'notes',
  'actions',
  'world',
  'dashboard',
  'favourites',
  'search',
  'recorder',
  'teams',
  'brainstorm',
  'sharing',
  'trash',
  'sync',
  'install',
] as const

export const ABOUT_APP = `${APP_NAME} is a note-taking app. It has two screens: the list of
notes, and a note. Everything the reader sees is called a note — never a document or a file.

WHAT IS IN IT

- Notes. A note is a list of lines: paragraphs, headings, bullets, boxes to tick, quotes, a
  rule across the page. There is one writing surface and it is a page. Lines finish
  themselves as the caret leaves them — typing "- " makes a bullet, "# " a heading, "[]" a
  box — with no model involved. Notes are grouped in the list by the day they were written.
  A note with no title is called by its first line.
- Favourites. A star on a note. The same notes seen a different way, not a separate place.
- Actions. Everything still to be done, read out of every note at once and grouped under the
  note it came from. Two kinds: a box somebody drew, which is certain, and a line of prose
  the app read as a commitment, which is a suggestion the reader can accept or turn down.
  Both are read on the device with string rules, offline and free. A note can be marked so
  it is never read for tasks.
- Brainstorm. On the Actions screen. Pick one outstanding thing, answer a few questions
  about it, and the app works out a solution from the notes on the device — including
  drafting whatever would actually help: an email, an outline, a plan, a script. Only
  passages of the relevant notes are sent, never the collection.
- Search. One box, over every word in every note, on the device. It is also how a question
  is asked of the notes: the app finds the passages and only those go to the model, and
  every answer carries the note it came from.
- The recorder. A round black button that records and listens at once: the browser writes
  down the words live so the speaker can see it is hearing them, and the audio is
  transcribed properly when the recording stops. Nothing is invented — the write-up may
  punctuate and tidy, never add a fact.
- Sharing. A note can be published at a link, which is a read-only page. Separately, and
  never implied by it, a note can be listed in the World.
- The World. Notes people have deliberately listed for anybody to read, newest first,
  searchable. A note saved out of the World becomes a plain copy in your own notes: it does
  not follow the original and the original cannot change or delete it. The only number kept
  is how many copies were taken. No likes, no followers, no feed that decides what you see.
- The dashboard. Counts of your own writing, worked out on the device: how much, how often,
  what is outstanding, what is done. Plus how your notes have done in the World.
- Teams. A separate mode, not a tab: a team is a chat, and the work that comes out of it.
  Type what needs doing the way you would say it, with @ to name somebody, and it appears on
  the team's board with their name and the day against it. A task is only ever something
  somebody actually typed. Nothing in a team reads, moves or copies a note — notes stay
  private.
- The trash. A deleted note is recoverable for seven days.
- Sync. Notes live on the device first, in the browser's own storage, and work with no
  account at all. Signing in copies them so a second device can catch up.
- Install. It can be installed as an app on a phone or a desktop and works offline.

WHAT IT DELIBERATELY HAS NOT

No folders, no tags, no sidebar, no tree. No spreadsheet, code editor, form builder or file
attachments — all four existed once and all four were taken out. Nothing rewrites somebody's
sentences. Nothing runs a model without being pressed, and nothing about the app stops
working when there is no key, no account and no network.`
