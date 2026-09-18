'use client'

import { ListChecks } from 'lucide-react'
import { useState } from 'react'
import { blocksFromPasted } from '@/lib/blocks'
import { nextListPrefix, splitComposed, titleFrom } from '@/lib/compose'
import { currentDraft, dropDraft, keepDraft } from '@/lib/draft'
import { parsePastedText } from '@/lib/paste'
import type { Block } from '@/lib/types'
import ComposeSheet from './compose-sheet'

/**
 * The text of a note, as the lines somebody actually typed.
 *
 * `parsePastedText` rejoins single-newline lines into one paragraph, which is
 * right for a hard-wrapped email off the clipboard and wrong here: in a box
 * you are writing in, Return between two thoughts means two lines. Doubling
 * the newlines says so in the one vocabulary that parser has.
 */
function asLines(text: string) {
  return parsePastedText(text.replace(/\n/g, '\n\n'))
}

/**
 * Write a note: a box, and then it is a note.
 *
 * ## Why this is not just "open a new note"
 *
 * Because most notes are not written, they are *dashed off* — three lines in a
 * corridor, in shorthand, while somebody is still talking. Opening a full page
 * with a caret in it asks for a document; a box that takes what you type and
 * closes asks for a thought. The difference is the difference between an app
 * people keep and an app people mean to use.
 *
 * So what it is for the writer: type, press save, done. What happens next is
 * the model's job — a name, full sentences, the things to do as boxes to tick
 * — and by the time they look at the list it is there, written up.
 *
 * ## What happens when that fails
 *
 * The note is saved exactly as it was typed, with a name taken from its first
 * line. No key, no network, a refusal, a timeout: all of them cost the tidying
 * and none of them costs the note. That is the same bargain every other model
 * call in this app makes, and it is the reason the local path is written
 * first and the request second.
 *
 * ## Closing it does not throw it away
 *
 * A pop-up can be closed by every accident a phone has — the back gesture, a
 * press that landed slightly outside, being switched away from. So what was
 * in the box is kept as a draft, the bar says there is one, and opening the
 * box again has the words still in it with the caret at the end. See
 * `lib/draft.ts`. It is dropped the moment the note is actually saved.
 */
export default function ComposeNote({
  open,
  aiReady,
  onClose,
  onSave,
}: {
  open: boolean
  /** Whether a key is configured. Decides whether writing up is offered. */
  aiReady: boolean
  onClose: () => void
  /** Hands over the finished note: what it is called, its lines, and whether
      the Actions tab should read it. */
  onSave: (note: { title: string; blocks: Block[]; ignoreTasks?: boolean }) => void
}) {
  /*
    Whatever was being written when this was last closed. A lazy initial
    state rather than an effect, so the box opens with the words already in
    it instead of blank for a frame — and this component is never rendered
    on the server, so reading storage here is safe.
  */
  const [text, setText] = useState(currentDraft)
  /*
    Whether this note is one the Actions tab reads.

    On, because it is right for most notes and because a question answered
    before it is asked is a question nobody has to think about. Off is for the
    notes where it is plainly wrong — a diary, a page of quotes, a draft of
    something — and it is asked here, while the note is being written, because
    that is the one moment somebody knows what kind of note this is. It is not
    a final answer either way: the note's own menu can change it afterwards.
  */
  const [findTasks, setFindTasks] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /*
    Opened again: the draft comes back, and nothing else does. The problem
    from last time is not this attempt's problem, and the switch starts on
    for the same reason it does on a fresh note.
  */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setText(currentDraft())
      setProblem(null)
      setBusy(false)
      setFindTasks(true)
    }
  }

  if (!open) return null

  /**
   * Return inside a list carries the list on.
   *
   * A box you write a list in that does not do this is a box where every item
   * after the first is typed by hand. The rule itself is in `lib/compose.ts`
   * and is a unit test; this is the part that needs a textarea.
   *
   * `execCommand` rather than setting `value`: it keeps the browser's own undo
   * stack, so one Ctrl+Z takes the marker back out — the same reason every
   * automatic change on the writing page is made that way.
   */
  const carryList = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget
    const at = el.selectionStart
    if (at !== el.selectionEnd) return
    const before = el.value.slice(0, at)
    const line = before.slice(before.lastIndexOf('\n') + 1)
    const prefix = nextListPrefix(line)
    if (prefix === null) return

    event.preventDefault()
    if (prefix === '') {
      /*
        An empty item: take the marker off and stay on the line, which is how
        a list ends everywhere else in this app.

        `setRangeText` rather than a selection and `execCommand`: asking
        execCommand to insert an empty string is a delete by implication, and
        what it actually deleted was one character more than was selected —
        the line break above it — so the next thing typed joined the line
        before. This says exactly which characters go, and nothing else moves.
      */
      el.setRangeText('', at - line.length, at, 'end')
      setText(el.value)
      return
    }
    document.execCommand('insertText', false, `\n${prefix}`)
    setText(el.value)
  }

  const save = async () => {
    const typed = text.trim()
    if (!typed || busy) return

    /*
      The note as it was typed, worked out before anything is asked of the
      network. If the request fails, this is what is saved — so the failure
      path is not an error message, it is a slightly less tidy note.
    */
    const asTyped = {
      title: titleFrom(typed),
      blocks: blocksFromPasted(asLines(typed)),
      // Absent rather than false when it is on, which is how every optional
      // field on a note is written: a note nobody said anything about looks
      // exactly like one written before the question existed.
      ...(findTasks ? {} : { ignoreTasks: true }),
    }

    if (!aiReady) {
      onSave(asTyped)
      dropDraft()
      onClose()
      return
    }

    setBusy(true)
    setProblem(null)
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compose', text: typed }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) {
        onSave(asTyped)
        dropDraft()
        onClose()
        return
      }
      const { title, body } = splitComposed(data.text)
      onSave({
        title: title || asTyped.title,
        blocks: body ? blocksFromPasted(asLines(body)) : asTyped.blocks,
        ...(findTasks ? {} : { ignoreTasks: true }),
      })
      // It is a note now. A draft that outlives the thing it became is a
      // second copy nobody asked for.
      dropDraft()
      onClose()
    } catch {
      // Offline, or the request never arrived. The note is still the note.
      onSave(asTyped)
      dropDraft()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <ComposeSheet
      title="Write a note"
      value={text}
      onChange={setText}
      /*
        Closing keeps it. A pop-up can be shut by every accident a phone
        has, and three lines lost that way is the worst thing this app can
        do — so the words go to `lib/draft.ts`, the bar says there is a
        draft, and opening the box again has them back.
      */
      onClose={(kept) => {
        keepDraft(kept)
        onClose()
      }}
      onSave={() => void save()}
      saveLabel={busy ? 'Writing it up…' : 'Save'}
      busy={busy}
      label="What happened"
      placeholder="Anything. Shorthand is fine — it gets written up."
      /*
        Return at the end of a list item carries the list on. The rule is
        in `lib/compose.ts` and is a unit test; this is the part that needs
        the textarea, which is why the shell offers first refusal on a key.
      */
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) carryList(event)
      }}
      beside={
        <>
          {/*
            One switch, and it answers the one question about this note
            that only the person writing it can answer: whether the app
            should go looking for things to do in it. Off is quiet and
            plain rather than a warning — leaving a note out of the Actions
            tab is an ordinary choice, not a mistake.
          */}
          <button
            type="button"
            role="switch"
            aria-checked={findTasks}
            /*
              The keyboard stays up. Pressing any button moves the focus off
              the textarea and a phone takes the keys down with it, so
              answering a question about the note you are writing threw you
              out of writing it. `preventDefault` on mousedown stops the
              focus moving; the click still arrives.
            */
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setFindTasks((on) => !on)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <span
              aria-hidden
              className={`flex h-4 w-4 items-center justify-center rounded border ${
                findTasks
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-line)]'
              }`}
            >
              {findTasks && <ListChecks size={11} />}
            </span>
            Find tasks in this note
          </button>
          {problem && (
            <span role="status" className="ml-2 text-[13px] text-[var(--color-danger)]">
              {problem}
            </span>
          )}
        </>
      }
    />
  )
}
