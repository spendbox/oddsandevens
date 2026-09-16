import { docLabel } from './blocks.ts'
import { blockText, type Block, type Doc } from './types.ts'

/**
 * A picture for a document, worked out from what the document is.
 *
 * ## Why this is a table of words and not a model call
 *
 * An icon is worth something because it is recognised before it is read — a
 * column of twenty identical sheets of paper tells you nothing, and the eye
 * finds the little banknote long before it finds the word "invoice". But it is
 * worth almost nothing per document: getting it wrong costs a glance. Paying a
 * model to choose one, on every document, forever, for a decoration, is the
 * definition of a bad trade — and it would mean documents had no icon at all
 * until a network round trip finished, which is worse than the sheet of paper.
 *
 * So it is a lookup: a few dozen words that reliably mean a kind of document,
 * matched against the title first and the opening lines second. It is instant,
 * it is free, it works with no key and no network, and every rule in it is a
 * unit test rather than something somebody has to notice by eye.
 *
 * ## The order, which is the whole design
 *
 * 1. A document that is one attached file is that file — an image is a
 *    picture, a PDF is a document. Nothing about the words matters.
 * 2. The title, because a document with a title has already said what it is.
 * 3. The opening lines, for the many notes that never get a title.
 * 4. What the document is *made of*: mostly a spreadsheet, mostly code, mostly
 *    ticked boxes. A weaker signal than a word, which is why it is last.
 *
 * Only whole words count. Substring matching made every document containing
 * "planning" a plane ticket.
 */

/**
 * The icons this can choose from.
 *
 * Deliberately a short list of names rather than components, so this file has
 * no JSX and can be tested directly — the same reason `slash-items.ts` names
 * its icons instead of importing them. `doc-icon.tsx` does the resolving.
 */
export type DocIcon =
  | 'file'
  | 'image'
  | 'attachment'
  | 'money'
  | 'receipt'
  | 'calendar'
  | 'people'
  | 'travel'
  | 'home'
  | 'contract'
  | 'shopping'
  | 'food'
  | 'health'
  | 'study'
  | 'work'
  | 'code'
  | 'table'
  | 'tasks'
  | 'idea'
  | 'journal'
  | 'mail'
  | 'campaign'
  | 'place'
  | 'call'
  | 'celebration'
  | 'music'
  | 'fitness'
  | 'form'

/**
 * Words that mean a kind of document, most specific first.
 *
 * A word earns its place here only if it almost always means the same thing at
 * the top of a document. "Plan" is not here: a launch plan, a floor plan and a
 * meal plan share nothing. "Invoice" is, because an invoice is an invoice.
 */
const WORDS: Array<{ icon: DocIcon; words: string[] }> = [
  { icon: 'money', words: ['budget', 'budgets', 'invoice', 'invoices', 'salary', 'salaries', 'payroll', 'tax', 'taxes', 'expenses', 'expense', 'payment', 'payments', 'pricing', 'costs', 'finance', 'finances', 'financial', 'accounts', 'banking', 'refund'] },
  { icon: 'receipt', words: ['receipt', 'receipts', 'bill', 'bills', 'statement'] },
  { icon: 'contract', words: ['contract', 'contracts', 'agreement', 'agreements', 'lease', 'tenancy', 'deed', 'terms', 'policy', 'nda', 'legal', 'clause', 'licence', 'license', 'warranty'] },
  { icon: 'home', words: ['flat', 'apartment', 'house', 'rent', 'mortgage', 'landlord', 'property', 'tenant', 'boiler', 'renovation'] },
  { icon: 'calendar', words: ['meeting', 'meetings', 'agenda', 'schedule', 'appointment', 'standup', 'roadmap', 'timeline', 'itinerary', 'calendar', 'diary'] },
  { icon: 'people', words: ['interview', 'interviews', 'team', 'hiring', 'onboarding', 'candidate', 'candidates', 'staff', 'attendees', 'retro', 'retrospective', 'oneonone'] },
  { icon: 'travel', words: ['flight', 'flights', 'travel', 'trip', 'holiday', 'vacation', 'visa', 'passport', 'packing', 'hotel', 'booking'] },
  { icon: 'shopping', words: ['shopping', 'groceries', 'grocery', 'orders', 'wishlist', 'basket'] },
  { icon: 'food', words: ['recipe', 'recipes', 'menu', 'dinner', 'lunch', 'breakfast', 'cooking', 'ingredients', 'restaurant'] },
  { icon: 'health', words: ['health', 'doctor', 'medical', 'prescription', 'symptoms', 'dentist', 'hospital', 'therapy', 'clinic'] },
  // "training" is deliberately absent: a training course is a course.
  { icon: 'fitness', words: ['workout', 'workouts', 'gym', 'running', 'exercise', 'marathon'] },
  { icon: 'study', words: ['lecture', 'lectures', 'course', 'exam', 'exams', 'revision', 'homework', 'essay', 'thesis', 'syllabus', 'semester', 'coursework'] },
  { icon: 'work', words: ['cv', 'resume', 'application', 'job', 'career', 'promotion', 'appraisal', 'proposal', 'pitch', 'client'] },
  // "release" is absent: a press release is not a deployment.
  { icon: 'code', words: ['code', 'api', 'bug', 'bugs', 'deploy', 'deployment', 'repo', 'repository', 'schema', 'migration', 'endpoint', 'refactor', 'changelog'] },
  { icon: 'idea', words: ['idea', 'ideas', 'brainstorm', 'concepts', 'thoughts', 'sketch'] },
  // "book" is absent: you book a room far more often than you read one.
  { icon: 'journal', words: ['journal', 'reading', 'books', 'chapter', 'reflections', 'gratitude'] },
  // "draft" is absent: almost every first version of anything is one.
  { icon: 'mail', words: ['email', 'emails', 'letter', 'reply', 'newsletter', 'correspondence'] },
  { icon: 'campaign', words: ['marketing', 'campaign', 'launch', 'announcement', 'brand', 'advert'] },
  { icon: 'place', words: ['address', 'addresses', 'directions', 'location', 'venue', 'map'] },
  /*
    "call" and "numbers" are both absent, and both were in here once. "Notes
    from the call" is a meeting note and "Numbers" is a spreadsheet; a word
    that is a verb as often as a noun is not a signal.
  */
  { icon: 'call', words: ['contacts', 'phonebook', 'directory'] },
  { icon: 'celebration', words: ['birthday', 'wedding', 'party', 'gift', 'gifts', 'christmas', 'anniversary'] },
  { icon: 'music', words: ['playlist', 'song', 'songs', 'album', 'setlist', 'lyrics'] },
  { icon: 'tasks', words: ['todo', 'todos', 'tasks', 'checklist', 'actions'] },
]

/** Everything a match is tried against, lower-cased and split into words. */
function wordsOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Keep letters and digits; everything else is a separator. "one-on-one"
      // becomes three words, which is why "oneonone" is not the only spelling
      // this table carries for it.
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  )
}

/** The first icon whose vocabulary appears in this text, or nothing. */
export function iconForText(text: string): DocIcon | null {
  const found = wordsOf(text)
  if (!found.size) return null
  for (const rule of WORDS) {
    if (rule.words.some((word) => found.has(word))) return rule.icon
  }
  return null
}

/** How much of a document has to be one kind of block for that to say what it is. */
const MAJORITY = 0.5
/** How far into a document to read when it has no title worth matching. */
const OPENING_CHARS = 400

/** What the document is made of, when the words did not settle it. */
function iconForShape(blocks: Block[]): DocIcon | null {
  const real = blocks.filter((block) => block.type !== 'divider')
  if (!real.length) return null

  // One attachment and nothing else: the document *is* the file.
  const files = real.filter((block) => block.type === 'file')
  if (files.length === 1 && real.length === 1) {
    const only = files[0]
    if (only.type === 'file') {
      if (only.mime.startsWith('image/')) return 'image'
      return only.mime.includes('pdf') ? 'file' : 'attachment'
    }
  }

  const share = (type: Block['type']) =>
    real.filter((block) => block.type === type).length / real.length
  if (share('table') >= MAJORITY) return 'table'
  if (share('code') >= MAJORITY) return 'code'
  if (share('todo') >= MAJORITY) return 'tasks'
  if (share('form') >= MAJORITY) return 'form'
  return null
}

/**
 * The icon for a document.
 *
 * Never throws and never returns nothing: an unrecognised document is a sheet
 * of paper, which is what it was before any of this.
 */
export function iconFor(doc: Doc): DocIcon {
  // A document that is one file is that file, whatever it is called.
  const single = doc.blocks.filter((block) => block.type !== 'divider')
  if (single.length === 1 && single[0].type === 'file') {
    return iconForShape(doc.blocks) ?? 'attachment'
  }

  const fromTitle = iconForText(docLabel(doc))
  if (fromTitle) return fromTitle

  // The many notes that never get a title are read from the top instead. Only
  // the opening: a word thirty paragraphs down is what the document mentions,
  // not what it is about.
  const opening = doc.blocks
    .map(blockText)
    .filter(Boolean)
    .join(' ')
    .slice(0, OPENING_CHARS)
  const fromText = iconForText(opening)
  if (fromText) return fromText

  return iconForShape(doc.blocks) ?? 'file'
}
