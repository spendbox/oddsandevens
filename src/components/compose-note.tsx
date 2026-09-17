'use client'

import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { blocksFromPasted } from '@/lib/blocks'
import { splitComposed, titleFrom } from '@/lib/compose'
import { parsePastedText } from '@/lib/paste'
import type { Block } from '@/lib/types'

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
  /** Hands over the finished note: what it is called, and its lines. */
  onSave: (note: { title: string; blocks: Block[] }) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

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
    }
  }

  if (!open) return null

  const save = async () => {
    const typed = text.trim()
    if (!typed || busy) return

    /*
      The note as it was typed, worked out before anything is asked of the
      network. If the request fails, this is what is saved — so the failure
      path is not an error message, it is a slightly less tidy note.
    */
    const asTyped = { title: titleFrom(typed), blocks: blocksFromPasted(asLines(typed)) }

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
          At the bottom on a phone, where the thumb and the keyboard already
          are; a panel in the middle of the screen on a desktop. Centred by a
          flex parent rather than by `left-1/2`, because an inline or
          higher-specificity horizontal position is exactly what collapses a
          full-width sheet to the width of its own text.
        */
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
              }
              if (event.key === 'Escape') onClose()
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

          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-faint)]">
              {aiReady
                ? 'Saved, named and written up. Nothing is added that you did not write.'
                : 'Saved as you typed it. Writing up needs a key.'}
            </p>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!text.trim() || busy}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-4 text-[14px] font-medium text-white disabled:opacity-40"
            >
              {busy ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                aiReady && <Sparkles size={15} />
              )}
              {busy ? 'Writing it up…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
