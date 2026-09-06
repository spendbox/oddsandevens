import { z } from 'zod'

/**
 * What each kind of tool is made of.
 *
 * These schemas do two jobs at once. They are the contract Claude generates
 * against — passed to the API as a JSON schema, so the model cannot return a
 * shape the app then has to defend against — and they are the validator every
 * write goes through before a spec is trusted.
 *
 * Every field is required. Optional fields make a weaker schema for the model
 * to aim at, so "none" is an empty string or an empty array instead.
 */

const identifier = z
  .string()
  .describe('A short lowercase name with underscores, used to refer to this field in formulas.')

// ---------------------------------------------------------------------------
// Calculator — inputs, formulas, results
// ---------------------------------------------------------------------------

export const calculatorSpec = z.object({
  inputs: z
    .array(
      z.object({
        key: identifier,
        label: z.string().describe('What the person filling this in sees.'),
        help: z.string().describe('One short line of guidance, or an empty string.'),
        unit: z.string().describe('A unit or currency symbol shown beside the box, or empty.'),
        kind: z.enum(['number', 'choice']).describe('"choice" when the answer is one of a fixed set.'),
        default_value: z.number().describe('A sensible starting value. Use 0 if there is none.'),
        options: z
          .array(z.object({ label: z.string(), value: z.number() }))
          .describe('The choices, each with the number it stands for. Empty unless kind is "choice".'),
      }),
    )
    .describe('What the tool asks for.'),
  outputs: z
    .array(
      z.object({
        key: identifier,
        label: z.string(),
        formula: z
          .string()
          .describe(
            'Arithmetic over the input keys and earlier output keys. Allowed: + - * / % ^, ' +
              'comparisons, and min, max, round, floor, ceil, abs, sqrt, if(condition, then, otherwise). ' +
              'Nothing else — no words, no units, no currency symbols inside the formula.',
          ),
        unit: z.string().describe('Unit or currency shown with the answer, or empty.'),
        help: z.string().describe('One line explaining what this number means, or empty.'),
        is_primary: z.boolean().describe('True for the single headline answer.'),
      }),
    )
    .describe('What the tool works out. Later outputs may use earlier ones by key.'),
  note: z.string().describe('A caveat shown under the result, such as what it excludes. May be empty.'),
})

// ---------------------------------------------------------------------------
// Quiz — questions, scores, banded results
// ---------------------------------------------------------------------------

export const quizSpec = z.object({
  intro: z.string().describe('A sentence or two setting up the quiz.'),
  questions: z.array(
    z.object({
      prompt: z.string(),
      help: z.string().describe('Clarification, or an empty string.'),
      options: z
        .array(z.object({ label: z.string(), score: z.number() }))
        .describe('Answers, each carrying the points it is worth.'),
    }),
  ),
  results: z
    .array(
      z.object({
        min_score: z.number(),
        max_score: z.number(),
        title: z.string(),
        body: z.string().describe('What this result means, and what to do about it.'),
      }),
    )
    .describe(
      'Score bands, covering every possible total from the lowest to the highest with no gaps.',
    ),
})

// ---------------------------------------------------------------------------
// Generator — a form that produces a document
// ---------------------------------------------------------------------------

const formField = z.object({
  key: identifier,
  label: z.string(),
  help: z.string().describe('One short line, or empty.'),
  kind: z.enum(['text', 'long_text', 'number', 'date', 'choice']),
  options: z.array(z.string()).describe('The choices. Empty unless kind is "choice".'),
  required: z.boolean(),
})

export const generatorSpec = z.object({
  fields: z.array(formField).describe('What the tool needs to know.'),
  document_title: z.string().describe('The title of what is produced. May contain {{field_key}}.'),
  template: z
    .string()
    .describe(
      'The document, in Markdown, with {{field_key}} where an answer goes. Write it in full — ' +
        'headings, sections, real wording — so it is usable even without polishing.',
    ),
  polish_with_ai: z
    .boolean()
    .describe(
      'True when the filled-in template should be rewritten by Claude into finished prose ' +
        '(a proposal, a business plan). False when it should stay exactly as written (an invoice, a receipt).',
    ),
})

// ---------------------------------------------------------------------------
// Tracker — entries somebody keeps over time
// ---------------------------------------------------------------------------

export const trackerSpec = z.object({
  entry_noun: z.string().describe('What one entry is called, singular. "expense", "workout", "dose".'),
  fields: z
    .array(
      z.object({
        key: identifier,
        label: z.string(),
        kind: z.enum(['number', 'text', 'choice', 'yes_no']),
        unit: z.string().describe('Unit or currency, or empty.'),
        options: z.array(z.string()).describe('Empty unless kind is "choice".'),
      }),
    )
    .describe('What is recorded each time.'),
  summaries: z
    .array(
      z.object({
        label: z.string(),
        field_key: z.string().describe('Which field this summarises.'),
        kind: z.enum(['sum', 'average', 'count', 'latest']),
      }),
    )
    .describe('The few numbers shown at the top, worked out across all entries.'),
})

// ---------------------------------------------------------------------------
// Directory — a searchable list the creator curates
// ---------------------------------------------------------------------------

export const directorySpec = z.object({
  item_noun: z.string().describe('What one listing is called, singular. "scholarship", "doctor".'),
  columns: z.array(
    z.object({
      key: identifier,
      label: z.string(),
      kind: z.enum(['text', 'long_text', 'link', 'tag', 'number']),
      is_title: z.boolean().describe('True for exactly one column — the name of the listing.'),
      filterable: z.boolean().describe('True when people should be able to narrow the list by this.'),
    }),
  ),
})

// ---------------------------------------------------------------------------
// Assistant — an AI tool the creator shapes
// ---------------------------------------------------------------------------

export const assistantSpec = z.object({
  greeting: z.string().describe('The first thing the assistant says.'),
  instructions: z
    .string()
    .describe(
      'The assistant\'s standing instructions: who it is for, what it does, what it refuses, ' +
        'how it should answer. Write it as instructions to the assistant itself.',
    ),
  knowledge: z
    .string()
    .describe(
      'Reference material the assistant should treat as authoritative — rules, rates, ' +
        'procedures, definitions. Empty if the creator has not supplied any yet.',
    ),
  starters: z.array(z.string()).describe('Three or four example questions to get somebody going.'),
})

export type CalculatorSpec = z.infer<typeof calculatorSpec>
export type QuizSpec = z.infer<typeof quizSpec>
export type GeneratorSpec = z.infer<typeof generatorSpec>
export type TrackerSpec = z.infer<typeof trackerSpec>
export type DirectorySpec = z.infer<typeof directorySpec>
export type AssistantSpec = z.infer<typeof assistantSpec>
