'use client'

import { LoaderCircle, Plus, Sparkles, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { digest, gatherActions, type ActionItem } from '@/lib/actions'
import type { Doc } from '@/lib/types'

/**
 * Everything still to be done, read out of every note at once.
 *
 * ## Why this is a tab and not a feature inside a note
 *
 * Because nobody writes their tasks in one place. They are written where they
 * happened: a box drawn into a meeting note, "ring the landlord" in the middle
 * of a paragraph about a boiler, "send the figures by Friday" under a heading
 * in a note about something else. Every one of them is findable and none of
 * them is *found*, which is how a fortnight goes by.
 *
 * So this reads the lot. Nothing is moved and nothing is copied into a second
 * list: the note each line came from is named on the row and one press away,
 * because the note is the context and a task without its context is a line
 * somebody has to go and re-read anyway.
 *
 * ## Two groups, and the difference is the whole design
 *
 * **Still to do** is boxes somebody drew. There is no guessing in it, ticking
 * one here ticks it in the note, and it is first because it is certain.
 *
 * **Looks like something to do** is prose this app read — string rules, no
 * model, see `lib/tasks.ts`. Every row says why it was picked and the only
 * thing offered is turning it into a box, which is the reader agreeing. Whether
 * "speak to Sam about the lease" is a task or a description of something that
 * already happened is not decidable from the sentence, which is exactly why
 * nothing here acts on its own.
 *
 * ## Where the model comes in, and where it does not
 *
 * The list is complete without it: it is built on the device, offline, free,
 * and identical every time. The model is one button that puts forty lines into
 * an order and groups the ones that are the same piece of work — pressed,
 * never automatic, because a screen that spends money when you glance at it is
 * a screen people stop opening, and because with no key at all this tab still
 * has to work.
 */

export default function ActionsPanel({
  docs,
  aiReady,
  onOpen,
  onTick,
  onMakeBox,
}: {
  docs: Doc[]
  aiReady: boolean
  onOpen: (id: string) => void
  /** Ticks a box in the note it lives in. */
  onTick: (docId: string, blockId: string) => void
  /** Turns a line of prose into a box in the note it lives in. */
  onMakeBox: (docId: string, blockId: string) => void
}) {
  /*
    Re-read whenever the notes change, which is what makes a tick here empty
    the row: the note is written, the note comes back changed, and the box is
    no longer outstanding. Memoised because it reads every block of every note
    and a tab that is on screen re-renders for reasons that have nothing to do
    with the notes.
  */
  const items = useMemo(() => gatherActions(docs), [docs])
  const boxes = items.filter((item) => item.kind === 'box')
  const lines = items.filter((item) => item.kind === 'line')

  const [read, setRead] = useState<string[] | null>(null)
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const sharpen = async () => {
    if (reading || !items.length) return
    setReading(true)
    setProblem(null)
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'actions', list: digest(items) }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) {
        setProblem(data.error ?? 'That did not work. Try again.')
        return
      }
      setRead(bullets(data.text))
    } catch {
      // The list below is untouched by this failing, and that is the point.
      setProblem('Could not reach the writing service. Your list is all here.')
    } finally {
      setReading(false)
    }
  }

  if (!items.length) {
    return (
      <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">
        Tick boxes into your notes and they will be here.
      </p>
    )
  }

  return (
    <div className="pb-4">
      {/*
        What matters most, when there is enough of a list for the question to
        mean anything. Below five items the order is already obvious and this
        would be a button that spends money to tell somebody what they can see.
      */}
      {aiReady && items.length >= 5 && (
        <section className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-hover)] p-3">
          <button
            type="button"
            onClick={() => void sharpen()}
            disabled={reading}
            className="flex items-center gap-2 text-[14px] font-medium text-[var(--color-accent)] disabled:opacity-60"
          >
            {reading ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Sparkles size={15} />
            )}
            {reading ? 'Reading your list…' : read ? 'Read it again' : 'What should I do first?'}
          </button>
          {problem && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{problem}</p>}
          {read && read.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {read.map((line, i) => (
                <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
                  <span className="text-[var(--color-accent)]">•</span>
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-[var(--color-faint)]">
            Only these lines are sent, never your notes.
          </p>
        </section>
      )}

      {boxes.length > 0 && (
        <Group label="Still to do" count={boxes.length}>
          {boxes.map((item) => (
            <Row key={`${item.docId}:${item.blockId}`} item={item} onOpen={onOpen}>
              <button
                type="button"
                onClick={() => onTick(item.docId, item.blockId)}
                aria-label={`Tick “${item.text}”`}
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-accent)]"
              >
                <Square size={16} />
              </button>
            </Row>
          ))}
        </Group>
      )}

      {lines.length > 0 && (
        <Group label="Looks like something to do" count={lines.length}>
          {lines.map((item) => (
            <Row key={`${item.docId}:${item.blockId}`} item={item} onOpen={onOpen}>
              {/*
                The offer, not the act. Pressing it writes a box into the note
                where the line already is — the line is not moved, not copied
                and not reworded.
              */}
              <button
                type="button"
                onClick={() => onMakeBox(item.docId, item.blockId)}
                aria-label={`Make “${item.text}” a box to tick`}
                title="Make it a box to tick"
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-accent)]"
              >
                <Plus size={16} />
              </button>
            </Row>
          ))}
        </Group>
      )}
    </div>
  )
}

function Group({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="mt-5">
      <h2 className="mb-1 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
        {label}
        <span className="font-normal normal-case">{count}</span>
      </h2>
      <ul>{children}</ul>
    </section>
  )
}

/**
 * One outstanding thing: the control that acts on it, the line itself, when it
 * is due in the words it was written in, and the note it came out of.
 *
 * The note's name is a press, and it is the only press that leaves this
 * screen: the row itself is not a link, because a row whose whole surface
 * navigates makes the tick beside it feel like it might too.
 */
function Row({
  item,
  onOpen,
  children,
}: {
  item: ActionItem
  onOpen: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-2.5 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
      {children}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug">{item.text}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--color-faint)]">
          <button
            type="button"
            onClick={() => onOpen(item.docId)}
            className="max-w-[16rem] truncate text-left underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            {item.docTitle}
          </button>
          {item.due && (
            <span className="text-[var(--color-muted)]">
              <Dot />
              {item.due}
            </span>
          )}
          {/* Why a guess was made, next to the guess. A suggestion whose
              reasoning is hidden is one nobody can disagree with usefully. */}
          {item.reason && (
            <span>
              <Dot />
              {item.reason}
            </span>
          )}
        </p>
      </div>
    </li>
  )
}

/**
 * What separates the note's name from the date and the reason.
 *
 * A gap alone runs three unrelated facts into one phrase — "Lease meeting
 * before Tuesday starts with an action" reads as a sentence and is not one.
 */
function Dot() {
  return <span className="mr-2 text-[var(--color-line)]">·</span>
}

/**
 * The model's answer, as lines.
 *
 * It is asked for markdown bullets and it usually returns them, but "usually"
 * is not a thing to build a screen on: anything that is not a bullet is kept
 * as its own line rather than dropped, for the same reason `lib/compose.ts`
 * reads a reply forgivingly. Losing an answer to a stray "Sure —" is worse
 * than showing one line that has no dash in front of it.
 */
function bullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim())
    // Markdown emphasis is notation here, not painting: this is read as text.
    .map((line) => line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)/g, ''))
    .filter(Boolean)
}
