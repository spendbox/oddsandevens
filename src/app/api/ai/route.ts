import Anthropic from '@anthropic-ai/sdk'
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
 */

export const runtime = 'nodejs'
/** Never cached: every request is different and none should be stored. */
export const dynamic = 'force-dynamic'

/** What the writer asked for. Each maps to one instruction below. */
const ACTIONS = {
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
  expand: {
    label: 'Expand on this',
    instruction:
      'Develop what is there into fuller prose, keeping the author’s argument and adding ' +
      'nothing they would disagree with. Where a point is asserted without support, draw out ' +
      'the reasoning already implied rather than inventing new facts.',
  },
  structure: {
    label: 'Add structure',
    instruction:
      'Organise this into sections with markdown headings, and turn any run of parallel items ' +
      'into a bulleted or numbered list. Keep the wording as close to the original as the new ' +
      'structure allows.',
  },
  draft: {
    label: 'Write a draft',
    instruction:
      'Write a first draft on the topic given. Use markdown headings and lists where they help. ' +
      'Be concrete and specific; prefer plain words. Do not invent statistics, quotations, ' +
      'citations or names — if a figure is needed, describe what should go there instead.',
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

function apiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY?.trim() || null
}

/** Lets the interface know whether to offer this at all. */
export async function GET() {
  return NextResponse.json({ configured: apiKey() !== null })
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

/** Answers a question from extracts of the reader's own notes. */
async function ask(client: Anthropic, question: string, sources: Source[]) {
  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 2000,
    // Higher than the writing actions: pulling one answer out of eight notes
    // that half-agree is the part of this app that is actually a reasoning
    // problem, and a wrong answer with a citation on it is worse than none.
    output_config: { effort: 'high' },
    system: ASK_SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
          `Extracts from my notes:\n\n${sourceBlock(sources)}\n\n` +
          `My question: ${question}`,
      },
    ],
  })

  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') {
    return NextResponse.json(
      { error: 'That request was declined. Try rephrasing what you are asking for.' },
      { status: 422 },
    )
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
  if (!text) {
    return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
  }
  return NextResponse.json({ text })
}

export async function POST(request: Request) {
  const key = apiKey()
  if (!key) {
    return NextResponse.json(
      {
        error:
          'Writing help is not set up on this copy of Pad. Add an ANTHROPIC_API_KEY to turn it on.',
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
    question?: string
    sources?: Source[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: key })

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
      return await ask(client, question, sources)
    } catch (error) {
      return failure(error)
    }
  }

  const action = body.action as AiAction
  if (!action || !(action in ACTIONS)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
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
    /*
      Streaming, then awaiting the final message.

      Nothing is streamed to the browser — the editor replaces blocks in one
      step, so a half-finished rewrite on screen would only flicker. Streaming
      the request is still the right call: a long expansion can outlast the
      SDK's HTTP timeout on a non-streaming call.
    */
    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 8000,
      // Tidying prose is a latency-sensitive edit, not a reasoning problem;
      // medium keeps it quick without making it careless.
      output_config: { effort: 'medium' },
      system:
        'You improve writing inside a document editor. Return ONLY the revised text, with no ' +
        'preamble, no explanation, no apology and no closing remark — whatever you return is ' +
        'inserted directly into the document.\n\n' +
        'Use markdown for structure: # for headings, - for bullets, 1. for numbered lists, blank ' +
        'lines between paragraphs. Do not wrap the whole answer in a code fence.\n\n' +
        'Match the language, spelling convention and tone of the input. If the input is in ' +
        'British English, stay in British English.',
      messages: [
        {
          role: 'user',
          content:
            `${ACTIONS[action].instruction}\n\n` +
            (body.title?.trim() ? `The document is titled "${body.title.trim()}".\n\n` : '') +
            `Here is the text:\n\n${text}`,
        },
      ],
    })

    const message = await stream.finalMessage()

    // A policy decline arrives as a normal 200 with this stop reason, so it
    // has to be checked before the content is read.
    if (message.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: 'That request was declined. Try rephrasing what you are asking for.' },
        { status: 422 },
      )
    }

    const result = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()

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
  // Most specific first, so a rate limit is not reported as a generic fault.
  if (error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: 'The configured API key was rejected.' }, { status: 502 })
  }
  if (error instanceof Anthropic.RateLimitError) {
    return NextResponse.json(
      { error: 'The writing service is busy. Try again in a moment.' },
      { status: 429 },
    )
  }
  if (error instanceof Anthropic.APIError) {
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
