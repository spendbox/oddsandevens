import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { NextResponse } from 'next/server'

/**
 * Writing help, served from the server so the API key never reaches a browser.
 *
 * A key in client code is a key anyone can read out of the bundle and spend.
 * That is the whole reason this is a route rather than a direct call from the
 * editor, and why the key is read from the environment here and nowhere else.
 *
 * Like every other optional piece of this app, it degrades rather than breaks:
 * with no key configured the GET below reports `configured: false` and the
 * interface says so plainly instead of offering a button that fails.
 *
 * ## Which model
 *
 * GPT-4o, from `OPENAI_API_KEY`. Anthropic is kept as a fallback rather than
 * deleted, because anyone who already had `ANTHROPIC_API_KEY` set would
 * otherwise wake up to an app whose writing help had silently disappeared —
 * and the cost of keeping it is one branch in `complete` below. Whichever
 * answers, the rest of this file and every caller in the browser is unchanged:
 * text goes in, replacement text comes out.
 */

/** The model this app asks for by default. */
const MODEL = 'gpt-4o'
/** What the fallback asks for when only an Anthropic key is configured. */
const FALLBACK_MODEL = 'claude-opus-5'

export const runtime = 'nodejs'
/** Never cached: every request is different and none should be stored. */
export const dynamic = 'force-dynamic'

/**
 * What the writer asked for. Each maps to one instruction below.
 *
 * Expanding is the one this exists for, so it gets the longest instruction and
 * the most guardrails. "Expand" is where an assistant most easily goes wrong:
 * the failure is not too few words, it is a paragraph of filler that says
 * nothing the note did not already say, in a voice the author would not use.
 * The instruction below is written against that failure specifically.
 */
const ACTIONS = {
  expand: {
    label: 'Expand',
    instruction:
      'Expand this into fuller prose. This is the most important thing you do, so do it ' +
      'properly:\n' +
      '- Develop the author’s own point. Draw out the reasoning that is already implied, ' +
      'name the consequence they are gesturing at, give the concrete case behind the ' +
      'abstraction. Every sentence you add must carry information the original did not.\n' +
      '- Write in their voice. Match their vocabulary, sentence length, contractions, ' +
      'spelling convention and level of formality. If they write in short blunt sentences, ' +
      'do not hand back long balanced ones.\n' +
      '- Do not pad. No "it is important to note", no "in today\u2019s fast-paced world", no ' +
      'restating the input as an opening sentence, no summarising it as a closing one.\n' +
      '- Do not invent facts, figures, dates, names, quotations or citations. Where a ' +
      'specific is needed and you do not have it, write the sentence so the gap is obvious ' +
      'and fillable rather than filling it with something plausible.\n' +
      '- Keep roughly to two or three times the length of what you were given, unless the ' +
      'input is a single fragment, in which case a solid paragraph is right.',
  },
  continue: {
    label: 'Continue writing',
    instruction:
      'Carry on from where this stops, as the same person, mid-thought. Return ONLY the ' +
      'continuation — do not repeat, restate or summarise any part of what you were given, ' +
      'because it is already on the page directly above what you write.\n' +
      '- Pick up the sentence if it was left unfinished; otherwise start the next one.\n' +
      '- Match the voice exactly, and keep going in the same direction rather than ' +
      'introducing a new topic or winding the piece up.\n' +
      '- Two or three sentences, or one short paragraph. Stop while it is still going ' +
      'somewhere; the author is going to keep typing.\n' +
      '- Invent no facts, figures, names or quotations.',
  },
  tidy: {
    label: 'Tidy up',
    instruction:
      'Fix the punctuation, grammar, spelling and capitalisation. Break walls of text into ' +
      'paragraphs where the subject changes. Keep the author’s voice, vocabulary and meaning ' +
      'exactly as they are — this is a clean-up, not a rewrite. Do not add ideas, do not ' +
      'remove content, and do not change the register from informal to formal or the reverse.',
  },
  shorten: {
    label: 'Make it shorter',
    instruction:
      'Say the same thing in fewer words. Cut padding, repetition and throat-clearing. Keep ' +
      'every distinct point the author made — losing one is a failure, not a saving.',
  },
  bullets: {
    label: 'As bullet points',
    instruction:
      'Turn this into a markdown bulleted list, one point per line, using "- ". Each bullet ' +
      'is one idea in the author’s own words, shortened but not rewritten. Do not add points ' +
      'that were not there and do not merge two distinct ones into a single bullet.',
  },
  structure: {
    label: 'Add structure',
    instruction:
      'Organise this into sections with markdown headings, and turn any run of parallel items ' +
      'into a bulleted or numbered list. Keep the wording as close to the original as the new ' +
      'structure allows.',
  },
  summarise: {
    label: 'Summarise',
    instruction:
      'Summarise this in a few sentences, or a short markdown list where it covers several ' +
      'separate things. Report what it says; add no judgement, no recommendation and no ' +
      'closing remark. Use the author’s own terms for things rather than translating them ' +
      'into more general ones.',
  },
  draft: {
    label: 'Write a draft',
    instruction:
      'Write a first draft on the topic given. Use markdown headings and lists where they help. ' +
      'Be concrete and specific; prefer plain words. Do not invent statistics, quotations, ' +
      'citations or names — if a figure is needed, describe what should go there instead.',
  },
  /*
    Whatever the writer typed into the box.

    It is an instruction from the person whose document this is, applied to
    their own text, which is why it is carried through as an instruction. It
    still lands inside the same system prompt as everything else, so it cannot
    change what this route is: text goes in, replacement text comes out.
  */
  custom: {
    label: 'Your instruction',
    instruction: '',
  },
} as const

export type AiAction = keyof typeof ACTIONS

/**
 * A crude per-address limit.
 *
 * The key behind this route is ours to pay for, so an open endpoint is an open
 * invoice. In-memory means it resets on deploy and is per-instance, which is
 * the honest limit of it: enough to stop a stuck loop or a casual script, not
 * a defence against someone determined. A real deployment should put a proper
 * limiter in front.
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20
const seen = new Map<string, { count: number; until: number }>()

function overLimit(key: string): boolean {
  const now = Date.now()
  const entry = seen.get(key)
  if (!entry || now > entry.until) {
    seen.set(key, { count: 1, until: now + WINDOW_MS })
    // Opportunistic sweep, so the map cannot grow without bound.
    if (seen.size > 5000) {
      for (const [id, value] of seen) if (now > value.until) seen.delete(id)
    }
    return false
  }
  entry.count++
  return entry.count > MAX_PER_WINDOW
}

function clientKey(request: Request): string {
  const headers = request.headers
  // The last entry of x-forwarded-for is the one added by our own proxy; the
  // first is whatever the client claimed, which anyone can set.
  const forwarded = headers.get('x-forwarded-for')
  const last = forwarded?.split(',').pop()?.trim()
  return headers.get('x-vercel-forwarded-for') ?? last ?? 'unknown'
}

function openAiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null
}

function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null
}

function configured(): boolean {
  return openAiKey() !== null || anthropicKey() !== null
}

/** Lets the interface know whether to offer this at all. */
export async function GET() {
  return NextResponse.json({ configured: configured() })
}

/** A model declined to answer. Reported as a refusal rather than a fault. */
class Refused extends Error {}

/**
 * One request to whichever model is configured.
 *
 * Every caller in this file goes through here, so there is one place that
 * knows which provider is in use, one place that turns a refusal into an
 * exception, and one place to change when the answer to "which model" changes
 * again. `effort` is only meaningful to the Anthropic fallback; GPT-4o has no
 * such knob and ignores it, which is the honest thing for a shared signature
 * to do rather than pretending both providers have the same controls.
 */
async function complete(options: {
  system: string
  user: string
  maxTokens: number
  effort?: 'low' | 'medium' | 'high'
}): Promise<string> {
  const openai = openAiKey()
  if (openai) {
    const client = new OpenAI({ apiKey: openai })
    const answer = await client.chat.completions.create({
      model: MODEL,
      max_tokens: options.maxTokens,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
    })
    const choice = answer.choices[0]
    // A policy decline arrives as an ordinary 200 with the text in its own
    // field, so it has to be checked before the content is read.
    if (choice?.message?.refusal) throw new Refused(choice.message.refusal)
    return (choice?.message?.content ?? '').trim()
  }

  const client = new Anthropic({ apiKey: anthropicKey() ?? '' })
  /*
    Streaming, then awaiting the final message.

    Nothing is streamed to the browser — the editor replaces blocks in one
    step, so a half-finished rewrite on screen would only flicker. Streaming
    the request is still the right call: a long expansion can outlast the
    SDK's HTTP timeout on a non-streaming call.
  */
  const stream = client.messages.stream({
    model: FALLBACK_MODEL,
    max_tokens: options.maxTokens,
    output_config: { effort: options.effort ?? 'medium' },
    system: options.system,
    messages: [{ role: 'user', content: options.user }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Refused('declined')
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
}

/** Long inputs are refused rather than silently truncated. */
const MAX_INPUT_CHARS = 24_000

/**
 * One numbered extract from the reader's own notes.
 *
 * Retrieval happens in the browser, against the local index, so the whole
 * collection never comes near this route — only the handful of passages that
 * bear on the question. That is what keeps a question about one meeting from
 * sending ten years of notes, and what keeps the cost of asking flat however
 * much somebody has written.
 */
interface Source {
  n: number
  title: string
  text: string
  updatedAt: number
}

const ASK_SYSTEM =
  'You answer questions about a person’s own notes, using only the numbered extracts they ' +
  'give you.\n\n' +
  'Rules, in order of importance:\n' +
  '1. Every factual claim must come from an extract, and must carry its number in square ' +
  'brackets, like [2]. Cite the specific extract, not all of them.\n' +
  '2. If the extracts do not answer the question, say so in one sentence and say what they do ' +
  'cover. Never fill a gap with what is usually true — the whole value of this is that it ' +
  'reports what THEY wrote, not what is generally the case.\n' +
  '3. Where the notes disagree with each other, say so and cite both.\n' +
  '4. Answer in a few sentences, or a short markdown list when the question asks for several ' +
  'things. No preamble, no restating of the question, no closing offer of further help.\n' +
  '5. Write as if to the person who wrote the notes: "you decided", not "the author decided".'

/** Turns the extracts into the numbered block the model reads. */
function sourceBlock(sources: Source[]): string {
  return sources
    .map((source) => {
      const when = Number.isFinite(source.updatedAt)
        ? new Date(source.updatedAt).toISOString().slice(0, 10)
        : 'unknown date'
      return `[${source.n}] "${source.title}" (last written ${when})\n${source.text}`
    })
    .join('\n\n')
}

/** One document waiting to be filed: what it was called, and how it starts. */
interface Intake {
  n: number
  name: string
  excerpt: string
}

const FILE_SYSTEM =
  'You are filing documents somebody has just dropped into a personal library. For each one ' +
  'you are given the filename it arrived with and the opening of its contents.\n\n' +
  'Return ONLY a JSON array, no prose and no code fence, of objects with exactly these keys:\n' +
  '  n       the number you were given for that document, unchanged\n' +
  '  title   what the document should be called: what it IS, in at most eight words\n' +
  '  summary one plain sentence saying what it covers\n' +
  '  topic   one or two words for the subject, reused across documents of the same subject\n\n' +
  'Rules:\n' +
  '- The filename is a hint, not an answer. Many of these are called scan_0012 or Document (3); ' +
  'when the contents disagree with the filename, the contents win.\n' +
  '- Describe, never invent. If the opening is too little to tell, title it from what is ' +
  'actually there rather than guessing at what the rest might be.\n' +
  '- Use the language the document is written in.\n' +
  '- Give the same topic to documents that belong together, and a distinct one to a document ' +
  'that belongs with nothing else. Topics are how these get grouped, so being consistent ' +
  'matters more than being clever.\n' +
  '- Return one entry for every document, in the order given.'

/** Titles and summarises a batch of freshly imported documents. */
async function file(items: Intake[]) {
  const text = await complete({
    system: FILE_SYSTEM,
    user: items
      .map((item) => `[${item.n}] filename: ${item.name}\nopening:\n${item.excerpt}`)
      .join('\n\n'),
    maxTokens: 4000,
    // Naming a thing from its first page is a reading task, not a reasoning
    // one, and this runs over a whole batch at once.
    effort: 'low',
  })
  if (!text) {
    return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
  }
  return NextResponse.json({ text })
}

const SUGGEST_SYSTEM =
  'Somebody is part-way through writing a document and has written down what they want it to ' +
  'do. You read the draft against those goals and say what to do next.\n\n' +
  'Return ONLY a plain list, one suggestion per line, each starting with "- ". No preamble, no ' +
  'heading, no closing remark, no explanation of your reasoning.\n\n' +
  'Rules:\n' +
  '- At most four suggestions, and fewer is better. Three obvious ones are worth less than one ' +
  'that names the actual problem.\n' +
  '- Each is one short imperative sentence, under about fifteen words, and describes something ' +
  'the writer could do in the next minute: "Say what the boiler does now", "Cut the second ' +
  'paragraph, it repeats the first".\n' +
  '- Work from THIS draft against THESE goals. Never give writing advice that would be true of ' +
  'any document; if a goal is already met, say nothing about it rather than praising it.\n' +
  '- Do not rewrite anything, do not quote the draft back, and do not invent facts the draft ' +
  'does not contain.\n' +
  '- If the draft is too empty to judge, return a single line saying what to write first.'

/**
 * What to do next, read off the draft and what it is for.
 *
 * Suggestions only — nothing here can touch the document, which is the rule
 * every piece of writing help in this app keeps. See AGENTS.md.
 */
async function suggest(goals: string[], title: string, text: string) {
  const result = await complete({
    system: SUGGEST_SYSTEM,
    user:
      (title.trim() ? `The document is titled "${title.trim()}".\n\n` : '') +
      `What it is meant to do:\n${goals.map((goal) => `- ${goal}`).join('\n')}\n\n` +
      `The draft so far:\n\n${text}`,
    maxTokens: 600,
    // Reading a draft against a stated aim is a judgement, and a suggestion
    // that would fit any document at all is the failure to write against.
    effort: 'high',
  })
  if (!result) {
    return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
  }
  return NextResponse.json({ text: result })
}

/** Answers a question from extracts of the reader's own notes. */
async function ask(question: string, sources: Source[]) {
  const text = await complete({
    system: ASK_SYSTEM,
    user:
      `Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
      `Extracts from my notes:\n\n${sourceBlock(sources)}\n\n` +
      `My question: ${question}`,
    maxTokens: 2000,
    // Higher than the writing actions: pulling one answer out of eight notes
    // that half-agree is the part of this app that is actually a reasoning
    // problem, and a wrong answer with a citation on it is worse than none.
    effort: 'high',
  })
  if (!text) {
    return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
  }
  return NextResponse.json({ text })
}

export async function POST(request: Request) {
  if (!configured()) {
    return NextResponse.json(
      {
        error:
          'Writing help is not set up on this copy of Pad. Add an OPENAI_API_KEY to turn it on.',
      },
      { status: 501 },
    )
  }

  if (overLimit(clientKey(request))) {
    return NextResponse.json(
      { error: 'That is a lot of requests at once. Try again in a minute.' },
      { status: 429 },
    )
  }

  let body: {
    action?: string
    text?: string
    title?: string
    /** What the writer typed into the box, when the action is 'custom'. */
    instruction?: string
    /**
     * The document around the passage being worked on.
     *
     * Sent separately from `text` and never rewritten: expanding one paragraph
     * well means knowing what the paragraph before it already said, or the
     * expansion opens by explaining something the reader read ten seconds ago.
     */
    context?: string
    question?: string
    sources?: Source[]
    items?: Intake[]
    /** What the document is for, when the action is 'suggest'. */
    goals?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 })
  }

  /*
    Asking a question of the notes, rather than rewriting a passage of them.
    It shares this route because it shares the thing worth protecting: the key.
  */
  if (body.action === 'ask') {
    const question = (body.question ?? '').trim()
    const sources = Array.isArray(body.sources) ? body.sources : []
    if (!question) {
      return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 })
    }
    if (!sources.length) {
      return NextResponse.json(
        { error: 'There is nothing written yet to answer from.' },
        { status: 400 },
      )
    }
    const size = sources.reduce((total, source) => total + (source.text?.length ?? 0), 0)
    if (size > MAX_INPUT_CHARS) {
      return NextResponse.json({ error: 'Too much context at once.' }, { status: 413 })
    }
    try {
      return await ask(question, sources)
    } catch (error) {
      return failure(error)
    }
  }

  /*
    Filing a batch of freshly imported documents. Only the opening of each one
    is sent — enough to say what a thing is, which is all a title needs.
  */
  if (body.action === 'file') {
    const items = Array.isArray(body.items) ? body.items.slice(0, 25) : []
    if (!items.length) {
      return NextResponse.json({ error: 'There is nothing to file.' }, { status: 400 })
    }
    const size = items.reduce((total, item) => total + (item.excerpt?.length ?? 0), 0)
    if (size > MAX_INPUT_CHARS) {
      return NextResponse.json({ error: 'Too much at once. Add them in smaller batches.' }, { status: 413 })
    }
    try {
      return await file(items)
    } catch (error) {
      return failure(error)
    }
  }

  /*
    What to do next, given what this document is for. It shares this route for
    the same reason everything else does: the key is the thing worth keeping
    on a server.
  */
  if (body.action === 'suggest') {
    const goals = (Array.isArray(body.goals) ? body.goals : [])
      .filter((goal): goal is string => typeof goal === 'string' && !!goal.trim())
      .slice(0, 8)
      .map((goal) => goal.trim().slice(0, 200))
    const draft = (body.text ?? '').trim()
    if (!goals.length) {
      return NextResponse.json(
        { error: 'Say what this document is for first.' },
        { status: 400 },
      )
    }
    if (draft.length > MAX_INPUT_CHARS) {
      return NextResponse.json({ error: 'That document is too long to read at once.' }, { status: 413 })
    }
    try {
      return await suggest(goals, body.title ?? '', draft)
    } catch (error) {
      return failure(error)
    }
  }

  const action = body.action as AiAction
  if (!action || !(action in ACTIONS)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }

  const asked = (body.instruction ?? '').trim().slice(0, 600)
  if (action === 'custom' && !asked) {
    return NextResponse.json({ error: 'Say what you would like done.' }, { status: 400 })
  }

  const text = (body.text ?? '').trim()
  if (!text) {
    return NextResponse.json({ error: 'There is nothing to work on yet.' }, { status: 400 })
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      {
        error: `That is ${Math.round(text.length / 1000)}k characters. Select a smaller part — the limit is ${MAX_INPUT_CHARS / 1000}k.`,
      },
      { status: 413 },
    )
  }

  try {
    const result = await complete({
      system:
        'You improve writing inside a document editor. Return ONLY the revised text, with no ' +
        'preamble, no explanation, no apology and no closing remark — whatever you return is ' +
        'inserted directly into the document.\n\n' +
        'Use markdown for structure: # for headings, - for bullets, 1. for numbered lists, blank ' +
        'lines between paragraphs. Do not wrap the whole answer in a code fence.\n\n' +
        'Match the language, spelling convention and tone of the input. If the input is in ' +
        'British English, stay in British English.\n\n' +
        'You may be shown the surrounding document for context. It is there so your answer ' +
        'fits what is already written; never rewrite it, repeat it or refer to it.',
      user:
        `${ACTIONS[action].instruction || asked}\n\n` +
        (action !== 'custom' && asked ? `Also: ${asked}\n\n` : '') +
        (body.title?.trim() ? `The document is titled "${body.title.trim()}".\n\n` : '') +
        (body.context?.trim()
          ? `For context, the document around it reads:\n\n${body.context.trim().slice(0, 6000)}\n\n`
          : '') +
        `Here is the text:\n\n${text}`,
      maxTokens: 8000,
      /*
        Tidying prose is a latency-sensitive edit, not a reasoning problem;
        medium keeps it quick without making it careless. Expanding is the
        exception: it is the one action where the work is deciding what the
        author meant and what is worth adding, and a thin expansion is exactly
        the failure that makes people stop pressing the button. Only the
        Anthropic fallback has this knob; GPT-4o ignores it.
      */
      effort: action === 'expand' ? 'high' : 'medium',
    })

    if (!result) {
      return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
    }

    return NextResponse.json({ text: result })
  } catch (error) {
    return failure(error)
  }
}

/** Turns whatever went wrong into something a reader can act on. */
function failure(error: unknown) {
  // A decline is not a fault, and saying so is the difference between "try
  // rephrasing" and "something is broken".
  if (error instanceof Refused) {
    return NextResponse.json(
      { error: 'That request was declined. Try rephrasing what you are asking for.' },
      { status: 422 },
    )
  }
  // Most specific first, so a rate limit is not reported as a generic fault.
  // Both providers are checked, because either may be the one configured.
  if (error instanceof OpenAI.AuthenticationError || error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: 'The configured API key was rejected.' }, { status: 502 })
  }
  if (error instanceof OpenAI.RateLimitError || error instanceof Anthropic.RateLimitError) {
    return NextResponse.json(
      { error: 'The writing service is busy. Try again in a moment.' },
      { status: 429 },
    )
  }
  if (error instanceof OpenAI.APIError || error instanceof Anthropic.APIError) {
    return NextResponse.json(
      { error: `The writing service returned an error (${error.status}).` },
      { status: 502 },
    )
  }
  return NextResponse.json(
    { error: 'Could not reach the writing service. Your work is untouched.' },
    { status: 502 },
  )
}
