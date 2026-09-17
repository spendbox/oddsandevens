import { docLabel } from './blocks.ts'
import { iconFor } from './doc-icon.ts'
import { blockText, type Doc } from './types.ts'

/**
 * What kind of note this is: a meeting, something to do, an idea, a person,
 * some research, or just a note.
 *
 * ## Why a note has a kind at all
 *
 * A list of twenty notes all called by their first line is a list you read
 * from the top every time. A kind is the one word that lets the eye skip: the
 * meeting from Tuesday is found by looking for meetings, not by reading four
 * titles. It is the same argument as the icons in `doc-icon.ts`, said out
 * loud — and it is shown as a word beside the icon precisely because a picture
 * on its own has to be learnt before it saves anybody anything.
 *
 * ## Six, and the sixth is "Note"
 *
 * The kinds are a closed list and a short one. A kind that has to be chosen
 * from a menu of thirty is filing, which is the work this is meant to save;
 * and a kind that is wrong costs a glance, which is why there is always
 * "Note" to fall back to rather than a guess nobody asked for.
 *
 * ## Why there is no model in it
 *
 * The same bargain as everything else here: the words are matched on the
 * device, instantly, offline, free, the same way every time, and every rule is
 * a unit test. A note has its kind the moment it has its first line, rather
 * than when a network round trip finishes — and a missing key costs nothing at
 * all, because there was never a key involved.
 */
export type NoteKind = 'meeting' | 'task' | 'idea' | 'person' | 'research' | 'note'

/** What each kind is called, in the one place that decides. */
export const KIND_LABELS: Record<NoteKind, string> = {
  meeting: 'Meeting',
  task: 'Task',
  idea: 'Idea',
  person: 'Person',
  research: 'Research',
  note: 'Note',
}

/**
 * Words that say what kind of note this is, most specific first.
 *
 * A word earns its place only if it nearly always means the same thing at the
 * top of a note. "Call" is not here, though a call is a meeting: "Call the
 * plumber" is a thing to do and "Call with Ama" is a meeting, and one word
 * cannot be both. "Review" is not here either — a code review, a performance
 * review and a review of a restaurant are three kinds of note.
 */
const WORDS: Array<{ kind: NoteKind; words: string[] }> = [
  {
    kind: 'meeting',
    words: [
      'meeting', 'meetings', 'standup', 'agenda', 'attendees', 'minutes', 'retro',
      'retrospective', 'workshop', 'kickoff', 'debrief', 'huddle', 'briefing',
      'catchup', 'oneonone', 'sync',
    ],
  },
  {
    kind: 'person',
    words: ['bio', 'profile', 'candidate', 'candidates', 'contacts', 'reference', 'references'],
  },
  {
    kind: 'research',
    words: [
      'research', 'findings', 'sources', 'literature', 'competitor', 'competitors',
      'benchmark', 'analysis', 'background', 'reading', 'paper', 'papers', 'survey',
      'interview', 'interviews',
    ],
  },
  {
    kind: 'task',
    words: [
      'todo', 'todos', 'tasks', 'checklist', 'actions', 'errands', 'packing',
      'shopping', 'groceries', 'grocery',
    ],
  },
  {
    kind: 'idea',
    words: ['idea', 'ideas', 'brainstorm', 'concept', 'concepts', 'thoughts', 'sketch'],
  },
]

/**
 * The kinds the picture already implies.
 *
 * `doc-icon.ts` carries a few hundred words that have been argued over and
 * tested; every one of them that plainly means a kind is read here rather than
 * typed out a second time in a table that could quietly disagree with it.
 */
const FROM_ICON: Partial<Record<ReturnType<typeof iconFor>, NoteKind>> = {
  calendar: 'meeting',
  people: 'meeting',
  tasks: 'task',
  shopping: 'task',
  idea: 'idea',
  study: 'research',
  journal: 'research',
  call: 'person',
  mail: 'person',
}

/** How far into a note to read when its title says nothing. */
const OPENING_CHARS = 400
/** How much of a note has to be boxes to tick for it to be a list of them. */
const MAJORITY = 0.5

/** Everything a match is tried against, lower-cased and split into words. */
function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
}

/** The first kind whose vocabulary appears in this text, or nothing. */
export function kindForText(text: string): NoteKind | null {
  const found = wordsOf(text)
  if (!found.size) return null
  for (const rule of WORDS) {
    if (rule.words.some((word) => found.has(word))) return rule.kind
  }
  return null
}

/**
 * The kind of a note.
 *
 * Never throws and never returns nothing: a note that says nothing about
 * itself is a note, which is what it was before any of this.
 */
export function kindOf(doc: Doc): NoteKind {
  const fromTitle = kindForText(docLabel(doc))
  if (fromTitle) return fromTitle

  // The many notes that never get a title are read from the top instead. Only
  // the opening: a word thirty paragraphs down is what the note mentions, not
  // what it is.
  const opening = doc.blocks.map(blockText).filter(Boolean).join(' ').slice(0, OPENING_CHARS)
  const fromText = kindForText(opening)
  if (fromText) return fromText

  /*
    What the note is made of, which is a weaker signal than a word and so is
    asked last. A page of boxes to tick is a list of things to do whatever it
    is called.
  */
  const real = doc.blocks.filter((block) => block.type !== 'divider')
  if (real.length) {
    const todos = real.filter((block) => block.type === 'todo').length
    if (todos / real.length >= MAJORITY) return 'task'
  }

  return FROM_ICON[iconFor(doc)] ?? 'note'
}
