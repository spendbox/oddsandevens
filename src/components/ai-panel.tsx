'use client'

import { Check, LoaderCircle, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { parsePastedText, type PastedBlock } from '@/lib/paste'

/**
 * Writing help.
 *
 * The rule this is built around: it never changes the document on its own.
 * Every result is shown first and applied only when the writer says so. An
 * assistant that silently rewrites what someone wrote is one they stop
 * trusting the first time it makes a sentence worse, and by then they cannot
 * tell what it changed.
 *
 * The result comes back as markdown and goes through the same parser as a
 * paste, so headings and lists become real blocks rather than text with
 * hashes in it.
 */
const ACTIONS = [
  { id: 'tidy', label: 'Tidy up', hint: 'Punctuation, grammar, paragraphs' },
  { id: 'shorten', label: 'Make it shorter', hint: 'Same points, fewer words' },
  { id: 'expand', label: 'Expand on this', hint: 'Develop what is there' },
  { id: 'structure', label: 'Add structure', hint: 'Headings and lists' },
  { id: 'draft', label: 'Write a draft', hint: 'From a heading or a topic' },
] as const

export interface AiPanelProps {
  open: boolean
  onClose: () => void
  /** What the action will be applied to. */
  source: { text: string; label: string }
  title: string
  /** Replaces the source with the result. */
  onReplace: (blocks: PastedBlock[]) => void
  /** Leaves the source alone and puts the result after it. */
  onInsert: (blocks: PastedBlock[]) => void
}

export default function AiPanel({
  open,
  onClose,
  source,
  title,
  onReplace,
  onInsert,
}: AiPanelProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Cleared when the panel closes, so reopening never shows a stale answer
  // against a different selection. Adjusted during render rather than in an
  // effect, or the old result paints for a frame the next time it opens —
  // next to a different selection, which is the worst possible moment to see
  // a stale answer.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setResult(null)
      setProblem(null)
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const run = async (action: string) => {
    setBusy(action)
    setProblem(null)
    setResult(null)
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text: source.text, title }),
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

  const blocks = result ? parsePastedText(result) : []

  return (
    <>
      {/* A backdrop, so a tap anywhere outside closes it on a phone. */}
      <button
        type="button"
        aria-label="Close writing help"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20"
      />

      <div
        ref={panel}
        role="dialog"
        aria-label="Writing help"
        // A sheet from the bottom on a phone, a panel in the corner on a
        // desktop: the thumb is at the bottom, the pointer is not.
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:rounded-2xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={15} className="text-[var(--color-accent)]" />
          <span className="text-sm font-medium">Writing help</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-md p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={15} />
          </button>
        </div>

        <p className="mb-2 text-[11px] text-[var(--color-faint)]">Working on {source.label}.</p>

        {!result && (
          <div className="space-y-1">
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={busy !== null}
                onClick={() => void run(action.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-[var(--color-hover)] disabled:opacity-50 sm:py-2"
              >
                <span className="w-4 shrink-0 text-[var(--color-muted)]">
                  {busy === action.id ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs">{action.label}</span>
                  <span className="block text-[10px] text-[var(--color-faint)]">{action.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {problem && (
          <p className="mt-2 rounded-md border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-2 text-[11px] leading-snug text-[var(--color-danger)]">
            {problem}
          </p>
        )}

        {result && (
          <div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] p-2.5 text-xs leading-relaxed whitespace-pre-wrap">
              {result}
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--color-faint)]">
              Nothing has changed yet. Read it first.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onReplace(blocks)
                  onClose()
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white sm:py-1.5"
              >
                <Check size={13} /> Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  onInsert(blocks)
                  onClose()
                }}
                className="rounded-md border border-[var(--color-line)] px-3 py-2 text-xs sm:py-1.5"
              >
                Add below instead
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded-md px-3 py-2 text-xs text-[var(--color-muted)] hover:bg-[var(--color-hover)] sm:py-1.5"
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
