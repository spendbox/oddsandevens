import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { ABOUT_APP } from '@/lib/about'
import { APP_NAME } from '@/lib/app'

/**
 * The one server route, so the API key never reaches a browser.
 *
 * A key in client code is a key anyone can read out of the bundle and spend.
 * That is the whole reason this is a route rather than a direct call from the
 * editor, and why the key is read from the environment here and nowhere else.
 *
 * A handful of things go through it and nothing else: writing up a note
 * somebody dashed off into the box, tidying a transcript of what was said,
 * answering a question from extracts of somebody's own notes, reading a team's
 * chat line for the work stated in it, and — the one that produces rather than
 * reads — thinking one outstanding thing through and drafting whatever would
 * actually help with it. It used to rewrite prose as well —
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
 * GPT-4o, from `OPENAI_API_KEY`, and that is the one to set: if both keys are
 * present, OpenAI wins. Anthropic is kept as a fallback rather than deleted,
 * because anyone who already had `ANTHROPIC_API_KEY` set would otherwise wake
 * up to an app whose writing help had silently disappeared — and the cost of
 * keeping it is one branch in `complete` below. Whichever answers, the rest of
 * this file and every caller in the browser is unchanged: text goes in,
 * replacement text comes out.
 */

/**
 * Which model, and why the cheap one is the default.
 *
 * GPT-4o from `OPENAI_API_KEY`, because it is what most people already have a
 * key for and it is inside the free allowance on a new account — which for an
 * app whose writing help is optional is the difference between people trying
 * it and people not.
 *
 * The Anthropic side picks by job rather than using one model for everything.
 * Punctuating a dictated paragraph and expanding "mtg" to "meeting" are
 * reading tasks: the small model does them as well as the large one and costs
 * a fraction, and it is also the faster of the two, which matters because it
 * is the one somebody is sitting and waiting for. Deciding what a question is
 * really asking is a judgement — so `effort: 'high'` is what moves the request
 * up to the middle model. Almost nothing here asks for the largest one: no
 * call in this app is agentic, none of them use tools, and paying top rates to
 * tidy speech is money for nothing.
 *
 * The exception is `effort: 'max'`, which exists for exactly one caller.
 * Brainstorm is asked to write the email rather than to describe it, from a
 * page of somebody's own notes, once, after they have deliberately chosen the
 * thing and answered questions about it. That is the one request here where a
 * better model is a different outcome rather than a nicer sentence.
 */
const MODEL = 'gpt-4o'
/**
 * What actually listens to the audio, when there is audio to listen to.
 *
 * The browser's own recogniser is still what runs while somebody is talking:
 * it is free, it is live, and it is the only thing that can answer "is it
 * hearing me" as they speak. But what it hands back is a stream of guesses
 * with no punctuation, and it mis-hears names, numbers and anything said
 * across another voice — which in a meeting is most of it. So the audio is
 * kept as well, and this is what it is sent to when the recording stops.
 *
 * `gpt-4o-transcribe` rather than `whisper-1`: better on names and accents,
 * and the same endpoint. Older accounts may not have it, so a model that
 * comes back unknown falls through to Whisper rather than costing somebody
 * their recording.
 */
const TRANSCRIBE_MODEL = 'gpt-4o-transcribe'
const TRANSCRIBE_FALLBACK = 'whisper-1'
/** The Anthropic fallback, for the reading jobs. Small, quick and cheap. */
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001'
/** And for the ones that are a judgement rather than a reading. */
const FALLBACK_THINKING_MODEL = 'claude-sonnet-5'
/**
 * And for the one job in this app that is neither reading nor judging.
 *
 * Brainstorm is asked to *produce* something — the email written out, the
 * plan drafted, the outline done — from somebody's notes and their answers
 * to three questions. It is the only place here where the difference
 * between a good model and a very good one is the difference between
 * something worth sending and something worth deleting, which is exactly
 * when paying for the largest is the cheap option: a solution nobody uses
 * cost the whole request.
 *
 * It is also the only place that could not be pressed by accident. One
 * item, chosen deliberately, after answering questions — so a page of
 * notes cannot quietly run up a bill on the largest model the way an
 * automatic tab would.
 */
const BIGGEST_MODEL = 'claude-opus-5'

export const runtime = 'nodejs'
/** Never cached: every request is different and none should be stored. */
export const dynamic = 'force-dynamic'
/**
 * How long a request here is allowed to take.
 *
 * Everything else in this file answers in a second or two, so the default
 * was never noticed. Brainstorm does not: it asks the largest model to
 * write an email out in full from a page of somebody's notes, and that is
 * routinely twenty to sixty seconds. A serverless function's default limit
 * is ten — so the platform killed the request, returned an HTML error page
 * the browser could not parse as JSON, and the screen reported a network
 * problem for something that was working perfectly and simply not finished.
 * That is the whole of "no solution ever appears".
 *
 * Sixty is the ceiling on the free tier and enough for every request here.
 * The client also reads a non-JSON reply as a timeout rather than as a dead
 * network, because a limit lower than this one is somebody else's to set.
 */
export const maxDuration = 60

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
/*
  Raised from 20 when transcription arrived. A long recording is uploaded a
  piece at a time the moment it stops — twelve pieces for an hour — and each
  piece is a request, so the old limit turned "you recorded a long meeting"
  into "that is a lot of requests at once".
*/
const MAX_PER_WINDOW = 40
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

/**
 * Whether audio can be transcribed, which is a narrower question than whether
 * a model is configured at all.
 *
 * Only OpenAI is asked to listen to anything. The Anthropic fallback has no
 * transcription endpoint, so a copy of Pad with only an `ANTHROPIC_API_KEY`
 * keeps the browser's recogniser and everything downstream of it — which is
 * exactly how the whole app behaved before this existed.
 */
function transcribes(): boolean {
  return openAiKey() !== null
}

/** Lets the interface know what to offer at all. */
export async function GET() {
  return NextResponse.json({ configured: configured(), transcribes: transcribes() })
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
  /**
   * How much model this job is worth.
   *
   * `low` is the default and nearly everything: punctuating speech,
   * expanding "mtg", reading a chat line for the task in it. `high` is the
   * two judgements — what a question is really asking, and what out of
   * forty lines matters first. `max` is Brainstorm, and only Brainstorm.
   */
  effort?: 'low' | 'medium' | 'high' | 'max'
}): Promise<string> {
  const openai = openAiKey()
  /*
    OpenAI wins, except for the one job that asks for the largest model.

    Everywhere else this app runs on GPT-4o, because that is the key most
    people already have and the small, quick model is the right one for
    reading tasks. But GPT-4o is not a large model, and Brainstorm's whole
    value is the quality of what comes back — so where there is an
    Anthropic key as well, that one request goes to Opus and everything
    else carries on going to OpenAI. With only an OpenAI key it is GPT-4o,
    which is a real answer rather than a broken screen; with only an
    Anthropic key it was always going this way anyway.
  */
  const biggest = options.effort === 'max' && anthropicKey() !== null
  if (openai && !biggest) {
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
  /*
    The job decides the model — see the note on both constants above — and the
    effort knob goes only to the model that has one. Sending `output_config` to
    a model that does not understand it is a 400 back, which would turn "the
    cheap model does the cheap jobs" into "writing help stopped working".
  */
  /*
    The job decides the model. `output_config` goes only to the middle one:
    it is what moves a mid-sized model up to a judgement, and the largest
    model does not need telling to think. Sending a parameter to a model
    that does not understand it is a 400 back, which would turn "the big
    job uses the big model" into "Brainstorm stopped working".
  */
  const thinking = options.effort === 'high'
  const stream = client.messages.stream({
    model:
      options.effort === 'max'
        ? BIGGEST_MODEL
        : thinking
          ? FALLBACK_THINKING_MODEL
          : FALLBACK_MODEL,
    max_tokens: options.maxTokens,
    ...(thinking ? { output_config: { effort: 'high' as const } } : {}),
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
 * One chat message, read for the work in it.
 *
 * ## What this is and is not allowed to do
 *
 * It picks lines out. It does not think of any. That is the entire
 * specification, and it is written three times — here, in the prompt, and
 * again in `keepOnlyReal` in lib/team-chat.ts, which throws away anything
 * that came back made of words the message did not contain.
 *
 * Belt and braces on purpose. A model asked to pull tasks out of a
 * conversation will eventually add the obvious next one: the follow-up
 * nobody mentioned, the reminder that usually goes with this kind of job. In
 * somebody's own notes that is annoying. On a team's board it is a piece of
 * work with another person's name against it that nobody agreed to, and the
 * whole list stops being believed the first time it happens.
 *
 * The device has already read the message with string rules before this is
 * asked anything, so this failing costs sharpness and never the list.
 */
const CHAT_SYSTEM =
  'You are given one message from a team chat. You list the tasks that are stated in it, and ' +
  'nothing else.\n\n' +
  'Return ONLY a JSON array, and nothing around it. Each element is an object with:\n' +
  '  "text": the task, in the imperative, in the words of the message\n' +
  '  "who": the name written after an @ for that task, or "" if none\n' +
  '  "due": any day, date or time phrase for that task, copied exactly as written, or ""\n\n' +
  'Return [] when the message states no tasks. Most messages state none, and [] is the right ' +
  'answer far more often than it feels like it should be.\n\n' +
  'Rules, in order of importance:\n' +
  '1. Every task must be something the message actually says somebody will do. Do not add the ' +
  'obvious next step, the usual follow-up, or anything that would normally go with this work. ' +
  'If it is not in the message, it does not exist.\n' +
  '2. Use the words of the message. You may drop "please" and "can you", and turn a question ' +
  'into an instruction. You may not introduce a noun that is not there.\n' +
  '3. One task per thing to do. A sentence with two jobs in it is two tasks; a sentence with ' +
  'one job described twice is one.\n' +
  '4. Copy any day or date exactly as written — "Friday", "end of month", "the 14th". Never ' +
  'turn it into a calendar date.\n' +
  '5. Discussion, opinions, questions, thanks and decisions already taken are not tasks.\n' +
  '6. Keep the language the message is written in.'

/** A message in; the tasks stated in it out, as rows the caller can use. */
async function chatTasks(message: string, names: string) {
  const text = await complete({
    system: CHAT_SYSTEM,
    user:
      (names ? `The people in this team: ${names}.\n\n` : '') +
      `The message:\n\n${message}`,
    maxTokens: 800,
    /*
      A reading, not a judgement — which is the cheap model's job, and it is
      also the one somebody is sitting and watching a chat for.
    */
    effort: 'low',
  })
  /*
    Parsed forgivingly, and never fatally. A model that wrapped its array in
    a code fence, or said "Here you go" first, must not cost somebody the
    tasks this device already found on its own — so anything unreadable comes
    back as an empty list rather than an error.
  */
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return NextResponse.json({ tasks: [] })
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    const rows = Array.isArray(parsed) ? parsed : []
    return NextResponse.json({
      tasks: rows
        .map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : {}))
        .map((row) => ({
          text: String(row.text ?? '').trim(),
          who: String(row.who ?? '').trim(),
          due: String(row.due ?? '').trim(),
        }))
        .filter((row) => row.text)
        .slice(0, 12),
    })
  } catch {
    return NextResponse.json({ tasks: [] })
  }
}

/* ------------------------------------------------------------ brainstorm */

/**
 * Brainstorm, which is two requests and deliberately not one.
 *
 * ## What it is
 *
 * The Actions tab had a button that answered "which of these first". It was
 * a fair question and a thin one — the answer re-ordered a list already on
 * the screen, and nobody read it twice. The question people actually have
 * about a line on that list is the next one along: *how do I do this*. So
 * this takes one item, reads what the notes say about it, asks the handful
 * of things only that person knows, and then produces the work: the email
 * written out, the plan drafted, the outline done.
 *
 * ## Why the questions are their own request, on the cheap model
 *
 * Because the notes never carry half of it. "Chase the landlord" has a
 * history that is not written down: what has already been said, whether
 * this is a first ask or a fourth, what would actually count as done. A
 * model that guesses at those writes a confident letter about the wrong
 * thing.
 *
 * Working out what is missing from a page is a reading task, and the cheap
 * model does it as well as the expensive one and faster — which matters,
 * because this is the half somebody sits and waits for. Writing the thing
 * afterwards is not a reading task, and it is the only request in this app
 * that asks for the largest model.
 *
 * ## The rule both halves are written against
 *
 * Nothing invented. Every fact, name, figure and date has to come from the
 * notes or from the answers, and where one is needed and missing the reply
 * leaves a marked blank rather than filling it in. A drafted email that
 * quotes a number nobody gave is worse than no draft, because it is the one
 * that gets sent.
 *
 * ## And it is allowed to say no
 *
 * A model asked to solve "sort out the thing" will produce a page of
 * plausible structure rather than admit there is nothing to work from, and
 * that page costs a read to discover it is empty. `CANNOT:` is a
 * first-class answer here, the prompt asks for it in as many words, and the
 * screen prints it as the answer rather than as a fault.
 */
const BRAINSTORM_QUESTIONS_SYSTEM =
  'Somebody keeps notes in an app and has picked one outstanding thing out of them to think ' +
  'through. Before anything is drafted, you ask them what the notes do not say.\n\n' +
  'Return ONLY the questions, one per line. EXACTLY THREE of them, always — not two, not four. ' +
  'No numbering, no preamble, no heading, no closing remark.\n\n' +
  'Rules, in order of importance:\n' +
  '1. Ask only what the extracts do not already answer. A question whose answer is in the ' +
  'notes wastes the one chance you have to ask.\n' +
  '2. Ask only what would change what you write for them. If the answer makes no difference ' +
  'to the draft, it is not worth asking.\n' +
  '3. Each question must be answerable in a sentence by somebody who has not prepared. No ' +
  'questions in parts, no questions asking them to go and look something up.\n' +
  '4. Prefer: what has already been tried or said, who it is really for, what would count as ' +
  'this being done, and what the actual constraint is.\n' +
  '5. Never ask for a password, a card number, a bank detail or anything else nobody should ' +
  'type into a box.\n' +
  '6. Keep the language the notes are written in.\n' +
  '7. Every line you return must end in a question mark, and there must be three of them. If ' +
  'the notes already answer most of what you would ask, ask the three that are still worth ' +
  'asking rather than returning fewer.'

const BRAINSTORM_SOLUTION_SYSTEM =
  'Somebody keeps notes in an app. They have picked one outstanding thing out of them, you ' +
  'have been given the passages of their notes that bear on it, the other things outstanding, ' +
  'and their answers to your questions. You do the work.\n\n' +
  'Return ONLY markdown. No preamble, no "here is what I would suggest", no closing offer of ' +
  'further help.\n\n' +
  'What to return:\n' +
  '- A short "## " heading for each part of the answer.\n' +
  '- Where the task is a thing that can be written — an email, a message, an agenda, an ' +
  'outline, a checklist, a script, a plan, a chapter — WRITE IT OUT IN FULL under its own ' +
  'heading, finished and ready to use. Do not describe what it should contain. This is the ' +
  'whole point: the draft is the answer.\n' +
  '- Then the steps to take, in order, each one a thing somebody does rather than a topic.\n' +
  '- Where something else outstanding is plainly part of the same piece of work, say so in ' +
  'one line and say what it changes.\n' +
  '- End with "## What I could not know" and one bullet per thing you had to leave open, ' +
  'only if there were any.\n\n' +
  'Rules, in order of importance:\n' +
  '1. Invent nothing. Every fact, name, figure, date, price, address and commitment must come ' +
  'from the notes or from their answers. Where the draft needs one you were not given, leave ' +
  'a marked blank like [the date] rather than filling it in. A drafted email carrying a made-' +
  'up number is worse than no draft, because it is the one that gets sent.\n' +
  '2. If you cannot do anything honest and useful with what you were given, reply with ONE ' +
  'line and nothing else: "CANNOT: " followed by one sentence saying what is missing. Do that ' +
  'rather than returning a page of generic structure. Saying so is a good answer; padding is ' +
  'not.\n' +
  '3. Be specific to them. Anything you could have written without reading their notes should ' +
  'not be in the reply.\n' +
  '4. No encouragement, no assessment of how much they have on, no restating of the task.\n' +
  '5. Keep the language their notes are written in.'

/**
 * Everything both halves are told, before the task itself.
 *
 * Built here rather than in the browser so that what is sent is decided in
 * one place and can be read in one place. Three parts: what this app is,
 * the passages of their own notes that bear on the thing, and the other
 * lines outstanding.
 *
 * The description of the app is here because the work is so often about
 * the app itself — "write the announcement", "how do I get this in front
 * of people" — and a model that has never heard of it answers with a
 * paragraph of plausible software said with total confidence. See
 * `lib/about.ts`, which is kept in step with the app by a test.
 *
 * The notes themselves never come. Retrieval happens on the device against
 * the local index and only the matching passages are sent, exactly as it
 * works for a question — so the cost of this does not grow with how much
 * somebody has written, and the collection stays on the machine.
 */
function brainstormContext(sources: Source[], list: string): string {
  return (
    'About the app these notes are kept in. Use it when the work is about the app itself, ' +
    'and do not credit it with anything this does not say it has:\n\n' +
    `${ABOUT_APP}\n\n` +
    `Extracts from their notes:\n\n${sourceBlock(sources)}\n\n` +
    (list ? `Everything else outstanding across their notes:\n${list}\n` : '')
  )
}

/** The questions to ask before anything is drafted. */
async function brainstormQuestions(task: string, context: string) {
  const text = await complete({
    system: BRAINSTORM_QUESTIONS_SYSTEM,
    user: `Today is ${new Date().toISOString().slice(0, 10)}.\n\n${context}\n\nThe thing they picked: ${task}`,
    maxTokens: 500,
    /*
      Working out what a page does not say is a reading task, and this is
      the half somebody is sitting and waiting for with a dialog open. The
      cheap model does it as well and does it faster.
    */
    effort: 'low',
  })
  return NextResponse.json({ text })
}

/** And the work itself. The one request in this app that asks for the most. */
async function brainstormSolution(task: string, context: string, answers: string) {
  const text = await complete({
    system: BRAINSTORM_SOLUTION_SYSTEM,
    user:
      `Today is ${new Date().toISOString().slice(0, 10)}.\n\n${context}\n\n` +
      `The thing they picked: ${task}\n\n` +
      (answers ? `What they told me:\n${answers}` : 'They skipped the questions.'),
    /*
      A drafted email, an outline and the steps under it.

      Short enough that a model cannot pad its way out of having nothing to
      say — and short enough to come back inside the time a request is
      allowed. Four thousand tokens is a minute of writing on the largest
      model, which is the wrong side of every serverless limit there is.
    */
    maxTokens: 2000,
    effort: 'max',
  })
  if (!text) {
    return NextResponse.json({ error: 'Nothing came back. Try again.' }, { status: 502 })
  }
  return NextResponse.json({ text })
}

/**
 * The largest piece of audio this will take in one request.
 *
 * Not a guess: a serverless function's request body is capped at around
 * 4.5MB, and a request over it is refused by the platform before any of this
 * runs — which would look like transcription silently failing. The recorder
 * cuts a recording into pieces well under this (see lib/recorder.ts), so the
 * limit is a backstop rather than something anybody meets.
 */
const MAX_AUDIO_BYTES = 4_000_000

/**
 * One piece of a recording, listened to properly.
 *
 * ## Why this exists when the browser already heard it
 *
 * The browser's recogniser is free and live and genuinely good at a quiet
 * person dictating a sentence. It is not good at a meeting: no punctuation,
 * no paragraph it did not invent, and names, figures and anything said over
 * another voice come back as whatever was nearest. Sending the audio costs
 * money per minute — which is why it is not the only path and never runs
 * without a key — and it is the difference between a record of a meeting and
 * a page of approximate words.
 *
 * What the reader gets is both: the live words while they talk, from the
 * browser, and this when they stop. If this fails, for any reason, the words
 * the browser heard are what goes into the note. A recording must never be
 * lost to a request.
 */
async function transcribe(file: File, language: string) {
  const key = openAiKey()
  if (!key) {
    return NextResponse.json(
      { error: 'Transcription needs an OPENAI_API_KEY. The words heard in the browser were kept.' },
      { status: 501 },
    )
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'That piece of audio is too large.' }, { status: 413 })
  }
  if (!file.size) {
    return NextResponse.json({ error: 'That piece of audio was empty.' }, { status: 400 })
  }

  const client = new OpenAI({ apiKey: key })
  const ask = (model: string) =>
    client.audio.transcriptions.create({
      file,
      model,
      // Told rather than guessed at, when the browser knows. A recogniser
      // left to detect the language will occasionally decide a quiet English
      // sentence is Welsh and translate it.
      ...(language ? { language } : {}),
      response_format: 'text',
    })

  let text: string
  try {
    text = String(await ask(TRANSCRIBE_MODEL))
  } catch (error) {
    // An account without the newer model gets Whisper rather than nothing.
    // Anything else is a real failure and is reported as one.
    const unknown =
      error instanceof OpenAI.NotFoundError ||
      (error instanceof OpenAI.APIError && /model/i.test(error.message ?? ''))
    if (!unknown) throw error
    text = String(await ask(TRANSCRIBE_FALLBACK))
  }

  return NextResponse.json({ text: text.trim() })
}

export async function POST(request: Request) {
  /*
    Audio arrives as a form rather than as JSON, because a few hundred
    kilobytes of Opus base64-encoded into a JSON string is a third larger for
    no reason. It is the one request to this route that is not JSON, so it is
    picked off by its content type before the body is parsed.
  */
  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    if (!transcribes()) {
      return NextResponse.json(
        { error: `Transcription is not set up on this copy of ${APP_NAME}.` },
        { status: 501 },
      )
    }
    if (overLimit(clientKey(request))) {
      return NextResponse.json(
        { error: 'That is a lot of requests at once. Try again in a minute.' },
        { status: 429 },
      )
    }
    try {
      const form = await request.formData()
      const audio = form.get('audio')
      if (!(audio instanceof File)) {
        return NextResponse.json({ error: 'No audio arrived.' }, { status: 400 })
      }
      // Only the base language, because that is all the API takes: "en-GB"
      // from a browser is "en" here.
      const language = String(form.get('language') ?? '')
        .split('-')[0]
        .slice(0, 8)
      return await transcribe(audio, language)
    } catch (error) {
      return failure(error)
    }
  }

  if (!configured()) {
    return NextResponse.json(
      {
        error:
          `Writing help is not set up on this copy of ${APP_NAME}. Add an OPENAI_API_KEY to turn it on.`,
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
    /** The one outstanding thing being thought through, when it is a brainstorm. */
    task?: string
    /** The questions and what was typed back, when a brainstorm is being solved. */
    answers?: string
    /** The other things outstanding, when it is a brainstorm. */
    list?: string
    /** Who is in the team, when the action is 'chat-tasks'. */
    names?: string
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
    One outstanding thing, thought through. Two actions because it is two
    requests on two models: the questions are a reading and go to the cheap
    one, the solution is the work and is the only thing here that asks for
    the largest. See BRAINSTORM_QUESTIONS_SYSTEM above.
  */
  if (body.action === 'brainstorm-questions' || body.action === 'brainstorm-solution') {
    const task = (body.task ?? '').trim()
    const sources = Array.isArray(body.sources) ? body.sources : []
    if (!task) {
      return NextResponse.json({ error: 'Pick something to think about first.' }, { status: 400 })
    }
    const size = sources.reduce((total, source) => total + (source.text?.length ?? 0), 0)
    if (size > MAX_INPUT_CHARS) {
      return NextResponse.json({ error: 'Too much context at once.' }, { status: 413 })
    }
    const context = brainstormContext(sources, (body.list ?? '').slice(0, 4_000))
    try {
      return body.action === 'brainstorm-questions'
        ? await brainstormQuestions(task, context)
        : await brainstormSolution(task, context, (body.answers ?? '').slice(0, 4_000))
    } catch (error) {
      return failure(error)
    }
  }

  /*
    A team's chat message, read for the tasks stated in it. The narrowest
    job in this file and the one written against the most damaging failure:
    see CHAT_SYSTEM above.
  */
  if (body.action === 'chat-tasks') {
    const message = (body.text ?? '').trim()
    if (!message) return NextResponse.json({ tasks: [] })
    if (message.length > 8_000) {
      return NextResponse.json({ error: 'That message is too long to read.' }, { status: 413 })
    }
    try {
      return await chatTasks(message, (body.names ?? '').slice(0, 500))
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
