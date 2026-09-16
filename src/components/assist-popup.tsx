'use client'

import {
  ArrowDownToLine,
  CornerDownLeft,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { parsePastedText, type PastedBlock } from '@/lib/paste'

/**
 * Writing help, where the writing is happening.
 *
 * ## Why this is a popup at the caret and not a button in the corner
 *
 * The old version was a sparkle button pinned to the bottom right and a panel
 * that slid out of it. That shape asks you to stop writing, look away from
 * your sentence to the opposite corner of the screen, and come back. In
 * practice people never went — a button in the corner is furniture, and
 * furniture is invisible after the first day.
 *
 * This opens where the caret already is, with the instruction box focused, so
 * the distance between "I want this paragraph fuller" and asking for it is one
 * shortcut and a sentence. It is the same idea as pressing Ctrl+B: the help is
 * a property of the thing you are typing into, not of the application.
 *
 * ## Why there is a box to type in rather than only buttons
 *
 * The buttons cover the six things people ask for most, and the box covers
 * everything else — "make this sound less annoyed", "add the counter-argument",
 * "turn this into an email to the landlord". A fixed menu of actions can only
 * ever be the actions somebody thought of in advance.
 *
 * ## The rule that has not changed
 *
 * It never alters the document on its own. The result is shown, read, and
 * applied only on Replace or Insert. See AGENTS.md.
 */

/** What an action will be applied to. The editor works these out and offers them. */
export interface AssistScope {
  id: 'selection' | 'line' | 'doc'
  /** Named in the popup, so nobody has to guess what "this" means. */
  label: string
  text: string
}

/**
 * The quick actions, in the order they are offered.
 *
 * Expand is first and is the default when the box is empty, because it is the
 * thing people actually want from an assistant inside their own notes: they
 * have a line of shorthand and want the paragraph it stands for. Everything
 * after it is a repair job on text that already exists.
 */
const QUICK = [
  { id: 'expand', label: 'Expand' },
  { id: 'continue', label: 'Continue writing' },
  { id: 'tidy', label: 'Tidy up' },
  { id: 'bullets', label: 'Bullet points' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'summarise', label: 'Summarise' },
] as const

export interface AssistPopupProps {
  open: boolean
  onClose: () => void
  /**
   * Where the caret was when this opened, in viewport coordinates.
   *
   * Captured once by the caller rather than tracked: the popup takes focus the
   * moment it appears, and a position that followed the caret would chase the
   * caret into the popup's own input.
   */
  anchor: { top: number; bottom: number; left: number } | null
  /** Everything this could be applied to. The first is the default. */
  scopes: AssistScope[]
  title: string
  /** The document around the passage, so an expansion knows what came before. */
  context: string
  onReplace: (blocks: PastedBlock[], scope: AssistScope) => void
  onInsert: (blocks: PastedBlock[], scope: AssistScope) => void
}

/** Width of the popup on a desktop, and the margin it keeps from the edges. */
const WIDTH = 420
const EDGE = 12
/** Below this the popup is a bottom sheet, not something anchored at a caret. */
const NARROW = 640

export default function AssistPopup({
  open,
  onClose,
  anchor,
  scopes,
  title,
  context,
  onReplace,
  onInsert,
}: AssistPopupProps) {
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [scopeId, setScopeId] = useState<AssistScope['id']>(scopes[0]?.id ?? 'line')
  /**
   * The request that produced the result, so "try again" can repeat it.
   *
   * State rather than a ref, because it is cleared during render when the
   * popup opens — and a ref written during render is a value React cannot see
   * changing, which is exactly the bug the rule against it exists to prevent.
   */
  const [lastRun, setLastRun] = useState<{ action: string; instruction: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  /*
    Reset as the popup opens, not in an effect after it has painted.

    Adjusting during render is the pattern this codebase uses for "a prop
    changed, so this state is stale" (see slash-menu.tsx). In an effect, the
    previous answer paints for one frame against a different paragraph — which
    is the single worst moment to show somebody a stale rewrite.
  */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setResult(null)
    setProblem(null)
    setBusy(null)
    setInstruction('')
    setLastRun(null)
    if (open) setScopeId(scopes[0]?.id ?? 'line')
  }

  useEffect(() => {
    if (!open) return
    // The box is focused rather than the first button: the point of opening
    // this is usually to say something, and a caret already blinking is the
    // difference between a prompt and a menu.
    const id = requestAnimationFrame(() => box.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const scope = scopes.find((s) => s.id === scopeId) ?? scopes[0]

  const run = async (action: string, asked: string) => {
    if (!scope) return
    setLastRun({ action, instruction: asked })
    setBusy(action)
    setProblem(null)
    setResult(null)
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text: scope.text,
          instruction: asked,
          title,
          // Context is only worth sending when it is not the thing being
          // rewritten; on the whole document it would be the same text twice.
          context: scope.id === 'doc' ? '' : context,
        }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) {
        setProblem(data.error ?? 'That did not work. Try again.')
        return
      }
      setResult(data.text)
    } catch {
      setProblem('Could not reach the writing service. Your work is untouched.')
    } finally {
      setBusy(null)
    }
  }

  /** Enter in the box: the typed instruction, or Expand when it is empty. */
  const submit = () => {
    const asked = instruction.trim()
    void run(asked ? 'custom' : 'expand', asked)
  }

  const blocks = result ? parsePastedText(result) : []

  /*
    Placed under the caret, then pushed back inside the window.

    Fixed positioning, because the anchor comes from getBoundingClientRect and
    is already relative to the viewport. Flipped above the line when there is
    not room below, which on a laptop is most of the time once you are halfway
    down a page.
  */
  const place = (): React.CSSProperties => {
    /*
      No inline placement on a phone.

      At that width this is a sheet along the bottom, sized by the classes
      below — and an inline `left` with no `right` shrinks it to the width of
      its own text, which is what it did: a 187-pixel column halfway up the
      screen. Inline styles beat classes, so the only fix is not to write them.
    */
    if (window.innerWidth < NARROW) return {}
    if (!anchor) return { left: '50%', top: '20%', transform: 'translateX(-50%)' }
    const room = window.innerHeight - anchor.bottom
    const above = room < 260 && anchor.top > 300
    const left = Math.min(
      Math.max(EDGE, anchor.left - 40),
      Math.max(EDGE, window.innerWidth - WIDTH - EDGE),
    )
    return above
      ? { left, bottom: Math.max(EDGE, window.innerHeight - anchor.top + 8) }
      : { left, top: anchor.bottom + 8 }
  }

  return (
    <>
      {/* A press anywhere else puts the caret back where it was and closes. */}
      <button
        type="button"
        aria-label="Close writing help"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />

      <div
        role="dialog"
        aria-label="Writing help"
        style={place()}
        // A sheet along the bottom on a phone, where there is no room for a
        // popup beside a caret and the keyboard occupies the lower half anyway.
        className="fixed inset-x-2 bottom-2 z-50 max-h-[70dvh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:w-[26.25rem]"
      >
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          <Sparkles size={14} className="shrink-0 text-[var(--color-accent)]" />
          {/*
            The scope is a control, not a caption. Which text an action will
            touch is the one thing that must never be a guess, and being able to
            change it here is what lets the same popup expand a sentence and
            restructure a whole document.
          */}
          {scopes.length > 1 ? (
            <div className="flex min-w-0 items-center gap-0.5 rounded-md bg-[var(--color-hover)] p-0.5">
              {scopes.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setScopeId(option.id)}
                  aria-pressed={option.id === scopeId}
                  className={`truncate rounded px-2 py-0.5 text-[13px] ${
                    option.id === scopeId
                      ? 'bg-[var(--color-paper)] font-medium text-[var(--color-ink)] shadow-sm'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="truncate text-[13px] text-[var(--color-muted)]">
              {scope?.label ?? 'this paragraph'}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto shrink-0 rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={14} />
          </button>
        </div>

        {!result && (
          <>
            <div className="px-3 pb-2">
              <div className="flex items-end gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1.5 focus-within:border-[var(--color-accent)]">
                <textarea
                  ref={box}
                  rows={1}
                  value={instruction}
                  disabled={busy !== null}
                  onChange={(e) => {
                    setInstruction(e.target.value)
                    // Grows with what is typed rather than scrolling a one-line
                    // box, so a three-line instruction is readable while it is
                    // being written.
                    e.target.style.height = 'auto'
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit()
                    }
                  }}
                  placeholder="Expand this, or say what you want…"
                  aria-label="What would you like done"
                  className="max-h-[7.5rem] min-w-0 flex-1 resize-none bg-transparent py-1 text-[15px] leading-snug outline-none placeholder:text-[var(--color-faint)]"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy !== null}
                  aria-label="Run"
                  className="mb-1 shrink-0 rounded-md bg-[var(--color-accent)] p-1.5 text-white disabled:opacity-50"
                >
                  {busy ? (
                    <LoaderCircle size={13} className="animate-spin" />
                  ) : (
                    <CornerDownLeft size={13} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 px-3 pb-3">
              {QUICK.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(action.id, instruction.trim())}
                  className={`rounded-full border px-2.5 py-1 text-[13px] transition-colors disabled:opacity-50 ${
                    busy === action.id
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {busy === action.id ? (
                    <span className="flex items-center gap-1.5">
                      <LoaderCircle size={11} className="animate-spin" />
                      {action.label}
                    </span>
                  ) : (
                    action.label
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {problem && (
          <p
            role="status"
            className="mx-3 mb-3 rounded-md border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-2 text-[13px] leading-snug text-[var(--color-danger)]"
          >
            {problem}
          </p>
        )}

        {result && (
          <div className="px-3 pb-3">
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] p-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
              {result}
            </div>
            <p className="mt-1.5 text-[13px] text-[var(--color-faint)]">
              Nothing has changed yet.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {/*
                Insert is the primary action rather than Replace, which is the
                other way round from the old panel. Expanding and continuing
                are both additions — replacing what you wrote with a longer
                version of it is the rarer and more destructive of the two, so
                it is the one that takes the deliberate click.
              */}
              <button
                type="button"
                onClick={() => {
                  if (scope) onInsert(blocks, scope)
                  onClose()
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[14px] font-medium text-white"
              >
                <ArrowDownToLine size={13} /> Insert below
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scope) onReplace(blocks, scope)
                  onClose()
                }}
                className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-[14px]"
              >
                Replace
              </button>
              <button
                type="button"
                aria-label="Try again"
                onClick={() => {
                  if (lastRun) void run(lastRun.action, lastRun.instruction)
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
              >
                <RotateCcw size={13} /> Again
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="ml-auto rounded-md px-2.5 py-1.5 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
