'use client'

import { LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useKeyboardInset } from './keyboard'

/** How far above the keyboard the box sits, so it is not resting on it. */
const GAP = 16

/**
 * The pop-up you write in.
 *
 * ## Why there is only one of these
 *
 * Because there were two, and the second one was awkward in exactly the
 * ways the first had already been fixed: a box welded to the bottom of the
 * team screen, a different shape, a different way of closing, its own idea
 * of where the keyboard was. Writing a note and saying something to a team
 * are the same act — a few lines, typed quickly, and then you are done —
 * so they are the same pop-up.
 *
 * ## What this shell is responsible for
 *
 * Being in the right place (above the keyboard on a phone, in the middle of
 * the screen on a desktop), closing the way everything else here closes,
 * taking the caret when it opens, and nothing else. What goes inside it,
 * what the button says and what happens on save all belong to the caller —
 * a shared shell that also decided what it contained would be a shell
 * neither caller quite fitted.
 *
 * ## Closing is a decision the caller makes
 *
 * Because one of them has something to protect. The note box keeps what
 * was typed as a draft; the team box puts it back in the bar. Neither can
 * be done by a shell that only knows a press happened, so `onClose` is
 * handed the text.
 */
export default function ComposeSheet({
  title,
  value,
  onChange,
  onClose,
  onSave,
  saveLabel,
  busy,
  placeholder,
  label,
  children,
  beside,
  onKeyDown,
}: {
  title: string
  value: string
  onChange: (value: string) => void
  /** Handed the text, so the caller can keep it. */
  onClose: (text: string) => void
  onSave: () => void
  saveLabel: string
  busy?: boolean
  placeholder: string
  label: string
  /** Anything that goes above the box: a reply being answered, a picker. */
  children?: React.ReactNode
  /** Anything that goes beside the save button: a switch, a hint. */
  beside?: React.ReactNode
  /**
   * A key the caller wants first refusal on.
   *
   * The note box carries a list on when Return is pressed at the end of
   * one — a rule with its own unit test, which needs the textarea and so
   * cannot live here. Anything it handles it marks handled, and the shell
   * leaves that key alone.
   */
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  const keyboard = useKeyboardInset()

  /*
    The caret goes in the box. Opening a writing box and having to press it
    first is a small insult repeated every time — and it is put at the end
    of whatever is already there, because what is already there is a draft
    somebody is coming back to finish.
  */
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.focus()
    const at = el.value.length
    el.setSelectionRange(at, at)
    // Only on opening: moving the caret on every keystroke would make it
    // impossible to correct anything but the last word.
  }, [])

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={() => onClose(value)}
        className="fixed inset-0 z-[60] bg-black/25"
      />
      <div
        /*
          The padding is what keeps it above the keyboard. A phone does not
          make the page shorter when the keys come up — it draws them over
          the bottom of it — so a sheet pinned to the bottom is underneath
          them at the exact moment somebody is typing into it. See
          keyboard.ts. An inline style because it is a number that changes
          as the keyboard opens.

          Plus a gap, so it sits above the keys rather than against them. A
          box resting exactly on the top row of a phone keyboard reads as
          part of it, and the Send button ends up a thumb's width from the
          Return key. Only when there is a keyboard: on a desktop the sheet
          is centred, and bottom padding there would push it off centre to
          solve a problem that screen does not have.
        */
        style={{ paddingBottom: keyboard ? keyboard + GAP : undefined }}
        className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:inset-y-0 sm:items-center"
      >
        <div
          role="dialog"
          aria-label={title}
          aria-modal="true"
          className="w-full max-w-xl rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[14px] font-medium">{title}</p>
            <button
              type="button"
              onClick={() => onClose(value)}
              aria-label="Close"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>

          {children}

          <textarea
            ref={box}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl+Enter saves, which is what every box of this shape
              // does. Enter on its own is a new line: this is writing, not
              // a chat message, and losing a paragraph break to a stray
              // keystroke is worse than one extra press.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                onSave()
                return
              }
              if (event.key === 'Escape') {
                onClose(value)
                return
              }
              onKeyDown?.(event)
            }}
            rows={5}
            aria-label={label}
            placeholder={placeholder}
            className="pad-serif max-h-[40dvh] min-h-[7rem] w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-[var(--color-faint)]"
          />

          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0">{beside}</span>
            <button
              type="button"
              onClick={onSave}
              disabled={!value.trim() || busy}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-5 text-[14px] font-medium text-white disabled:opacity-40"
            >
              {busy && <LoaderCircle size={15} className="animate-spin" />}
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
