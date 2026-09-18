'use client'

import { ListChecks, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { blocksFromPasted } from '@/lib/blocks'
import { nextListPrefix, splitComposed, titleFrom } from '@/lib/compose'
import { parsePastedText } from '@/lib/paste'
import type { Block } from '@/lib/types'
import { useKeyboardInset } from './keyboard'

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
  const [text, setText] = useState('')
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
  const box = useRef<HTMLTextAreaElement>(null)
  const keyboard = useKeyboardInset()

  // The caret goes in the box, because there is nothing else on this screen to
  // press. Opening a writing box and having to click it first is a small
  // insult repeated every time.
  useEffect(() => {
    if (open) box.current?.focus()
  }, [open])

  /* Cleared between notes, so the box is never opened holding the last one. */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setText('')
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
        onClose()
        return
      }
      const { title, body } = splitComposed(data.text)
      onSave({
        title: title || asTyped.title,
        blocks: body ? blocksFromPasted(asLines(body)) : asTyped.blocks,
        ...(findTasks ? {} : { ignoreTasks: true }),
      })
      onClose()
    } catch {
      // Offline, or the request never arrived. The note is still the note.
      onSave(asTyped)
      onClose()
    } finally {
      setBusy(false)
    }
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
        role="dialog"
        aria-label="Write a note"
        aria-modal="true"
        /*
          At the bottom on a phone, where the thumb already is; a panel in the
          middle of the screen on a desktop. Centred by a flex parent rather
          than by `left-1/2`, because an inline or higher-specificity
          horizontal position is exactly what collapses a full-width sheet to
          the width of its own text.

          The padding is what keeps it above the keyboard. A phone does not
          make the page shorter when the keys come up — it draws them over the
          bottom of it — so a sheet pinned to the bottom is underneath them at
          the exact moment somebody is typing into it. See keyboard.ts. It is
          an inline style because it is a number that changes as the keyboard
          opens, and it is zero on every screen that has no keyboard, so it
          never fights the desktop layout.
        */
        style={{ paddingBottom: keyboard }}
        className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:inset-y-0 sm:items-center"
      >
        <div className="w-full max-w-xl rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-2xl">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[14px] font-medium">Write a note</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>

          <textarea
            ref={box}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl+Enter saves, which is what every box of this shape does.
              // Enter on its own is a new line: this is a note, not a chat
              // message, and losing a paragraph break to a stray keystroke is
              // worse than one extra press.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void save()
                return
              }
              if (event.key === 'Escape') {
                onClose()
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) carryList(event)
            }}
            rows={5}
            aria-label="What happened"
            placeholder="Anything. Shorthand is fine — it gets written up."
            className="pad-serif max-h-[40dvh] min-h-[7rem] w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-[var(--color-faint)]"
          />

          {problem && (
            <p role="status" className="mb-1 text-[13px] text-[var(--color-danger)]">
              {problem}
            </p>
          )}

          {/*
            Save, and one switch beside it.

            There was a sentence here once explaining what saving would do —
            true, and a paragraph of small print in a box somebody opened to
            write three words in; that is gone and stays gone. This is not
            that: it is a control, it is two words, and it answers the one
            question about this note that only the person writing it can
            answer — whether the app should go looking for things to do in it.
            Off is quiet and plain rather than a warning, because leaving a
            note out of the Actions tab is an ordinary choice and not a
            mistake.
          */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={findTasks}
              onClick={() => setFindTasks((on) => !on)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] ${
                findTasks
                  ? 'text-[var(--color-muted)] hover:bg-[var(--color-hover)]'
                  : 'text-[var(--color-faint)] hover:bg-[var(--color-hover)]'
              }`}
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
            <button
              type="button"
              onClick={() => void save()}
              disabled={!text.trim() || busy}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-5 text-[14px] font-medium text-white disabled:opacity-40"
            >
              {busy && <LoaderCircle size={15} className="animate-spin" />}
              {busy ? 'Writing it up…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
