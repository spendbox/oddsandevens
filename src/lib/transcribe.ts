'use client'

import { fileNameFor } from './recorder.ts'

/**
 * Sending the audio to be listened to properly.
 *
 * One piece at a time, in order, because they have to be joined back in the
 * order they were said and because a failure should cost one piece rather
 * than the recording. Everything here is written around that: a piece that
 * comes back empty or refused is skipped and the rest go on, and the caller
 * is told whether anything at all came back so it can fall back to the words
 * the browser heard.
 *
 * The key never comes near this. The upload goes to `/api/ai`, which is the
 * one server route in the app and the only place a key is read — see the note
 * at the top of that file.
 */

export interface Transcript {
  /** What was said, as far as this got. */
  text: string
  /** How many pieces were sent, and how many came back with words in them. */
  sent: number
  heard: number
  /** A sentence to show, when some of it did not make it. */
  problem?: string
}

/** One piece, uploaded. Empty string for anything that did not come back. */
async function one(piece: Blob, language: string): Promise<string> {
  const form = new FormData()
  form.append('audio', piece, fileNameFor(piece.type))
  form.append('language', language)
  const response = await fetch('/api/ai', { method: 'POST', body: form })
  const data = (await response.json()) as { text?: string; error?: string }
  if (!response.ok) throw new Error(data.error ?? 'That did not go through.')
  return (data.text ?? '').trim()
}

/**
 * A whole recording, transcribed.
 *
 * `onProgress` is what the sign reads while this runs: a recording of an hour
 * is twelve uploads, and twelve uploads with no sign of progress is an app
 * that has hung.
 */
export async function transcribeAll(
  pieces: Blob[],
  language: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Transcript> {
  const said: string[] = []
  let problem: string | undefined
  let heard = 0

  for (let i = 0; i < pieces.length; i++) {
    onProgress?.(i, pieces.length)
    try {
      const text = await one(pieces[i], language)
      if (text) {
        said.push(text)
        heard++
      }
    } catch (error) {
      /*
        Kept, not thrown. One piece failing is a gap in the middle of a
        meeting; stopping here would be the rest of the meeting as well — and
        the caller still has the browser's own words to fall back to if none
        of it arrived.
      */
      problem = error instanceof Error ? error.message : 'Some of it could not be sent.'
    }
  }
  onProgress?.(pieces.length, pieces.length)

  return {
    text: said.join(' ').replace(/\s+/g, ' ').trim(),
    sent: pieces.length,
    heard,
    ...(problem ? { problem } : {}),
  }
}
