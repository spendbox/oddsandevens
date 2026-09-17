'use client'

import { LoaderCircle, Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  chunkTranscript,
  elapsed,
  joinTranscript,
  looksLikeMeeting,
  paragraphsFrom,
} from '@/lib/dictation'
import { parsePastedText, type PastedBlock } from '@/lib/paste'

/**
 * A recorder in the corner: press it, talk, press it again, and what you said
 * is in the document.
 *
 * ## Why this one is allowed to be a floating button
 *
 * Everything else in this app was taken *out* of the bottom-right corner,
 * because a button pinned there is furniture and furniture is invisible after
 * the first day. A recorder is the exception, and it is the exception
 * everywhere: every voice memo app, every phone, every dictaphone ever made
 * puts one round button where a thumb already is. You do not go looking for
 * it, you reach for it — usually while somebody else is still talking, which
 * is exactly the moment you cannot be hunting through a menu.
 *
 * ## Why the browser does the listening
 *
 * Chrome, Edge, Safari and Chrome on Android all ship a speech recogniser.
 * It is free, it is live, and it costs nothing to download. Uploading audio to
 * a transcription service would be more accurate and would also be money per
 * minute of every meeting anybody records, an upload on a phone connection,
 * and a wait at the end instead of words arriving as they are said. See the
 * note at the top of lib/dictation.ts.
 *
 * ## Why it restarts itself
 *
 * A browser recogniser stops on its own after a pause, even when it has been
 * told to run continuously — which is fine for one sentence and useless for a
 * meeting, where the silences are where people are thinking. So every stop it
 * was not asked for is started again, and what has already been settled is
 * kept. That single detail is the difference between this working for a
 * dictated line and working for forty minutes.
 *
 * ## What it does when it stops
 *
 * With a key: the transcript goes through the model, which punctuates a spoken
 * paragraph or turns a long recording into notes with headings and an actions
 * list — see `notes` in api/ai/route.ts. Without one: it is broken into
 * paragraphs on this device and put in as it was heard, which is still the
 * words somebody said. Either way it is written into the document, because
 * that is what pressing record asked for, and either way one Ctrl+Z takes the
 * whole thing back out.
 */

/** The browser's recogniser, as much of it as this uses. */
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface RecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: { isFinal: boolean; 0: { transcript: string } }
  }
}

type RecognitionClass = new () => Recognition

function recogniser(): RecognitionClass | null {
  if (typeof window === 'undefined') return null
  const host = window as unknown as {
    SpeechRecognition?: RecognitionClass
    webkitSpeechRecognition?: RecognitionClass
  }
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null
}

/**
 * Whether this browser can listen, read the way every other value outside
 * React is read here.
 *
 * It cannot change while the tab is open, so the subscribe function never
 * calls back. The server snapshot is `false` because the server has no
 * `window` — and a button drawn on the server that then vanishes on the client
 * is a hydration error on every load, which is the same trap the theme and the
 * folds are read this way to avoid.
 */
const neverChanges = () => () => {}

/** How much of the live transcript the sign shows. The tail, not the head. */
const LIVE_TAIL = 180
/** How long to wait before restarting a recogniser that stopped on its own. */
const RESTART_MS = 250

export interface DictationButtonProps {
  /** Writes what was said into the document. */
  onWrite: (blocks: PastedBlock[]) => void
  /** Named in the prompt, so notes know what they are notes about. */
  title: string
  /** False when no key is configured: the transcript goes in as it was heard. */
  aiReady: boolean
  /**
   * True when this one is on the notes screen rather than on a note.
   *
   * That screen is a full-window dialog, and this button is a portal to the
   * body — so without being lifted above it, the recorder renders behind the
   * screen it belongs to and cannot be pressed at all.
   */
  overDialog?: boolean
}

export default function DictationButton({
  onWrite,
  title,
  aiReady,
  overDialog = false,
}: DictationButtonProps) {
  const supported = useSyncExternalStore(
    neverChanges,
    () => recogniser() !== null,
    () => false,
  )
  const [state, setState] = useState<'idle' | 'listening' | 'writing'>('idle')
  /*
    What the sign paints, which is not the same value as the record below.

    The record is a ref, because a phrase that arrives while a request is in
    flight must be in it whatever React has painted; the sign is state,
    because a ref changing repaints nothing and reading one during render is
    a value React cannot see change. One callback writes both, on the same
    line, so they cannot drift.
  */
  const [live, setLive] = useState('')
  const [since, setSince] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)

  const engine = useRef<Recognition | null>(null)
  /** Everything the recogniser has settled on, across every restart. */
  const finals = useRef<string[]>([])
  /** Whether the recogniser stopping was asked for, or is one to restart. */
  const wanted = useRef(false)
  const startedAt = useRef(0)

  // The clock on the recording sign. A second is as fine as this needs to be.
  useEffect(() => {
    if (state !== 'listening') return
    const id = setInterval(() => setSince(Date.now() - startedAt.current), 500)
    return () => clearInterval(id)
  }, [state])

  const write = async () => {
    const said = joinTranscript(finals.current, '')
    finals.current = []
    setLive('')
    if (!said) {
      setState('idle')
      setProblem('Nothing was picked up. Check the microphone and try again.')
      return
    }

    // With no key, the words go in as they were heard, broken into paragraphs
    // on this device. Nothing is added, removed or reworded.
    if (!aiReady) {
      setState('idle')
      onWrite(parsePastedText(paragraphsFrom(said).join('\n\n')))
      return
    }

    setState('writing')
    setProblem(null)
    const meeting = looksLikeMeeting(said)
    const pieces = chunkTranscript(said)
    const out: string[] = []
    try {
      for (let i = 0; i < pieces.length; i++) {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notes',
            text: pieces[i],
            title,
            meeting,
            part: i + 1,
            parts: pieces.length,
          }),
        })
        const data = (await response.json()) as { text?: string; error?: string }
        if (!response.ok || !data.text) {
          // Whatever has been tidied so far is kept and the rest goes in as it
          // was heard. Losing the second half of a meeting because one request
          // failed is not a trade worth making.
          out.push(...pieces.slice(i))
          setProblem(data.error ?? 'Some of it went in as it was heard.')
          break
        }
        out.push(data.text.trim())
      }
    } catch {
      out.push(...pieces.slice(out.length))
      setProblem('Could not reach the service, so it went in as it was heard.')
    }
    setState('idle')
    onWrite(parsePastedText(out.filter(Boolean).join('\n\n')))
  }

  const stop = () => {
    wanted.current = false
    try {
      engine.current?.stop()
    } catch {
      // Already stopped. The transcript is what matters and it is kept above.
    }
    engine.current = null
    void write()
  }

  const start = () => {
    const Recogniser = recogniser()
    if (!Recogniser) return
    setProblem(null)
    finals.current = []
    setLive('')
    startedAt.current = 0
    setSince(0)

    const engineInstance = new Recogniser()
    engineInstance.continuous = true
    engineInstance.interimResults = true
    engineInstance.maxAlternatives = 1
    engineInstance.lang = navigator.language || 'en-GB'

    /*
      The clock starts when the recogniser does, not when the button was
      pressed — there is a moment between the two while the browser asks about
      the microphone, and a timer that had already been counting through it
      reads as a recording that missed its first few seconds. Only the first
      start counts: the restarts across a meeting's silences are the same
      recording.
    */
    engineInstance.onstart = () => {
      if (!startedAt.current) startedAt.current = Date.now()
    }

    engineInstance.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) finals.current.push(text)
        else interim += text
      }
      setLive(joinTranscript(finals.current, interim))
    }

    engineInstance.onerror = (event) => {
      /*
        A pause is not a failure, and neither is a stop we asked for. Only the
        two that mean it cannot go on are worth telling anybody about — and
        "not allowed" is the one that needs a sentence rather than a code,
        because the fix is in the browser's own permission menu.
      */
      if (event.error === 'no-speech' || event.error === 'aborted') return
      wanted.current = false
      setProblem(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'The microphone is blocked for this site. Allow it in the browser’s address bar and try again.'
          : 'The recogniser stopped. What was picked up before that is going in.',
      )
      engine.current = null
      void write()
    }

    engineInstance.onend = () => {
      /*
        Every recogniser stops itself after a pause, however plainly it has
        been told to run continuously. In a meeting the pauses are where people
        are thinking, so a stop nobody asked for is started again and what has
        already been settled is kept. Without this, a recording ends the first
        time somebody stops to consider a question.
      */
      if (!wanted.current) return
      setTimeout(() => {
        if (!wanted.current) return
        try {
          engineInstance.start()
        } catch {
          // A recogniser that will not restart is the end of the recording
          // rather than the end of the transcript.
          wanted.current = false
          engine.current = null
          void write()
        }
      }, RESTART_MS)
    }

    try {
      engineInstance.start()
    } catch {
      setProblem('Could not start listening. Another tab may be using the microphone.')
      return
    }
    engine.current = engineInstance
    wanted.current = true
    setState('listening')
  }

  // A recording must not outlive the page, and a recogniser left running holds
  // the microphone open with nothing to write into.
  useEffect(() => {
    return () => {
      wanted.current = false
      try {
        engine.current?.abort()
      } catch {
        // Nothing to abort.
      }
    }
  }, [])

  if (!supported) return null

  const listening = state === 'listening'
  // Whole class names, never a string built from a variable: Tailwind reads
  // the source for the classes it generates and cannot see one that is
  // assembled at runtime.
  const layer = overDialog ? 'z-[60]' : 'z-30'

  return createPortal(
    <>
      {/*
        The sign that it is recording, above the button where a thumb is not
        covering it. A dot that pulses, a clock, and the words as they arrive —
        because the question somebody has while recording is not "is it on" but
        "is it hearing me", and only the third of those three answers it.
      */}
      {(listening || state === 'writing' || problem) && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed right-4 bottom-20 ${layer} max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 shadow-lg sm:right-6 sm:bottom-24 sm:w-80 print:hidden`}
        >
          {listening && (
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-danger)] opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-danger)]" />
              </span>
              Listening
              <span className="ml-auto font-mono text-[12px] text-[var(--color-muted)] tabular-nums">
                {elapsed(since)}
              </span>
            </p>
          )}
          {state === 'writing' && (
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <LoaderCircle size={13} className="animate-spin text-[var(--color-accent)]" />
              Writing it up…
            </p>
          )}
          {listening && (
            <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-[var(--color-muted)]">
              {live ? live.slice(-LIVE_TAIL) : 'Say something and it will appear here.'}
            </p>
          )}
          {problem && (
            <p className="mt-1 text-[12px] leading-snug text-[var(--color-danger)]">{problem}</p>
          )}
          {listening && (
            <p className="mt-1 text-[12px] text-[var(--color-faint)]">
              Press again to stop. It goes into the note then, not before.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        aria-label={listening ? 'Stop recording' : 'Record what you say'}
        aria-pressed={listening}
        title={listening ? 'Stop recording' : 'Record what you say'}
        disabled={state === 'writing'}
        /*
          A tap, on click, never on pointerdown. Acting on pointerdown starts
          the recogniser under a finger that is still down and the click
          completing the tap then lands on whatever appeared — which is the
          bug that made the old assistant button need a long press. It also has
          to be a real user gesture, which is what the microphone permission
          is granted against.
        */
        onClick={() => (listening ? stop() : start())}
        /*
          Black, not the app's green. The green says "this is what kind of note
          that is" everywhere else in the app, and a recorder is not a kind of
          note; a black circle is what a microphone button is on every phone
          ever made, and it is the one control here that has to be recognised
          before it is read.
        */
        className={`fixed right-4 bottom-4 ${layer} flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors disabled:opacity-60 sm:right-6 sm:bottom-6 print:hidden ${
          listening
            ? 'bg-[var(--color-danger)] text-white'
            : 'bg-[var(--color-ink)] text-[var(--color-paper)] hover:opacity-90'
        }`}
      >
        {state === 'writing' ? (
          <LoaderCircle size={22} className="animate-spin" />
        ) : listening ? (
          <Square size={20} fill="currentColor" />
        ) : (
          <Mic size={22} />
        )}
      </button>
    </>,
    document.body,
  )
}
