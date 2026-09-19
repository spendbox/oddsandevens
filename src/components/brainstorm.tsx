'use client'

import {
  Check,
  ChevronLeft,
  Copy,
  Lightbulb,
  LoaderCircle,
  Minus,
  NotebookPen,
  RotateCcw,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { digest, type ActionItem } from '@/lib/actions'
import { gatherSources, type Source } from '@/lib/ask'
import { blocksFromPasted } from '@/lib/blocks'
import {
  brainstormKey,
  readQuestions,
  readSolution,
  saveSolution,
  type Asked,
  type Solution,
} from '@/lib/brainstorm'
import { parsePastedText } from '@/lib/paste'
import type { Block, Doc } from '@/lib/types'
import { useKeyboardInset } from './keyboard'

/**
 * One outstanding thing, thought through properly.
 *
 * ## What replaced what
 *
 * There was a button here that asked "what should I do first?" and got
 * back a re-ordering of the list underneath it. It was honest and it was
 * thin: the answer was made of lines already on the screen, and nobody
 * pressed it twice. The question somebody actually has about a line in
 * that list is the next one along — *how do I do this* — and answering
 * that means reading their notes, asking them what the notes do not say,
 * and then writing the thing.
 *
 * ## Three steps, and the middle one is the point
 *
 * Pick. Answer. Read.
 *
 * The questions are what make this worth the money. "Chase the landlord"
 * has a history that was never written down: what has already been said,
 * whether this is the first ask or the fourth, what would count as done.
 * A model that guesses at those writes a confident letter about the wrong
 * thing, and a confident letter about the wrong thing is worse than no
 * letter. Three questions cost fifteen seconds and are the difference
 * between a draft somebody sends and a draft somebody rewrites.
 *
 * They are skippable, because a question nobody wants to answer must never
 * be a gate. Skipping writes from the notes alone and says so.
 *
 * ## Why it can be put down
 *
 * Because the model is being asked to write something real and that takes
 * long enough to be annoying to sit in front of. Minimising leaves the
 * request running and puts the state on the row it is about: "Working out
 * a solution…" under the task, and then "A solution is ready". The
 * component stays mounted while it is minimised — that is what keeps the
 * request and everything typed into it alive — and draws nothing.
 *
 * It does not survive the page being closed, and nothing here pretends it
 * does. A request has nowhere to carry on from once the tab is gone.
 *
 * ## What is sent
 *
 * The passages of the reader's own notes that bear on the thing, found by
 * the local index, plus the other lines outstanding and the answers. Never
 * the collection. It is the same bargain as asking a question of the
 * notes, and the reason the cost of this does not grow with how much
 * somebody has written.
 *
 * ## And it is allowed to say no
 *
 * A refusal is printed as the answer. A model asked to solve "sort out the
 * thing" will otherwise produce a page of plausible structure, and a page
 * that costs a read to discover it is empty is how somebody learns not to
 * open this again.
 */

type Stage = 'pick' | 'asking' | 'answering' | 'working' | 'done'

/** How many notes to read for one thing, and how much of them to send. */
const MAX_DOCS = 6
const MAX_CHARS = 8_000
/** How many other outstanding lines go along for context. */
const MAX_OTHERS = 25

export default function Brainstorm({
  items,
  docs,
  startWith,
  minimised,
  onMinimise,
  onClose,
  onWorking,
  onKeep,
}: {
  /** Everything outstanding, which is what there is to choose from. */
  items: ActionItem[]
  /** The notes themselves, for retrieval. They do not leave the device. */
  docs: Doc[]
  /** Opened about one thing in particular, rather than at the list. */
  startWith?: ActionItem | null
  /** Put down for now: still running, drawing nothing. */
  minimised: boolean
  onMinimise: () => void
  onClose: () => void
  /** Which line is being worked on, so its row can say so. Null when none. */
  onWorking: (key: string | null) => void
  /** Keeps the solution as a note of its own. */
  onKeep: (note: { title: string; blocks: Block[] }) => Promise<void>
}) {
  const [chosen, setChosen] = useState<ActionItem | null>(() => startWith ?? null)
  const [stage, setStage] = useState<Stage>(() => (startWith ? 'asking' : 'pick'))
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [result, setResult] = useState<Solution | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [kept, setKept] = useState(false)
  const [copied, setCopied] = useState(false)
  const keyboard = useKeyboardInset()

  /*
    Everything the two requests read, as it is right now, and none of it a
    reason to start one again.

    A fetch that named `docs` in its dependencies would be cancelled and
    re-made every time anything in the notes changed — including the save
    this screen's own tick causes — and one that named `answers` would
    restart on every keystroke typed into a field. What the request wants
    is the values at the moment it was asked for, which is exactly what a
    ref is. One effect keeps it in step, which is the pattern
    workspace.tsx uses and the one the compiler allows: never assigned
    from inside a callback.
  */
  const latest = useRef({ docs, items, questions, answers, onWorking })
  useEffect(() => {
    latest.current = { docs, items, questions, answers, onWorking }
  }, [docs, items, questions, answers, onWorking])

  /*
    The questions.

    In an effect rather than in the handler because there are two ways in —
    pressing Brainstorm and picking something, or opening it about one
    thing from that thing's own row — and one of them has already happened
    by the time this mounts. The async run is inside the effect: setting
    state in an effect's body is the one thing this codebase's lint rule
    will not have.
  */
  useEffect(() => {
    if (stage !== 'asking' || !chosen) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            ask(chosen, sourcesFor(chosen, latest.current.docs), latest.current.items),
          ),
        })
        const data = (await response.json()) as { text?: string; error?: string }
        if (cancelled) return
        if (!response.ok) {
          // Not fatal: the questions are what make the answer sharper, and
          // not being able to ask them is a reason to go on without them.
          setProblem(data.error ?? 'Could not think of anything to ask.')
          setQuestions([])
          setAnswers([])
          setStage('answering')
          return
        }
        const asked = readQuestions(data.text ?? '')
        setQuestions(asked)
        setAnswers(asked.map(() => ''))
        setStage('answering')
      } catch {
        if (cancelled) return
        setProblem('Could not reach the writing service.')
        setQuestions([])
        setAnswers([])
        setStage('answering')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [stage, chosen])

  /*
    And the work. The only request in this app that asks for the largest
    model, and the reason this whole screen can be put down while it runs.
  */
  useEffect(() => {
    if (stage !== 'working' || !chosen) return
    const key = brainstormKey(chosen.docId, chosen.blockId)
    const { questions: asked, answers: given, onWorking: sayWorking } = latest.current
    let cancelled = false
    sayWorking(key)
    void (async () => {
      const said: Asked[] = asked.map((question, i) => ({
        question,
        answer: (given[i] ?? '').trim(),
      }))
      /*
        Retrieval once, not twice. `gatherSources` builds the search index
        over the whole collection, which is the expensive thing in this
        app — and the notes it picks are both what goes to the model and
        what the answer says it was written from, so they are the same
        list by construction rather than by coincidence.
      */
      const sources = sourcesFor(chosen, latest.current.docs)
      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...ask(chosen, sources, latest.current.items),
            action: 'brainstorm-solution',
            answers: said
              .filter((entry) => entry.answer)
              .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
              .join('\n\n'),
          }),
        })
        const data = (await response.json()) as { text?: string; error?: string }
        if (cancelled) return
        if (!response.ok || !data.text) {
          setProblem(data.error ?? 'Nothing came back. Try again.')
          setStage('answering')
          sayWorking(null)
          return
        }
        const { text, refusal } = readSolution(data.text)
        const solution: Solution = {
          key,
          task: chosen.text,
          asked: said,
          text,
          refusal,
          notes: sources.map((source) => source.title),
          at: Date.now(),
        }
        // Kept before it is shown, so minimising during the last second of
        // a request cannot be the difference between having it and not.
        saveSolution(solution)
        setResult(solution)
        setStage('done')
        sayWorking(null)
      } catch {
        if (cancelled) return
        setProblem('Could not reach the writing service. Nothing in your notes changed.')
        setStage('answering')
        sayWorking(null)
      }
    })()
    return () => {
      cancelled = true
      /*
        And the row stops saying it is being worked on, whatever ended
        this — including the one case the success path cannot cover:
        somebody closing the dialog while the request is in flight. There
        is nothing left to put an answer anywhere, so a row still reading
        "working on it" would say so until the page was reloaded.
      */
      sayWorking(null)
    }
  }, [stage, chosen])

  /** Put down, still running. Nothing is drawn and nothing is lost. */
  if (minimised) return null

  const keep = async () => {
    if (!result?.text || !chosen) return
    await onKeep({
      title: chosen.text,
      blocks: blocksFromPasted(parsePastedText(result.text)),
    })
    setKept(true)
  }

  const copy = () => {
    if (!result?.text) return
    navigator.clipboard?.writeText(result.text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {
        // Refused. The text is on screen and can be selected.
      },
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/25"
      />
      <div
        // Above the keyboard, and with a gap, exactly as the writing box
        // is — see compose-sheet.tsx, which has the whole reason.
        style={{ paddingBottom: keyboard ? keyboard + 16 : undefined }}
        className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:inset-y-0 sm:items-center"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Brainstorm"
          className="flex max-h-[85dvh] w-full max-w-xl flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-2xl"
        >
          <div className="mb-2 flex shrink-0 items-center gap-1.5">
            {chosen && stage !== 'working' && (
              <button
                type="button"
                onClick={() => {
                  setChosen(null)
                  setStage('pick')
                  setResult(null)
                  setProblem(null)
                }}
                aria-label="Pick something else"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
              >
                <ChevronLeft size={17} />
              </button>
            )}
            <Lightbulb size={15} className="shrink-0 text-[var(--color-accent)]" />
            <p className="min-w-0 truncate text-[14px] font-medium">Brainstorm</p>
            {/*
              Put it down, do not stop it. Only while there is something
              running: a minimise on a screen that is doing nothing is a
              second close button.
            */}
            {stage === 'working' && (
              <button
                type="button"
                onClick={onMinimise}
                className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
              >
                <Minus size={14} />
                Put it down
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)] ${
                stage === 'working' ? '' : 'ml-auto'
              }`}
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {stage === 'pick' && (
              <Pick items={items} onPick={(item) => {
                setChosen(item)
                setProblem(null)
                setStage('asking')
              }} />
            )}

            {chosen && stage !== 'pick' && (
              <p className="pad-serif mb-3 text-[16px] leading-snug font-medium">{chosen.text}</p>
            )}

            {stage === 'asking' && (
              <p className="flex items-center gap-2 py-6 text-[14px] text-[var(--color-muted)]">
                <LoaderCircle size={15} className="animate-spin" />
                Reading what your notes say about it…
              </p>
            )}

            {stage === 'answering' && (
              <Answering
                questions={questions}
                answers={answers}
                onAnswer={(i, value) =>
                  setAnswers((all) => all.map((old, n) => (n === i ? value : old)))
                }
              />
            )}

            {stage === 'working' && (
              <div className="py-6">
                <p className="flex items-center gap-2 text-[14px] text-[var(--color-muted)]">
                  <LoaderCircle size={15} className="animate-spin" />
                  Working out a solution…
                </p>
                <p className="mt-1.5 text-[13px] text-[var(--color-faint)]">
                  This one is worth waiting for, so it takes a moment. Put it down and carry on —
                  the row will say when it is ready.
                </p>
              </div>
            )}

            {stage === 'done' && result && (
              <Done
                solution={result}
                kept={kept}
                copied={copied}
                onKeep={() => void keep()}
                onCopy={copy}
                onAgain={() => {
                  setResult(null)
                  setProblem(null)
                  setStage('answering')
                }}
              />
            )}

            {problem && stage !== 'working' && (
              <p className="mt-3 text-[13px] text-[var(--color-danger)]">{problem}</p>
            )}
          </div>

          {stage === 'answering' && (
            <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-[var(--color-line)] pt-3">
              {/*
                Answering is never the price of an answer. Skipping writes
                from the notes alone, and the reply says what it could not
                know — which is the honest version of the same thing.
              */}
              <span className="min-w-0 text-[12px] text-[var(--color-faint)]">
                {answers.some((answer) => answer.trim())
                  ? 'Anything left blank is simply not known.'
                  : 'You can skip these.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setProblem(null)
                  setStage('working')
                }}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-5 text-[14px] font-medium text-white"
              >
                Work it out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** What is being asked about, and what it is being asked against. */
function ask(item: ActionItem, sources: Source[], items: ActionItem[]) {
  return {
    action: 'brainstorm-questions',
    task: `${item.text}${item.due ? ` (${item.due})` : ''} — from my note "${item.docTitle}"`,
    sources,
    list: digest(
      items.filter((other) => other.blockId !== item.blockId).slice(0, MAX_OTHERS),
    ),
  }
}

/**
 * The passages of somebody's notes that bear on one line.
 *
 * The line itself plus the name of the note it is in, put to the same
 * local index a search uses. The note it came from will always be among
 * them, which is the point: the context of a task is the note it was
 * written in.
 */
function sourcesFor(item: ActionItem, docs: Doc[]): Source[] {
  return gatherSources(docs, `${item.text} ${item.docTitle}`, {
    maxDocs: MAX_DOCS,
    totalChars: MAX_CHARS,
  })
}

/** Which one. The list, with the note each came from under it. */
function Pick({ items, onPick }: { items: ActionItem[]; onPick: (item: ActionItem) => void }) {
  const [query, setQuery] = useState('')
  const wanted = query.trim().toLowerCase()
  const shown = wanted
    ? items.filter((item) => `${item.text} ${item.docTitle}`.toLowerCase().includes(wanted))
    : items

  return (
    <>
      <p className="mb-2 text-[13px] text-[var(--color-muted)]">
        Pick one thing. It reads your notes for what bears on it, asks you what they do not say,
        and then writes whatever would actually help — the email, the plan, the outline.
      </p>
      {items.length > 8 && (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Which one?"
          aria-label="Find something outstanding"
          className="mb-1 w-full rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2 text-[14px] outline-none"
        />
      )}
      {shown.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-[var(--color-faint)]">
          Nothing here matches that.
        </p>
      ) : (
        <ul>
          {shown.map((item) => (
            <li key={item.blockId}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="w-full rounded-lg px-2 py-2.5 text-left hover:bg-[var(--color-hover)]"
              >
                <span className="block text-[14px] leading-snug">{item.text}</span>
                <span className="mt-0.5 block truncate text-[12px] text-[var(--color-faint)]">
                  {item.docTitle}
                  {item.due ? ` · ${item.due}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** The questions, and room to answer them. */
function Answering({
  questions,
  answers,
  onAnswer,
}: {
  questions: string[]
  answers: string[]
  onAnswer: (index: number, value: string) => void
}) {
  if (!questions.length) {
    return (
      <p className="text-[14px] text-[var(--color-muted)]">
        There was nothing worth asking. Press below and it will work from your notes.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {questions.map((question, i) => (
        <li key={question}>
          <label className="block">
            <span className="block text-[14px] leading-snug">{question}</span>
            <textarea
              value={answers[i] ?? ''}
              onChange={(event) => onAnswer(i, event.target.value)}
              rows={2}
              placeholder="A sentence is plenty. Or leave it."
              className="mt-1 w-full resize-none rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-2 text-[14px] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-faint)]"
            />
          </label>
        </li>
      ))}
    </ul>
  )
}

/** The answer, or the honest absence of one. */
function Done({
  solution,
  kept,
  copied,
  onKeep,
  onCopy,
  onAgain,
}: {
  solution: Solution
  kept: boolean
  copied: boolean
  onKeep: () => void
  onCopy: () => void
  onAgain: () => void
}) {
  if (solution.refusal) {
    return (
      <div>
        {/*
          A no, printed as the answer rather than as a fault. It is one of
          the two things this can come back with, and the screen says which
          in the same voice either way.
        */}
        <p className="rounded-xl border border-[var(--color-line)] bg-[var(--color-hover)] p-3 text-[14px] leading-relaxed">
          It could not work this one out. {solution.refusal}
        </p>
        <button
          type="button"
          onClick={onAgain}
          className="mt-3 flex items-center gap-1.5 rounded-full px-3 py-2 text-[14px] text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
        >
          <RotateCcw size={14} />
          Answer the questions and try again
        </button>
      </div>
    )
  }

  return (
    <div>
      <SolutionText text={solution.text} />
      {solution.notes.length > 0 && (
        <p className="mt-3 text-[12px] text-[var(--color-faint)]">
          Written from: {solution.notes.join(', ')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-line)] pt-3">
        <button
          type="button"
          onClick={onKeep}
          disabled={kept}
          className="flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {kept ? <Check size={14} /> : <NotebookPen size={14} />}
          {kept ? 'Kept as a note' : 'Keep it as a note'}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          {copied ? <Check size={14} className="text-[var(--color-good)]" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <RotateCcw size={14} />
          Again
        </button>
      </div>
    </div>
  )
}

/**
 * The reply, painted.
 *
 * Markdown as text rather than as HTML: headings become headings, the rest
 * is paragraphs, and nothing a model returns is ever put into the page as
 * markup. It is the same rule the editor follows and the reason a reply
 * cannot carry anything into this screen.
 */
export function SolutionText({ text }: { text: string }) {
  return (
    <div className="pad-serif space-y-2 text-[15px] leading-relaxed">
      {text.split('\n').map((line, i) => {
        const heading = /^\s*#{1,6}\s+(.*)$/.exec(line)
        if (heading) {
          return (
            <p key={i} className="pt-1 text-[14px] font-semibold tracking-tight">
              {heading[1]}
            </p>
          )
        }
        const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
        if (bullet) {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span aria-hidden className="text-[var(--color-faint)]">
                •
              </span>
              <span className="min-w-0">{marks(bullet[1])}</span>
            </p>
          )
        }
        if (!line.trim()) return null
        return <p key={i}>{marks(line)}</p>
      })}
    </div>
  )
}

/** Emphasis notation taken off, because this is read as text and not painted. */
function marks(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)/g, '')
}
