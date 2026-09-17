import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { NextResponse } from 'next/server'

/**
 * The one server route, so the API key never reaches a browser.
 *
 * A key in client code is a key anyone can read out of the bundle and spend.
 * That is the whole reason this is a route rather than a direct call from the
 * editor, and why the key is read from the environment here and nowhere else.
 *
 * Three things go through it, and nothing else: turning a page of notes into a
 * plan, answering a question from extracts of somebody's own notes, and giving
 * a batch of imported files better titles. It used to rewrite prose as well —
 * expand this, tidy that — and that whole vocabulary is gone: an editor that
 * rewrites the sentence you are in the middle of is one people switch off, and
 * what a page of notes is actually for is reading it back and deciding what
 * happens next.
 *
 * Like every other optional piece of this app, it degrades rather than breaks.
 * With no key the GET below reports `configured: false`, and every caller has
 * an answer it can produce on the device: local titles in the Library, and a
 * plan read off the words with `lib/plan.ts`.
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

const PLAN_SYSTEM =
  'Somebody has written a page of notes. You read it back and say what happens next.\n\n' +
  'Return ONLY a plain list, one step per line, each line beginning with "you:" or "app:" and ' +
  'nothing else. No preamble, no heading, no numbering, no closing remark.\n\n' +
  'Which prefix:\n' +
  '- "you:" is a step only the person can take — ringing somebody, signing something, paying, ' +
  'deciding, turning up, asking another person for a thing.\n' +
  '- "app:" is a step a writing app could take from what is already on the page — drafting a ' +
  'message or a document, laying something out, summarising, putting a dated step in a ' +
  'calendar. Nothing else. It cannot browse, buy, send, or talk to a service.\n\n' +
  'Rules:\n' +
  '- At most eight steps, and fewer is better. Three that matter beat eight that pad.\n' +
  '- Each is one short imperative sentence, under about fifteen words.\n' +
  '- Work only from these notes. Add no step the notes do not imply, and invent no names, ' +
  'figures, dates or addresses.\n' +
  '- Where the notes give a date or a day, keep the writer\u2019s own words for it in the step.\n' +
  '- Order them the way they would actually be done.\n' +
  '- If the notes contain nothing to act on, return nothing at all.'

/**
 * Turns a page of notes into a plan.
 *
 * Suggestions only. Nothing this returns is carried out, and the panel that
 * shows it says so — the point is to read the notes back, not to act on them.
 */
async function plan(title: string, text: string) {
  const result = await complete({
    system: PLAN_SYSTEM,
    user:
      (title.trim() ? `The notes are titled "${title.trim()}".\n\n` : '') +
      `Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
      `The notes:\n\n${text}`,
    maxTokens: 800,
    // Deciding what somebody has actually committed to, and which half of that
    // a piece of software could take on, is a judgement rather than a reading
    // task — and a plan full of steps that were never in the notes is the
    // failure to write against.
    effort: 'high',
  })
  if (!result) {
    return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
  }
  return NextResponse.json({ text: result })
}

const DICTATION_SYSTEM =
  'Somebody spoke a paragraph or two into a document and a speech recogniser wrote it down. You ' +
  'turn that into what they would have typed.\n\n' +
  'Return ONLY the text, as markdown. No preamble, no heading, no explanation, no closing ' +
  'remark — whatever you return is put straight into their document.\n\n' +
  'Rules, in order of importance:\n' +
  '1. Change no meaning and add no content. Every fact, name, number and opinion in what you ' +
  'return must be in what you were given. You are punctuating, not writing.\n' +
  '2. Take out only what speech has and writing does not: "um", "uh", "like", "you know", "I ' +
  'mean", false starts, and a word repeated because they stumbled. Leave everything else in ' +
  'their own words, including their vocabulary and their level of formality.\n' +
  '3. Put in the punctuation, the capitals and the paragraph breaks. Break where the subject ' +
  'changes.\n' +
  '4. A run of things spoken as a list becomes a markdown list; otherwise keep it as prose. Do ' +
  'not invent structure a speaker did not use.\n' +
  '5. Where a word is plainly mis-heard and the right one is obvious from the sentence, fix it. ' +
  'Where it is not obvious, leave it exactly as it came — a confident wrong guess is worse than ' +
  'an obvious mis-hearing.\n' +
  '6. Keep the language it was spoken in.'

const MEETING_SYSTEM =
  'This is a speech recogniser\u2019s transcript of a meeting or a long spoken note. You turn it ' +
  'into notes somebody can read afterwards and find things in.\n\n' +
  'Return ONLY the notes, as markdown. No preamble, no title, no explanation, no closing ' +
  'remark — whatever you return is put straight into their document.\n\n' +
  'Shape:\n' +
  '- Short "## " headings for the subjects that were actually discussed, in the order they came ' +
  'up. Use the words the speakers used for things.\n' +
  '- Under each, bullets: what was said and what was decided. One point per bullet.\n' +
  '- Where something was agreed, say so plainly and name who agreed to it if the transcript ' +
  'says.\n' +
  '- End with "## Actions" and one bullet per thing somebody committed to, each starting with ' +
  'the person if the transcript names one. Keep any day or date in the words they said it in — ' +
  'do not turn "Friday" into a date.\n' +
  '- Leave the Actions heading out entirely if nobody committed to anything.\n\n' +
  'Rules:\n' +
  '1. Every line must come from the transcript. Invent no decision, no name, no figure, no date ' +
  'and no action. A meeting note that contains something nobody said is worse than no note.\n' +
  '2. Names, numbers, sums of money and dates are copied exactly. Where a name is plainly ' +
  'mis-heard, keep it as it came rather than guessing at the real one.\n' +
  '3. Cut the greetings, the small talk and the repetition; keep the substance.\n' +
  '4. Say nothing about the meeting itself — no "the team discussed", no "in summary", no ' +
  'assessment of how it went.\n' +
  '5. Keep the language it was spoken in.'

/**
 * A transcript in, something worth keeping out.
 *
 * Two jobs behind one action, because a paragraph spoken into a note and an
 * hour of conversation want opposite things: the first wants to read as though
 * it had been typed, and the second wants headings you can find your way
 * around. The caller decides which from the length — see `looksLikeMeeting` in
 * lib/dictation.ts — and both are told, in as many words, to add nothing.
 *
 * Long recordings arrive in parts, because an hour of speech is tens of
 * thousands of characters and one request for all of it is a timeout. Each
 * part is told where it sits so it does not open by repeating itself.
 */
async function notes(
  transcript: string,
  meeting: boolean,
  part: number,
  parts: number,
  title: string,
) {
  const where =
    parts > 1
      ? `This is part ${part} of ${parts} of one recording. Carry straight on: do not open by ` +
        'recapping what came before, and do not close by summarising.\n\n'
      : ''
  const result = await complete({
    system: meeting ? MEETING_SYSTEM : DICTATION_SYSTEM,
    user:
      (title.trim() ? `The document is titled "${title.trim()}".\n\n` : '') +
      where +
      `The transcript:\n\n${transcript}`,
    /*
      Generous, because the answer is the length of the input rather than a
      summary of it — a tidied paragraph is about as long as the paragraph.
    */
    maxTokens: 6000,
    /*
      Meetings get the reasoning, dictation does not. Deciding what was
      actually agreed in forty minutes of half-finished sentences is a
      judgement; putting full stops into two spoken paragraphs is not, and is
      the one of the two somebody is waiting on.
    */
    effort: meeting ? 'high' : 'low',
  })
  if (!result) {
    return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
  }
  return NextResponse.json({ text: result })
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
    /** The whole document, when the action is 'plan'. */
    text?: string
    title?: string
    question?: string
    sources?: Source[]
    items?: Intake[]
    /** Whether a transcript was a meeting rather than a dictated paragraph. */
    meeting?: boolean
    /** Which piece of a long recording this is, and how many there are. */
    part?: number
    parts?: number
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
  /*
    A transcript in, writing out. The recogniser in the browser does the
    listening; this is only ever handed the words it produced.
  */
  if (body.action === 'notes') {
    const transcript = (body.text ?? '').trim()
    if (!transcript) {
      return NextResponse.json({ error: 'Nothing was said.' }, { status: 400 })
    }
    if (transcript.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { error: 'That piece of the recording is too long. Send it in smaller parts.' },
        { status: 413 },
      )
    }
    try {
      return await notes(
        transcript,
        !!body.meeting,
        Number(body.part) || 1,
        Number(body.parts) || 1,
        body.title ?? '',
      )
    } catch (error) {
      return failure(error)
    }
  }

  /*
    A page of notes in, a plan out. The last thing in here that reads a whole
    document, and the only one anybody presses a button for.
  */
  if (body.action === 'plan') {
    const notes = (body.text ?? '').trim()
    if (!notes) {
      return NextResponse.json(
        { error: 'There is nothing written here yet.' },
        { status: 400 },
      )
    }
    if (notes.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        {
          error: `That is ${Math.round(notes.length / 1000)}k characters. The limit is ${MAX_INPUT_CHARS / 1000}k.`,
        },
        { status: 413 },
      )
    }
    try {
      return await plan(body.title ?? '', notes)
    } catch (error) {
      return failure(error)
    }
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
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
