'use client'

import {
  ChevronRight,
  FileText,
  Plus,
  Square,
  SquareCheck,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { byNote, gatherDone, type ActionItem } from '@/lib/actions'
import { dismissKey, useDismissed } from '@/lib/dismissed'
import type { Doc, RemovedBlock } from '@/lib/types'
import Confirm from './confirm'
import DocIcon from './doc-icon'
import Sheet from './sheet'
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
 * ## A row opens; it does not act
 *
 * Pressing the line opens what is known about it: the words, which note they
 * are in, when it is for, and whatever Brainstorm has worked out. Nothing
 * about the note changes by opening it, and nothing about the note changes by
 * closing it either. The two controls that *do* change something — the tick
 * and the swipe — are where they were.
 *
 * Correcting the wording from in there does write into the note, because in
 * your own notes the task *is* the line and there is nowhere else for a
 * correction to live. The sheet says so, in those words, above the field.
 *
 * ## Asked first, and undoable after
 *
 * Getting rid of a box takes that line out of the note, which is the one
 * thing on this screen that is writing rather than a guess about writing. So
 * it asks — naming the line — and then, for five seconds, offers to put it
 * back exactly where it was. Both, not one: the question stops the swipe
 * nobody meant, and the undo covers the "yes" that was pressed too quickly,
 * which is the mistake a question cannot catch.
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
 * identical every time. The model is one button — Brainstorm — and it takes
 * one item at a time, pressed, never automatic, because a screen that spends
 * money when you glance at it is a screen people stop opening.
 */

/** How long an undo stays on offer. Long enough to notice, short enough that
    the bar is not furniture. */
const UNDO_SECONDS = 5

/**
 * What one undo can put back.
 *
 * Two shapes in one, because the two things this screen takes away are two
 * different kinds of thing: `removed` is lines that came out of a note, and
 * `keys` are suggestions that were turned down. A clear of a whole group can
 * be both at once.
 */
interface Undoable {
  /** What to call it on the bar, as the bar will say it. */
  label: string
  docId?: string
  removed?: RemovedBlock[]
  keys?: string[]
  /**
   * Anything else that putting it back means.
   *
   * Ticking is the third thing this screen does that takes a row off the
   * list, and the only one that was not undoable — which made it the
   * easiest mistake on a screen of small boxes under a thumb. It is not a
   * delete, so there is nothing to put back: the undo is simply the
   * opposite action, and it goes on the same bar as the other two rather
   * than inventing a second one.
   */
  put?: () => void
}

export default function ActionsPanel({
  docs,
  items,
  onOpen,
  onTick,
  onUntick,
  onMakeBox,
  onRetext,
  onRemove,
  onPutBack,
}: {
  docs: Doc[]
  /**
   * Everything outstanding, gathered once by the screen above.
   *
   * It is read there rather than here because the tab has to wear the
   * number whether or not it is the tab you are on — and two places
   * reading every block of every note is the same expensive answer worked
   * out twice, with nothing stopping them disagreeing.
   */
  items: ActionItem[]
  onOpen: (id: string) => void
  /** Ticks a box in the note it lives in. */
  onTick: (docId: string, blockId: string) => void
  /** Puts a ticked box back to unticked, in the note it lives in. */
  onUntick: (docId: string, blockId: string) => void
  /** Turns a line of prose into a box in the note it lives in. */
  onMakeBox: (docId: string, blockId: string) => void
  /** Corrects the wording of the line, in the note it lives in. */
  onRetext: (docId: string, blockId: string, text: string) => void
  /** Takes lines out of a note. What comes back is where each one was. */
  onRemove: (docId: string, blockIds: string[]) => Promise<RemovedBlock[]>
  /** Puts them back there. */
  onPutBack: (docId: string, removed: RemovedBlock[]) => void
}) {
  /*
    What is finished is read here, because nothing else wants it: it is only
    ever drawn behind the fold at the bottom of this screen. Memoised because
    it reads every block of every note, and this tab re-renders for reasons
    that have nothing to do with the notes.
  */
  const done = useMemo(() => gatherDone(docs), [docs])
  const { add: turnDown, remove: offerAgain } = useDismissed()

  const groups = byNote(items)

  /** Something asked about before it happens: a whole group, or the done list. */
  const [doomed, setDoomed] = useState<{ title: string; body: string; go: () => void } | null>(null)
  const [showDone, setShowDone] = useState(false)
  /** Which row is open, if any. Opening one changes nothing about the note. */
  const [open, setOpen] = useState<ActionItem | null>(null)
  /**
   * What the undo bar is currently offering to put back, and how long is
   * left of the five seconds.
   *
   * `left` is counted down by an interval rather than worked out from a
   * timestamp on every frame: this is one number changing five times, and a
   * running animation for it would be five seconds of work to say what one
   * digit says.
   */
  const [undoable, setUndoable] = useState<Undoable | null>(null)
  const [left, setLeft] = useState(UNDO_SECONDS)

  const offer = (next: Undoable) => {
    setUndoable(next)
    setLeft(UNDO_SECONDS)
  }

  /*
    The clock on the offer. Both timers live here, so the bar cannot outlive
    its own countdown — and both are cleared when a second delete replaces
    the first, which is what makes the five seconds start again rather than
    the bar vanishing early.
  */
  useEffect(() => {
    if (!undoable) return
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    const over = setTimeout(() => setUndoable(null), UNDO_SECONDS * 1000)
    return () => {
      clearInterval(tick)
      clearTimeout(over)
    }
  }, [undoable])

  const undo = () => {
    if (!undoable) return
    if (undoable.removed?.length && undoable.docId) onPutBack(undoable.docId, undoable.removed)
    if (undoable.keys?.length) offerAgain(undoable.keys)
    undoable.put?.()
    setUndoable(null)
  }

  /**
   * Ticking something, with five seconds to say it was the wrong one.
   *
   * A tick takes the row off the list, which on a phone is the same
   * disappearance a delete causes and happens by accident about as often:
   * the boxes are small, they are under a scrolling thumb, and the row
   * that was there a moment ago is now somewhere in a fold at the bottom
   * of the screen. Nothing is lost either way — it is written into the
   * note and can be found under Done — but "where did that go" is a
   * question the undo bar answers in the second it is asked.
   */
  const tick = (item: ActionItem) => {
    onTick(item.docId, item.blockId)
    offer({
      label: item.text,
      put: () => onUntick(item.docId, item.blockId),
    })
  }

  /** The note a group came from, for the picture beside its name. */
  const noteFor = (docId: string) => docs.find((doc) => doc.id === docId)

  /**
   * Getting rid of one line.
   *
   * A box is a line in a note, so getting rid of it takes that line out of
   * the note — which is writing, so it asks first and names the line. A
   * suggestion is only this app's guess about a line, so nothing is deleted
   * and nothing is asked; the no is remembered and the words stay exactly
   * where they were.
   *
   * Both end up on the undo bar, because both take a row off the screen and
   * a gesture on a phone is easy to make by accident.
   */
  const away = (item: ActionItem) => {
    if (item.kind === 'box') {
      setDoomed({
        title: `Delete “${item.text}”?`,
        body: 'The line comes out of the note it is in. You can undo it for a few seconds.',
        go: () => void deleteBoxes(item.docId, [item.blockId], item.text),
      })
      return
    }
    const key = dismissKey(item.docId, item.blockId)
    turnDown([key])
    offer({ label: item.text, keys: [key] })
  }

  /**
   * Takes boxes out of a note and puts the undo on offer.
   *
   * The lines are held here, in this component, for as long as the bar is up
   * — not written anywhere and not kept past it. An undo that survived a
   * reload would be a second, invisible copy of somebody's writing living
   * somewhere they cannot see; five seconds is a mistake being corrected, and
   * anything longer is the note's own Ctrl+Z, which has been there all along.
   */
  const deleteBoxes = async (docId: string, blockIds: string[], label: string) => {
    const removed = await onRemove(docId, blockIds)
    if (removed.length) offer({ label, docId, removed })
  }

  /*
    A whole note's worth at once, which is how people actually finish with a
    meeting. This one asks, because it is several lines and some of them are
    writing rather than boxes.
  */
  const clearGroup = (docId: string, docTitle: string, group: ActionItem[]) =>
    setDoomed({
      title: `Clear everything from “${docTitle}”?`,
      body: `${group.length} ${group.length === 1 ? 'thing' : 'things'}. The ticked boxes come out of the note; the suggestions are only turned down, and nothing you wrote is touched. You can undo it for a few seconds.`,
      go: () => {
        const boxes = group.filter((item) => item.kind === 'box').map((item) => item.blockId)
        const lines = group
          .filter((item) => item.kind === 'line')
          .map((item) => dismissKey(item.docId, item.blockId))
        if (lines.length) turnDown(lines)
        void (async () => {
          const removed = boxes.length ? await onRemove(docId, boxes) : []
          // One offer for the whole group, because clearing a meeting is one
          // action however many lines it took.
          offer({ label: docTitle, docId, removed, keys: lines })
        })()
      },
    })

  const clearDone = () =>
    setDoomed({
      title: `Clear ${done.length} finished ${done.length === 1 ? 'thing' : 'things'}?`,
      body: 'Every ticked box comes out of the note it is in. The rest of the note is untouched, and you can undo it for a few seconds.',
      go: () => {
        void (async () => {
          const groups = byNote(done)
          /*
            One note at a time, and only the last one is offered back.

            An undo bar can hold one note's lines, because putting lines back
            is a write per note and a bar with several notes on it would have
            to say which — at which point it is a list, not an undo. The
            honest version of that is the note's own Ctrl+Z, which has every
            one of them.
          */
          for (const group of groups) {
            const removed = await onRemove(
              group.docId,
              group.items.map((item) => item.blockId),
            )
            if (group === groups[groups.length - 1] && removed.length) {
              offer({ label: `${done.length} finished`, docId: group.docId, removed })
            }
          }
        })()
      },
    })

  return (
    <div className="pb-4">
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
              {/*
                The note's own picture, the same one its row in the list
                wears. A column of six group headings in identical grey is
                six things to read one at a time; the icon is what makes
                "that was the meeting one" findable without reading. It
                costs nothing — a table of words in lib/doc-icon.ts — and
                it is the same answer here as on the note.
              */}
              {noteFor(group.docId) && (
                <DocIcon
                  doc={noteFor(group.docId)!}
                  size={14}
                  className="shrink-0 text-[var(--color-faint)]"
                />
              )}
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
                  onOpen={() => setOpen(item)}
                  onAway={() => away(item)}
                  onAct={() =>
                    item.kind === 'box' ? tick(item) : onMakeBox(item.docId, item.blockId)
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
                  onOpen={() => setOpen(item)}
                  onAway={() => away(item)}
                  onAct={() => onUntick(item.docId, item.blockId)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/*
        The undo, above the bar that writes a note.

        Fixed, because the row it is about may be halfway up a list somebody
        has since scrolled, and an undo you have to go and find is not an
        undo. It says what went and how long is left, and it is the only
        thing in this app that counts down — five seconds, so it is gone
        before it becomes furniture.
      */}
      {undoable && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-30 px-4">
          <div className="pointer-events-auto mx-auto flex w-full max-w-5xl items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] py-2 pr-2 pl-4 shadow-lg">
            <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-muted)]">
              {/* A tick is not a delete, and a bar that says it is would
                  read as data loss for the one action here that loses
                  nothing at all. */}
              {undoable.put ? 'Ticked' : 'Deleted'} “{undoable.label}”
            </p>
            <span aria-hidden className="shrink-0 text-[12px] text-[var(--color-faint)]">
              {left}
            </span>
            <button
              type="button"
              onClick={undo}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
            >
              <Undo2 size={14} />
              Undo
            </button>
          </div>
        </div>
      )}

      {open && (
        <Sheet title={open.kind === 'box' ? 'This task' : 'This line'} onClose={() => setOpen(null)}>
          <Detail
            item={open}
            onRetext={(text) => {
              onRetext(open.docId, open.blockId, text)
              setOpen(null)
            }}
            onOpenNote={() => {
              setOpen(null)
              onOpen(open.docId)
            }}
            onAway={() => {
              setOpen(null)
              away(open)
            }}
          />
        </Sheet>
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
 *
 * Pressing the line opens it rather than doing anything to it. That is the
 * distinction the whole row is arranged around: the tick and the swipe change
 * the note, and everything else on here only shows you more.
 */
function Row({
  item,
  onAct,
  onAway,
  onOpen,
}: {
  item: ActionItem
  /** Tick it, untick it, or turn a line into a box. */
  onAct: () => void
  /** Swiped off: out of the note if it is a box, turned down if it is a guess. */
  onAway: () => void
  /** Opens what is known about it. Changes nothing. */
  onOpen: () => void
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
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open “${item.text}”`}
            className="min-w-0 flex-1 text-left"
          >
            <span
              className={`block text-[15px] leading-snug ${
                item.done ? 'text-[var(--color-faint)] line-through' : ''
              }`}
            >
              {item.text}
            </span>
            {(item.due || item.reason) && (
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--color-faint)]">
                {item.due && <span className="text-[var(--color-muted)]">{item.due}</span>}
                {/* Why a guess was made, next to the guess. A suggestion whose
                    reasoning is hidden is one nobody can disagree with usefully. */}
                {item.reason && <span>{item.reason}</span>}
              </span>
            )}
          </button>
        </div>
      </SwipeAway>
    </li>
  )
}

/**
 * Everything known about one line, and the one thing that changes it.
 *
 * Opening this does nothing to the note. Correcting the wording does, and
 * says so: in your own notes the task *is* the line, so there is nowhere
 * else for a correction to go, and a second edited copy of somebody's
 * writing living beside a note that disagrees with it is not a trade this
 * app makes anywhere else.
 */
function Detail({
  item,
  onRetext,
  onOpenNote,
  onAway,
}: {
  item: ActionItem
  onRetext: (text: string) => void
  onOpenNote: () => void
  onAway: () => void
}) {
  const [text, setText] = useState(item.text)
  const changed = text.trim() !== item.text && !!text.trim()

  return (
    <div>
      {/*
        Room to write in, not a slot to correct a typo in.

        It was two lines high, which is the height of the line it holds and
        therefore the height at which every correction longer than the
        original scrolls inside a box the size of a stamp. This is a field
        somebody rewrites a sentence in, so it is the size of a few
        sentences.
      */}
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        aria-label="The words of this line"
        className="pad-serif min-h-[6rem] w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[var(--color-faint)]"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] text-[var(--color-faint)]">
          {/* Said before it happens, not after. */}
          This is a line in “{item.docTitle}”. Correcting it here corrects it there.
        </p>
        <button
          type="button"
          onClick={() => onRetext(text)}
          disabled={!changed}
          className="shrink-0 rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {(item.due || item.reason) && (
        <p className="mt-2 flex flex-wrap gap-x-2 text-[12px] text-[var(--color-muted)]">
          {item.due && <span>{item.due}</span>}
          {item.reason && <span className="text-[var(--color-faint)]">{item.reason}</span>}
        </p>
      )}

      <div className="mt-3 space-y-1 border-t border-[var(--color-line)] pt-2">
        <button
          type="button"
          onClick={onOpenNote}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] hover:bg-[var(--color-hover)]"
        >
          <FileText size={15} className="shrink-0 text-[var(--color-muted)]" />
          <span className="min-w-0 truncate">Open “{item.docTitle}”</span>
        </button>
        <button
          type="button"
          onClick={onAway}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] text-[var(--color-danger)] hover:bg-[var(--color-hover)]"
        >
          <Trash2 size={15} className="shrink-0" />
          {item.kind === 'box' ? 'Take this line out of the note' : 'Not a task'}
        </button>
      </div>
    </div>
  )
}
