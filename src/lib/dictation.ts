/**
 * Speech into a document.
 *
 * ## Who listens, and when
 *
 * Both, and they are doing different jobs. The browser's own recogniser —
 * Chrome, Edge, Safari, Chrome on Android — runs while somebody is talking:
 * free, live, nothing to download, and the only one of the two that can
 * answer the question people actually have while recording, which is not "is
 * it on" but "is it hearing me".
 *
 * What it hands back, though, is a stream of guesses. No punctuation it did
 * not invent, names and figures replaced by whatever sounded nearest, and
 * whole phrases lost when two people talk across each other. For a dictated
 * sentence that is fine; for a meeting it is a page of approximate words, and
 * approximately what was said is the one thing a meeting note must not be.
 *
 * So the microphone is recorded as well and the audio is transcribed properly
 * when the recording stops — see lib/recorder.ts and lib/transcribe.ts. It
 * costs money per minute, so it happens only where a key is configured, and
 * the live words are the fallback rather than the discard: no key, a refused
 * microphone, a failed upload, and what the browser heard is what goes in.
 *
 * That keeps the bargain the rest of the app makes. It works with no key, no
 * account and no network; the model makes it accurate rather than being the
 * reason there is anything at all.
 *
 * ## Why this file has no DOM in it
 *
 * `SpeechRecognition` is an event stream and cannot be unit tested without a
 * browser. Everything that decides what the words become — where paragraphs
 * fall, how a long meeting is cut up for the model, what the timer reads — is
 * a string or a number function and lives here, where the awkward cases are
 * tests rather than something to reproduce by talking at a laptop.
 */

/**
 * How much transcript goes to the model in one request.
 *
 * Well under the route's own limit, because an hour of speech is tens of
 * thousands of characters and one request for all of it is a timeout. The
 * chunks are joined back together afterwards.
 */
export const CHUNK_CHARS = 12_000

/**
 * Past this many words, a recording is treated as a meeting rather than a
 * dictated paragraph — notes with headings rather than clean prose.
 *
 * Roughly a minute and a half of speaking. Below it somebody is talking a
 * paragraph into their notes and wants it to read like one; above it they were
 * in a conversation and want to be able to find things in it afterwards.
 */
export const MEETING_WORDS = 220

/** Sentences per paragraph when this device has to do the tidying itself. */
const SENTENCES_PER_PARAGRAPH = 3

/** Words per paragraph when the recogniser returned no punctuation at all. */
const WORDS_PER_PARAGRAPH = 45

/** Joins what has been finalised with what is still being said. */
export function joinTranscript(finals: string[], interim = ''): string {
  return [...finals, interim]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** How long the recorder has been running, as a clock reads it. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Whether this was a conversation rather than a dictated paragraph. */
export function looksLikeMeeting(text: string): boolean {
  return wordCount(text) >= MEETING_WORDS
}

/**
 * Breaks a run of speech into paragraphs, on this device.
 *
 * What the recogniser hands back is one long line. Chrome punctuates it and
 * Safari mostly does not, so both have to work: sentences are grouped where
 * there is punctuation to group by, and cut on word count where there is not.
 * Not a single word is added, removed or changed — this decides where the line
 * breaks go and nothing else, because the one thing worse than an untidy
 * transcript is a tidy one that says something the speaker did not.
 */
export function paragraphsFrom(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []

  // Sentence ends: .?! followed by a space. The lookahead keeps the mark on
  // the sentence it belongs to.
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean)

  if (sentences.length <= 1) {
    // Nothing to group by, so fall back to length. A wall of four hundred
    // words is unreadable whether or not it is accurate.
    const words = clean.split(' ')
    if (words.length <= WORDS_PER_PARAGRAPH) return [clean]
    const out: string[] = []
    for (let i = 0; i < words.length; i += WORDS_PER_PARAGRAPH) {
      out.push(words.slice(i, i + WORDS_PER_PARAGRAPH).join(' '))
    }
    return out
  }

  const out: string[] = []
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
    out.push(sentences.slice(i, i + SENTENCES_PER_PARAGRAPH).join(' '))
  }
  return out
}

/**
 * Cuts a long transcript into pieces small enough to send.
 *
 * On sentence boundaries wherever there are any, so a chunk never ends
 * mid-clause and the model is never asked to make notes out of half a thought.
 * A single sentence longer than the limit — which is what an unpunctuated
 * twenty-minute recording is — is cut on a space instead, and only on a
 * character as a last resort.
 */
export function chunkTranscript(text: string, max = CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= max) return [clean]

  const pieces: string[] = []
  let rest = clean
  while (rest.length > max) {
    const window = rest.slice(0, max)
    // The last sentence end inside the window, then the last space, then the
    // hard limit. Each fallback is worse and each is better than losing text.
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
    cut = cut > max * 0.5 ? cut + 1 : window.lastIndexOf(' ')
    if (cut <= 0) cut = max
    pieces.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) pieces.push(rest)
  return pieces
}
