'use client'

import {
  ArrowDownNarrowWide,
  ChevronRight,
  LoaderCircle,
  Plus,
  Square,
  SquareCheck,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { byNote, digest, gatherActions, gatherDone, type ActionItem } from '@/lib/actions'
import { dismissKey, useDismissed } from '@/lib/dismissed'
import type { Doc } from '@/lib/types'
import Confirm from './confirm'
import SwipeAway from './swipe-away'

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
 * ## Grouped by note, because the note is the context
 *
 * Six lines from Tuesday's meeting are one piece of work with one set of names
 * and one reason for existing. Under that meeting's name they read with all of
 * it attached; scattered through a flat list of forty they are six separate
 * things to reconstruct. It is also what makes "I am finished with this
 * meeting" one press instead of six.
 *
 * ## Two kinds in a group, and the difference is the whole design
 *
 * A **box** is a box somebody drew. There is no guessing in it, ticking it
 * here ticks it in the note, and removing it takes that line out of the note —
 * because that is what the line was.
 *
 * A **suggestion** is prose this app read — string rules, no model, see
 * `lib/tasks.ts`. It says why it was picked, and the only thing offered is
 * turning it into a box, which is the reader agreeing. Turning one *down*
 * never touches a word of what they wrote: it is remembered as a no in
 * `lib/dismissed.ts` and simply stops being offered. A screen of guesses must
 * not be a way to lose writing.
 *
 * ## Done is folded away, not thrown away
 *
 * What is done is not what is to be done, so it is one quiet line that opens.
 * It is kept rather than discarded because "did I actually do that" is a real
 * question and the tick is the only record of the answer — and it can be
 * cleared for good when somebody decides it has stopped being one.
 *
 * ## Where the model comes in, and where it does not
 *
 * The list is complete without it: built on the device, offline, free, and
 * identical every time. The model is one button that puts it in an order —
 * pressed, never automatic, because a screen that spends money when you glance
 * at it is a screen people stop opening.
 */

export default function ActionsPanel({
  docs,
  aiReady,
  onOpen,
  onTick,
  onUntick,
  onMakeBox,
  onRemove,
}: {
  docs: Doc[]
  aiReady: boolean
  onOpen: (id: string) => void
  /** Ticks a box in the note it lives in. */
  onTick: (docId: string, blockId: string) => void
  /** Puts a ticked box back to unticked, in the note it lives in. */
  onUntick: (docId: string, blockId: string) => void
  /** Turns a line of prose into a box in the note it lives in. */
  onMakeBox: (docId: string, blockId: string) => void
  /** Takes lines out of a note for good. */
  onRemove: (docId: string, blockIds: string[]) => void
}) {
  /*
    Re-read whenever the notes change, which is what makes a tick here empty
    the row: the note is written, the note comes back changed, and the box is
    no longer outstanding a render later. Memoised because this reads every
    block of every note, and a tab on screen re-renders for reasons that have
    nothing to do with the notes.
  */
  const all = useMemo(() => gatherActions(docs), [docs])
  const done = useMemo(() => gatherDone(docs), [docs])
  const { has: turnedDown, add: turnDown } = useDismissed()

  /*
    A suggestion somebody has already said no to is not offered again. Boxes
    are never filtered: a box is a fact about the note, and the only way to be
    rid of one is to take the line out.
  */
  const live = all.filter((item) => item.kind === 'box' || !turnedDown(item.docId, item.blockId))
  const groups = byNote(live)

  const [read, setRead] = useState<string[] | null>(null)
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** Something asked about before it happens: a whole group, or the done list. */
  const [doomed, setDoomed] = useState<{ title: string; body: string; go: () => void } | null>(null)
  const [showDone, setShowDone] = useState(false)

  const sharpen = async () => {
    if (reading || !live.length) return
    setReading(true)
    setProblem(null)
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'actions', list: digest(live) }),
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

  /**
   * Getting rid of one line.
   *
   * A box is a line in a note, so it comes out of the note. A suggestion is
   * this app's guess about a line, so only the guess goes. Nothing here asks
   * first: a swipe is deliberate, one row is small, and a box that mattered is
   * one Ctrl+Z away inside the note it came from.
   */
  const away = (item: ActionItem) => {
    if (item.kind === 'box') onRemove(item.docId, [item.blockId])
    else turnDown([dismissKey(item.docId, item.blockId)])
  }

  /*
    A whole note's worth at once, which is how people actually finish with a
    meeting. This one asks, because it is several lines and some of them are
    writing rather than boxes.
  */
  const clearGroup = (docId: string, docTitle: string, items: ActionItem[]) =>
    setDoomed({
      title: `Clear everything from “${docTitle}”?`,
      body: `${items.length} ${items.length === 1 ? 'thing' : 'things'}. The ticked boxes come out of the note; the suggestions are only turned down, and nothing you wrote is touched.`,
      go: () => {
        const boxes = items.filter((item) => item.kind === 'box').map((item) => item.blockId)
        const lines = items
          .filter((item) => item.kind === 'line')
          .map((item) => dismissKey(item.docId, item.blockId))
        if (boxes.length) onRemove(docId, boxes)
        if (lines.length) turnDown(lines)
      },
    })

  const clearDone = () =>
    setDoomed({
      title: `Clear ${done.length} finished ${done.length === 1 ? 'thing' : 'things'}?`,
      body: 'Every ticked box comes out of the note it is in. The rest of the note is untouched.',
      go: () => {
        for (const group of byNote(done)) {
          onRemove(
            group.docId,
            group.items.map((item) => item.blockId),
          )
        }
      },
    })

  return (
    <div className="pb-4">
      {/*
        What matters most, when there is enough of a list for the question to
        mean anything. Below five items the order is already obvious and this
        would be a button that spends money to say what is on the screen.
      */}
      {aiReady && live.length >= 5 && (
        <section className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-hover)] p-3">
          <button
            type="button"
            onClick={() => void sharpen()}
            disabled={reading}
            className="flex items-center gap-2 text-[14px] font-medium text-[var(--color-accent)] disabled:opacity-60"
          >
            {/*
              An arrow putting a list in order, not a sparkle.

              A sparkle is the badge every app in the world now puts on
              anything a model touched, and it says nothing about what the
              button does — it says "this is the AI bit", which is a fact
              about how it was built rather than about what it is for. What
              this button does is put the list in an order, so it wears the
              picture of a list being put in an order.
            */}
            {reading ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <ArrowDownNarrowWide size={15} />
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
        </section>
      )}

      {groups.length === 0 ? (
        <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">
          {done.length
            ? 'Nothing outstanding. Everything you have written down is done.'
            : 'Tick boxes into your notes and they will be here.'}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.docId} className="mt-5">
            <div className="mb-1 flex items-center gap-2">
              {/*
                The note's name is the heading and the way into it. The note is
                the context, and a task read without it is a line somebody has
                to go and re-read anyway.
              */}
              <button
                type="button"
                onClick={() => onOpen(group.docId)}
                className="min-w-0 truncate text-left text-[13px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
              >
                {group.docTitle}
              </button>
              <span className="shrink-0 text-[12px] text-[var(--color-faint)]">
                {group.items.length}
              </span>
              <button
                type="button"
                onClick={() => clearGroup(group.docId, group.docTitle, group.items)}
                className="ml-auto shrink-0 rounded-full px-2 py-1 text-[12px] text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-danger)]"
              >
                Clear
              </button>
            </div>
            <ul className="border-t border-[var(--color-line)]">
              {group.items.map((item) => (
                <Row
                  key={item.blockId}
                  item={item}
                  onAway={() => away(item)}
                  onAct={() =>
                    item.kind === 'box'
                      ? onTick(item.docId, item.blockId)
                      : onMakeBox(item.docId, item.blockId)
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/*
        What is finished, behind a fold and saying nothing until it is opened.
        One line, because a list that keeps everything ever done at the bottom
        of it gets longer forever.
      */}
      {done.length > 0 && (
        <section className="mt-8 border-t border-[var(--color-line)] pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDone((on) => !on)}
              aria-expanded={showDone}
              className="flex items-center gap-1.5 text-[13px] text-[var(--color-faint)] hover:text-[var(--color-ink)]"
            >
              <ChevronRight
                size={14}
                className={`transition-transform ${showDone ? 'rotate-90' : ''}`}
              />
              Done
              <span>{done.length}</span>
            </button>
            {showDone && (
              <button
                type="button"
                onClick={clearDone}
                className="ml-auto rounded-full px-2 py-1 text-[12px] text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-danger)]"
              >
                Clear them for good
              </button>
            )}
          </div>
          {showDone && (
            <ul className="mt-1 border-t border-[var(--color-line)]">
              {done.map((item) => (
                <Row
                  key={item.blockId}
                  item={item}
                  onAway={() => onRemove(item.docId, [item.blockId])}
                  onAct={() => onUntick(item.docId, item.blockId)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <Confirm
        open={!!doomed}
        title={doomed?.title ?? ''}
        body={doomed?.body}
        confirmLabel="Clear"
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          doomed?.go()
          setDoomed(null)
        }}
      />
    </div>
  )
}

/**
 * One outstanding thing: the control that acts on it, the line itself, and
 * when it is due in the words it was written in.
 *
 * The note is not named on the row any more — the group above it says so, and
 * printing the same note's name six times in a column is six lines of noise
 * where one heading does the job.
 */
function Row({
  item,
  onAct,
  onAway,
}: {
  item: ActionItem
  /** Tick it, untick it, or turn a line into a box. */
  onAct: () => void
  /** Swiped off: out of the note if it is a box, turned down if it is a guess. */
  onAway: () => void
}) {
  const label = item.done
    ? `Put “${item.text}” back`
    : item.kind === 'box'
      ? `Tick “${item.text}”`
      : `Make “${item.text}” a box to tick`

  return (
    <li className="border-b border-[var(--color-line)] last:border-b-0">
      <SwipeAway onAway={onAway} label={item.kind === 'box' ? 'Delete' : 'Not a task'}>
        <div className="flex items-start gap-2.5 py-2.5">
          <button
            type="button"
            onClick={onAct}
            aria-label={label}
            title={item.kind === 'line' ? 'Make it a box to tick' : undefined}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-accent)]"
          >
            {item.done ? <SquareCheck size={16} /> : item.kind === 'box' ? <Square size={16} /> : <Plus size={16} />}
          </button>
          <div className="min-w-0 flex-1">
            <p
              className={`text-[15px] leading-snug ${
                item.done ? 'text-[var(--color-faint)] line-through' : ''
              }`}
            >
              {item.text}
            </p>
            {(item.due || item.reason) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--color-faint)]">
                {item.due && <span className="text-[var(--color-muted)]">{item.due}</span>}
                {/* Why a guess was made, next to the guess. A suggestion whose
                    reasoning is hidden is one nobody can disagree with usefully. */}
                {item.reason && <span>{item.reason}</span>}
              </p>
            )}
          </div>
        </div>
      </SwipeAway>
    </li>
  )
}

/**
 * The model's answer, as lines.
 *
 * It is asked for markdown bullets and it usually returns them, but "usually"
 * is not a thing to build a screen on: anything that is not a bullet is kept
 * as its own line rather than dropped, for the same reason `lib/compose.ts`
 * reads a reply forgivingly. Losing an answer to a stray "Sure —" is worse
 * than showing one line with no dash in front of it.
 */
function bullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim())
    // Markdown emphasis is notation here, not painting: this is read as text.
    .map((line) => line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)/g, ''))
    .filter(Boolean)
}
