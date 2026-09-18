'use client'

/**
 * Keeping the audio, so it can be transcribed properly afterwards.
 *
 * ## Why the audio is kept at all
 *
 * The browser's recogniser runs while somebody talks and is the only thing
 * that can answer "is it hearing me" as they speak — so it stays, and it is
 * still what a copy of Pad with no key relies on entirely. What it hands back
 * is the problem: no punctuation it did not guess, names and figures replaced
 * by whatever sounded nearest, and whole phrases dropped when two people talk
 * across each other. For a dictated sentence that is fine. For a meeting it
 * is a page of approximate words, and the one thing a meeting note must not
 * be is approximately what was said.
 *
 * So the microphone is recorded as well, and when the recording stops the
 * audio goes to a model that listens to it properly. The words heard live are
 * the fallback, never the discard: if the upload fails, or there is no key,
 * or it is a browser with no recogniser and no key at all, whatever exists is
 * what goes into the note.
 *
 * ## Why it is cut into pieces
 *
 * Two reasons, and they are both hard limits rather than preferences. A
 * serverless request body caps out around 4.5MB, so an hour in one piece
 * would be refused by the platform before any code ran. And a single upload
 * that fails at minute fifty loses fifty minutes; a piece that fails loses
 * five and the rest still arrive.
 *
 * Each piece is a *complete file*, made by stopping the recorder and starting
 * another one — not a slice of a stream. A slice of a WebM stream has no
 * header and nothing can decode it, which is the trap this looks like it
 * should fall into.
 *
 * ## Why the level meter
 *
 * On a browser with no recogniser there are no live words, and a timer
 * counting up says only that a clock is running. A meter that moves when you
 * speak is the whole of "it is hearing you", and it costs one analyser node.
 */

/** How long one piece of a recording is. Five minutes is well under the
    request-body limit at the bitrate below, and a tolerable amount to lose. */
export const SEGMENT_MS = 5 * 60_000

/**
 * Opus at 24kbps: speech is clear at it, and five minutes comes to about
 * 900KB — comfortably inside the limit, and a sane thing to ask of somebody
 * on a phone connection.
 */
const BITRATE = 24_000

/** The types worth asking for, best first. */
const TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  // Safari records MP4/AAC and nothing else. It is larger per minute and it
  // is that or no audio at all there.
  'audio/mp4',
]

/**
 * The best container this browser will record, or empty for "let it choose".
 *
 * Takes the support test as an argument so the choice — which is the part
 * that has ever been wrong — is a unit test rather than something to find out
 * on somebody else's Safari.
 */
export function pickMimeType(supported: (type: string) => boolean): string {
  for (const type of TYPES) if (supported(type)) return type
  return ''
}

/** What to call the file, which is how the API decides how to decode it. */
export function fileNameFor(mime: string): string {
  if (mime.includes('mp4')) return 'part.mp4'
  if (mime.includes('ogg')) return 'part.ogg'
  return 'part.webm'
}

export interface Recording {
  /** Stops, releases the microphone, and hands back every piece in order. */
  stop: () => Promise<Blob[]>
  /** Stops and throws the audio away — what leaving the page does. */
  cancel: () => void
  /** 0 to 1, loudest recently. Read by the meter; never stored. */
  level: () => number
}

/** Whether this browser can record audio at all. */
export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

/**
 * Starts recording the microphone, in pieces.
 *
 * Throws if the microphone is refused or unavailable, which the caller turns
 * into a sentence: everything else here is written so that a failure costs
 * the accurate transcript and never the recording somebody is in the middle
 * of making.
 */
export async function startRecording(segmentMs = SEGMENT_MS): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    /*
      Asked for by name rather than left to the defaults. These three are the
      difference between a phone on a table in a meeting room and a recording
      of a meeting room: the echo of the room cancelled, the air conditioning
      taken down, and a quiet speaker at the far end brought up to the level
      of the loud one next to the microphone.
    */
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  })

  const mime = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
  const pieces: Blob[] = []
  let recorder: MediaRecorder | null = null
  let rolling: ReturnType<typeof setTimeout> | null = null
  let done = false

  /* ------------------------------------------------------------- the meter */

  let level = 0
  let audio: AudioContext | null = null
  let frame = 0
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) {
      audio = new Ctx()
      const analyser = audio.createAnalyser()
      analyser.fftSize = 512
      audio.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.frequencyBinCount)
      const read = () => {
        analyser.getByteTimeDomainData(samples)
        let peak = 0
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128)
        // Eased downwards, so the meter falls away rather than flickering off
        // between syllables.
        level = Math.max(peak, level * 0.85)
        frame = requestAnimationFrame(read)
      }
      frame = requestAnimationFrame(read)
    }
  } catch {
    // No meter. The clock and the words still say it is running.
  }

  /* ----------------------------------------------------------- the pieces */

  const startPiece = () => {
    const made = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      audioBitsPerSecond: BITRATE,
    })
    made.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) pieces.push(event.data)
    }
    made.start()
    recorder = made
    /*
      A new recorder every few minutes, rather than one recorder asked for
      slices. A slice of a WebM stream has no header and nothing can decode
      it; stopping and starting gives a run of complete files, each one of
      which a transcriber will happily take on its own.
    */
    rolling = setTimeout(() => {
      if (done) return
      try {
        made.stop()
      } catch {
        // Already stopped, which is the same outcome.
      }
      if (!done) startPiece()
    }, segmentMs)
  }

  const release = () => {
    done = true
    if (rolling) clearTimeout(rolling)
    rolling = null
    if (frame) cancelAnimationFrame(frame)
    void audio?.close().catch(() => {})
    // The microphone light goes out here. A stream left running holds it open
    // with nothing to record into, which is the thing people notice.
    for (const track of stream.getTracks()) track.stop()
  }

  startPiece()

  return {
    level: () => level,
    cancel: () => {
      try {
        recorder?.stop()
      } catch {
        // Nothing to stop.
      }
      release()
      pieces.length = 0
    },
    stop: () =>
      new Promise<Blob[]>((resolve) => {
        const finish = () => {
          release()
          resolve(pieces.slice())
        }
        const last = recorder
        if (!last || last.state === 'inactive') return finish()
        // The last piece is only complete once its stop event has been and
        // gone: whatever is still buffered arrives with it.
        last.onstop = finish
        try {
          last.stop()
        } catch {
          finish()
        }
      }),
  }
}
