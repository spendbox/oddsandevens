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
 * Four things go through it, and nothing else: writing up a note somebody
 * dashed off into the box, tidying a transcript of what was said, answering a
 * question from extracts of somebody's own notes, and putting the outstanding
 * things across every note into an order. It used to rewrite prose as well —
 * expand this, tidy that — and that whole vocabulary is gone: an editor that
 * rewrites the sentence you are in the middle of is one people switch off, and
 * what a page of notes is actually for is reading it back and deciding what
 * happens next.
 *
 * Like every other optional piece of this app, it degrades rather than breaks.
 * With no key the GET below reports `configured: false`, and every caller has
 * an answer it can produce on the device: a name taken from the opening line,
 * a transcript written in as it was heard, and the Actions tab’s own list,
 * which is read off the notes by `lib/actions.ts` before the model is asked
 * anything at all.
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

/**
 * A note typed into the box, written up properly.
 *
 * ## What this is for
 *
 * People write notes at the speed they think: "mtg sam re lease fri — need
 * the service charge figures, check break clause, he wants an answer by the
 * 20th". That is a perfectly good note and a terrible thing to read three
 * weeks later. This turns it into what they would have written if they had
 * had five minutes: a name, full sentences, and the things to do as a list.
 *
 * ## The line it must not cross
 *
 * Every fact has to already be in what they typed. Expanding "mtg" to
 * "meeting" and breaking a run-on into bullets is writing it up; adding a
 * decision nobody took, a date nobody gave or a name nobody wrote is making
 * something up, and one invented line in a note about a lease is worth more
 * damage than every minute this saves.
 */
const COMPOSE_SYSTEM =
  'Somebody has typed a note quickly, in shorthand, and pressed save. You write it up as the ' +
  'note they would have written with five more minutes.\n\n' +
  'Return ONLY this, exactly:\n' +
  'TITLE: <a short name for the note, at most eight words, no full stop>\n' +
  '<blank line>\n' +
  '<the note itself, as markdown>\n\n' +
  'The note:\n' +
  '- Full sentences, in their own voice and their own vocabulary. Expand the obvious ' +
  'shorthand ("mtg" to "meeting", "re" to "about") and fix the spelling and punctuation.\n' +
  '- Use "## " headings only where there is genuinely more than one subject, and "- " bullets ' +
  'for lists of things. A three-line note stays three lines: do not pad it out with headings ' +
  'it does not need.\n' +
  '- Anything they plainly have to do becomes "- [ ] " so it is a box to tick.\n' +
  '- Keep any day or date in the words they used — do not turn "Friday" into a date.\n\n' +
  'Rules, in order of importance:\n' +
  '1. Add no fact. Every name, number, sum, date, decision and action you return must be in ' +
  'what they typed. If the note is three words, return three words tidied up.\n' +
  '2. Take nothing out. Every point they made has to survive.\n' +
  '3. No preamble, no commentary, no "here is your note", no closing remark.\n' +
  '4. Keep the language it was written in.'

/** A quickly typed note in; a name and a written-up note out. */
async function compose(text: string) {
  const result = await complete({
    system: COMPOSE_SYSTEM,
    user: text,
    // The answer is about as long as the input rather than a summary of it.
    maxTokens: 3000,
    // Tidying somebody's own words is a reading task, and it is the one thing
    // in this app a person is actually waiting on with the box still open.
    effort: 'low',
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

/**
 * Everything still to be done, sharpened.
 *
 * ## What the model is and is not doing here
 *
 * The list already exists without it. `lib/actions.ts` reads every note on the
 * device and comes back with the boxes nobody has ticked and the lines that
 * read like commitments — free, offline, instant, and the same every time. So
 * this is not what makes the Actions tab work; it is what makes it worth
 * reading when there are forty items on it, which is the point at which a list
 * of everything stops being a list of what to do.
 *
 * It is pressed, never automatic. Somebody with nine hundred notes should not
 * be charged for a request every time they glance at a tab, and a screen that
 * cannot be opened without a network is not a screen this app is allowed to
 * have.
 *
 * ## What it is given
 *
 * The lines and the names of the notes they came from, and nothing else — see
 * `digest` in lib/actions.ts. Not the notes. The collection does not leave the
 * machine to be told what to do next, for the same reason it does not leave it
 * to be searched.
 */
const ACTIONS_SYSTEM =
  'Somebody keeps their notes in a notes app. It has read all of them and pulled out every ' +
  'unticked box and every line that reads like something they said they would do. You are ' +
  'given that list and you tell them what to do about it.\n\n' +
  'Return ONLY markdown, in this shape:\n' +
  '- Three to six "- " bullets, each one thing to do, most pressing first.\n' +
  '- Start each bullet with the thing itself, in the imperative. Where the list gives a day ' +
  'or a date, put it at the end in brackets, in the words it was written in.\n' +
  '- Where several items are plainly the same piece of work, say so in one bullet rather ' +
  'than repeating them.\n' +
  '- If something in the list looks stale or already done, you may say so in its bullet. Say ' +
  'it plainly; do not guess at why.\n\n' +
  'Rules, in order of importance:\n' +
  '1. Add nothing. Every task, name, number and date you return must be in the list you were ' +
  'given. You are ordering and grouping what is there, not thinking of more.\n' +
  '2. No preamble, no heading, no closing remark, no offer of further help.\n' +
  '3. No assessment of how much they have to do and no encouragement. They can see the list.\n' +
  '4. Keep the language the list is written in.'

/** A list of what is outstanding in; a short, ordered read of it out. */
async function actions(list: string) {
  const text = await complete({
    system: ACTIONS_SYSTEM,
    user:
      `Today is ${new Date().toISOString().slice(0, 10)}.\n\n` +
      `Everything outstanding across my notes:\n\n${list}`,
    maxTokens: 1200,
    // Deciding what matters most out of forty half-related lines is a
    // judgement, which is the one kind of thing worth paying the extra for.
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
    /** The outstanding list, when the action is 'actions'. */
    list?: string
    sources?: Source[]
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
    What to do next, read off the list of everything outstanding. Only the
    lines go — never the notes they came out of.
  */
  if (body.action === 'actions') {
    const list = (body.list ?? '').trim()
    if (!list) {
      return NextResponse.json({ error: 'There is nothing outstanding.' }, { status: 400 })
    }
    if (list.length > MAX_INPUT_CHARS) {
      return NextResponse.json({ error: 'Too much at once.' }, { status: 413 })
    }
    try {
      return await actions(list)
    } catch (error) {
      return failure(error)
    }
  }

  /*
    A note typed into the box, written up. The one action here that makes a
    note rather than reading one back.
  */
  if (body.action === 'compose') {
    const typed = (body.text ?? '').trim()
    if (!typed) {
      return NextResponse.json({ error: 'There is nothing to write up.' }, { status: 400 })
    }
    if (typed.length > MAX_INPUT_CHARS) {
      return NextResponse.json(
        { error: 'That note is too long to write up in one go.' },
        { status: 413 },
      )
    }
    try {
      return await compose(typed)
    } catch (error) {
      return failure(error)
    }
  }

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
