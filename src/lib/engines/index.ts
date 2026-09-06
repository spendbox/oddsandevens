import { z } from 'zod'
import {
  assistantSpec,
  calculatorSpec,
  directorySpec,
  generatorSpec,
  quizSpec,
  trackerSpec,
} from './specs'

export * from './specs'

export const ENGINE_IDS = [
  'calculator',
  'quiz',
  'generator',
  'tracker',
  'directory',
  'assistant',
] as const

export type EngineId = (typeof ENGINE_IDS)[number]

type EngineDefinition = {
  id: EngineId
  name: string
  emoji: string
  /** One line, for the person choosing. */
  blurb: string
  /** What this engine is right for — used both in the picker and by the classifier. */
  suits: string
  examples: string[]
  schema: z.ZodType
  /** Extra direction Claude gets when building a tool of this kind. */
  guidance: string
}

export const ENGINES: Record<EngineId, EngineDefinition> = {
  calculator: {
    id: 'calculator',
    name: 'Calculator',
    emoji: '🧮',
    blurb: 'Someone enters numbers, the tool works something out.',
    suits: 'Anything where the answer is arithmetic on what the person tells you.',
    examples: [
      'Import duty on a car coming into Nigeria',
      'Monthly loan repayments',
      'Profit margin on a product',
      'Pregnancy due date',
    ],
    schema: calculatorSpec,
    guidance: [
      'Ask for the fewest inputs that still give an honest answer. Every extra box loses people.',
      'Formulas are arithmetic only. Put currency and units in the `unit` field, never in the formula.',
      'Use if() for bands and thresholds — tax brackets, tiered rates, minimum fees.',
      'Break a complicated sum into several outputs, so the person sees where the number came from.',
      'Exactly one output has is_primary true.',
      'If the real rules vary by place or change yearly, say so in `note` rather than pretending otherwise.',
    ].join('\n'),
  },
  quiz: {
    id: 'quiz',
    name: 'Quiz or assessment',
    emoji: '📋',
    blurb: 'Someone answers questions and gets a result.',
    suits: 'Scoring a person against a scale: readiness, health, personality, suitability.',
    examples: [
      'Business health check',
      'Financial wellness assessment',
      'Which career suits you',
      'Study readiness quiz',
    ],
    schema: quizSpec,
    guidance: [
      'Between five and ten questions. Fewer feels thin, more gets abandoned.',
      'Every question offers the same number of options, scored consistently, so totals mean something.',
      'The result bands must cover every possible total with no gaps and no overlaps.',
      'Write results that tell somebody what to do next, not just what they scored.',
      'For anything touching health or money, say plainly in the result that this is not professional advice.',
    ].join('\n'),
  },
  generator: {
    id: 'generator',
    name: 'Generator',
    emoji: '📄',
    blurb: 'Someone fills in a form and gets a finished document.',
    suits: 'Turning a few answers into something they can send, sign, print or keep.',
    examples: ['Invoice', 'Business plan', 'Client proposal', 'Tenancy agreement'],
    schema: generatorSpec,
    guidance: [
      'Write the template as a document that would already be usable if nothing else happened to it.',
      'Use {{field_key}} exactly where an answer belongs. Never leave a blank line for someone to fill in.',
      'polish_with_ai is true for anything that needs prose written around the answers, false for ' +
        'anything where the exact wording and figures must survive untouched.',
      'Keep the form short. Ask for what you cannot reasonably infer or template.',
    ].join('\n'),
  },
  tracker: {
    id: 'tracker',
    name: 'Tracker',
    emoji: '📊',
    blurb: 'Someone records things over time and sees how it is going.',
    suits: 'Anything logged repeatedly: money, habits, health, stock, study.',
    examples: ['Daily expenses', 'Medication doses', 'Weight over time', 'Shop stock levels'],
    schema: trackerSpec,
    guidance: [
      'Three or four fields. A tracker that takes a minute to fill in is a tracker nobody fills in.',
      'Every summary points at a field that exists, and only sum or average a number.',
      'Pick summaries somebody would actually want at a glance — the total, the average, the last one.',
    ].join('\n'),
  },
  directory: {
    id: 'directory',
    name: 'Directory',
    emoji: '🗂',
    blurb: 'A searchable list the creator curates.',
    suits: 'Information worth gathering in one place and keeping current.',
    examples: ['Scholarships for Nigerian students', 'Remote jobs', 'Wedding vendors', 'Suppliers'],
    schema: directorySpec,
    guidance: [
      'Exactly one column has is_title true — the name of the thing listed.',
      'Four to seven columns. Make filterable the ones somebody would narrow by, like location or category.',
      'Use "tag" for a short category, "link" for a URL, "long_text" for a description.',
    ].join('\n'),
  },
  assistant: {
    id: 'assistant',
    name: 'AI assistant',
    emoji: '✨',
    blurb: 'An expert that answers questions in the creator\'s domain.',
    suits: 'Knowledge and judgement that would otherwise need the creator in the room.',
    examples: [
      'Nigerian tenancy law explainer',
      'WAEC study coach',
      'CV improvement assistant',
      'Grant writing helper',
    ],
    schema: assistantSpec,
    guidance: [
      'Write instructions in the second person, addressed to the assistant.',
      'Be specific about what it should refuse and when it should tell somebody to see a professional.',
      'Say what it should do when it does not know — never invent a figure, a citation, or a rule.',
      'Put facts that must not drift — rates, deadlines, procedures — in knowledge, not instructions.',
    ].join('\n'),
  },
}

export const ENGINE_LIST = ENGINE_IDS.map((id) => ENGINES[id])

export function isEngineId(value: string): value is EngineId {
  return (ENGINE_IDS as readonly string[]).includes(value)
}

/**
 * Parse a spec against its engine. Everything read from the database goes
 * through here — a spec is data somebody generated, not a promise.
 */
export function parseSpec<T = unknown>(engine: EngineId, spec: unknown): T | null {
  const result = ENGINES[engine].schema.safeParse(spec)
  return result.success ? (result.data as T) : null
}

export const ACCENTS = {
  indigo: { bg: 'bg-[#eef0ff]', text: 'text-[#4a44c9]', solid: 'bg-[#5b53e8]', ring: 'ring-[#ddd9fb]' },
  emerald: { bg: 'bg-[#e9f7ef]', text: 'text-[#15803d]', solid: 'bg-[#16a34a]', ring: 'ring-[#c7ebd5]' },
  amber: { bg: 'bg-[#fff4e5]', text: 'text-[#b45309]', solid: 'bg-[#f59e0b]', ring: 'ring-[#f6dfb6]' },
  rose: { bg: 'bg-[#fdeef4]', text: 'text-[#be123c]', solid: 'bg-[#e11d48]', ring: 'ring-[#f6c9d3]' },
  sky: { bg: 'bg-[#e9f5fd]', text: 'text-[#0369a1]', solid: 'bg-[#0284c7]', ring: 'ring-[#bfe0f5]' },
  violet: { bg: 'bg-[#f4eefd]', text: 'text-[#7c3aed]', solid: 'bg-[#7c3aed]', ring: 'ring-[#ded0fa]' },
} as const

export type AccentName = keyof typeof ACCENTS

export function accent(name: string) {
  return ACCENTS[(name as AccentName) in ACCENTS ? (name as AccentName) : 'indigo']
}
