'use client'

import {
  CalendarClock,
  Check,
  CircleUser,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { blocksToText } from '@/lib/export'
import { datesFrom, localPlan, parsePlan, type Step } from '@/lib/plan'
import { whenIn } from '@/lib/tasks'
import type { Doc } from '@/lib/types'

/**
 * What happens next, read off what somebody wrote.
 *
 * ## Why this is the only button that thinks
 *
 * It replaced three. There was Ask, which rewrote the sentence you were in the
 * middle of; Brain, which applied rules to your lines as you typed them; and
 * Goals, which watched a draft against what you said it was for. All three
 * acted on the writing, and the writing is the part nobody wants help with —
 * what people actually want from a page of notes is to be told what they have
 * just committed to. So: one button, pressed on purpose, and a list.
 *
 * ## Why every step says who
 *
 * "Ring the plumber" and "draft the email to the landlord" are different kinds
 * of sentence, and only one of them is something software could take off your
 * hands. Mixing them makes a list that tells you nothing about where to start.
 *
 * ## Why nothing in here does anything
 *
 * Because nothing in here is connected yet, and a button that looks as if it
 * will send an email had better send one. The steps marked as Pad's are a
 * statement of shape — this is the half a writing app could take on — and the
 * panel says, in as many words, that it is not wired to anything. Drafting
 * through the API and putting dated steps into a calendar are the two that
 * come next.
 *
 * ## Why it works with no key
 *
 * The same bargain as the icons, the Library's titles and the search: the plan
 * is produced on the device first, from `lib/plan.ts`, and shown either way. A
 * missing key, a refusal or a dead network costs the quality of the list, never
 * the list. With a key the model sorts what is yours from what is Pad's and
 * writes it in fewer words.
 */
export interface ActionPlanProps {
  open: boolean
  onClose: () => void
  doc: Doc
  /** False when no key is configured, which leaves the local plan showing. */
  aiReady: boolean
}

/** Below this there is not enough written for a plan to mean anything. */
const ENOUGH_CHARS = 40

export default function ActionPlan({ open, onClose, doc, aiReady }: ActionPlanProps) {
  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** Whether what is showing came back from the model or off the words. */
  const [fromModel, setFromModel] = useState(false)
  /** Which steps have been ticked off, for as long as this panel is open. */
  const [done, setDone] = useState<Set<number>>(() => new Set())

  const notes = blocksToText(doc.blocks).trim()
  const enough = notes.length >= ENOUGH_CHARS

  const read = async () => {
    const local = datesFrom(localPlan(doc.blocks), whenIn)
    setSteps(local)
    setFromModel(false)
    setProblem(null)
    setDone(new Set())
    if (!aiReady || !enough) return

    setBusy(true)
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'plan', title: doc.title, text: notes }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) {
        // The local plan stays on screen. A failed request costs the quality
        // of the list, never the list.
        setProblem(data.error ?? 'Could not reach the service. This is what the words alone say.')
        return
      }
      const parsed = datesFrom(parsePlan(data.text), whenIn)
      if (!parsed.length) return
      setSteps(parsed)
      setFromModel(true)
    } catch {
      setProblem('Could not reach the service. This is what the words alone say.')
    } finally {
      setBusy(false)
    }
  }

  /*
    Read once, as the panel opens, and never before. A plan that appears while
    somebody is still writing is an interruption, and one that appears without
    being asked for is a bill. In a timer rather than straight out of the
    effect body, because this sets state and setting state synchronously inside
    an effect is a cascading render.
  */
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => void read(), 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc.id])

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

  const yours = steps.map((step, i) => ({ step, i })).filter(({ step }) => step.who === 'you')
  const ours = steps.map((step, i) => ({ step, i })).filter(({ step }) => step.who === 'app')

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default bg-black/30"
      />
      {/*
        Placed by a full-screen flex box rather than by insets on the panel.
        `inset-x-2 … sm:left-1/2` reads correctly and does not work: the two
        utilities set the same property and Tailwind emits them in its own
        order. A portal as well, because a `fixed` element inside a transformed
        ancestor is positioned against that ancestor, and the side menu this can
        be opened from carries a transform.
      */}
      <div className="pointer-events-none fixed inset-0 z-[61] flex items-end justify-center p-2 sm:items-start sm:p-0 sm:pt-[8vh]">
        <div
          role="dialog"
          aria-label="What to do next"
          className="pointer-events-auto flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl sm:w-[32rem]"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
            <span className="shrink-0 text-[var(--color-accent)]">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">What to do next</span>
            <button
              type="button"
              onClick={() => void read()}
              disabled={busy}
              aria-label="Read the notes again"
              title="Read the notes again"
              className="shrink-0 rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)] disabled:opacity-40"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            {problem && (
              <p className="mb-2 rounded-md border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-2 text-[13px] leading-snug text-[var(--color-muted)]">
                {problem}
              </p>
            )}

            {!steps.length ? (
              <p className="px-1 py-8 text-center text-[14px] leading-relaxed text-[var(--color-faint)]">
                {busy
                  ? 'Reading the notes…'
                  : enough
                    ? 'Nothing in here reads like something to do yet. Write what happened, or what you want, and press this again.'
                    : 'Write a little more and there will be something to plan.'}
              </p>
            ) : (
              <>
                {yours.length > 0 && (
                  <Group
                    icon={<CircleUser size={13} />}
                    label="Yours to do"
                    note="Only you can do these."
                  >
                    {yours.map(({ step, i }) => (
                      <StepRow
                        key={i}
                        step={step}
                        ticked={done.has(i)}
                        onTick={() =>
                          setDone((current) => {
                            const next = new Set(current)
                            if (next.has(i)) next.delete(i)
                            else next.add(i)
                            return next
                          })
                        }
                      />
                    ))}
                  </Group>
                )}

                {ours.length > 0 && (
                  <Group
                    icon={<Sparkles size={13} />}
                    label="Pad could do these"
                    note="Not connected yet — this is the shape of it."
                  >
                    {ours.map(({ step, i }) => (
                      <StepRow key={i} step={step} muted />
                    ))}
                  </Group>
                )}
              </>
            )}
          </div>

          <p className="shrink-0 border-t border-[var(--color-line)] px-3 py-2 text-[12px] leading-snug text-[var(--color-faint)]">
            {fromModel
              ? 'Nothing here has been done, and nothing in your document has changed.'
              : aiReady
                ? 'Read off the words on this device. Nothing here has been done.'
                : 'Read off the words on this device — no key is set up, so nothing was sent anywhere.'}
          </p>
        </div>
      </div>
    </>,
    document.body,
  )
}

function Group({
  icon,
  label,
  note,
  children,
}: {
  icon: React.ReactNode
  label: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-3 last:mb-0">
      <p className="mb-1.5 flex flex-wrap items-center gap-x-1.5 px-1">
        <span className="shrink-0 text-[var(--color-faint)]">{icon}</span>
        <span className="text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
          {label}
        </span>
        <span className="text-[12px] text-[var(--color-faint)]">— {note}</span>
      </p>
      <ul className="space-y-1">{children}</ul>
    </section>
  )
}

function StepRow({
  step,
  ticked,
  muted,
  onTick,
}: {
  step: Step
  ticked?: boolean
  /** Pad's own steps: shown, never ticked, because nothing has happened. */
  muted?: boolean
  onTick?: () => void
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] leading-snug ${ticked ? 'line-through opacity-50' : ''}`}>
          {step.text}
        </span>
        {step.when && (
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--color-accent)]">
            {/* The writer's own words for the day, never a parsed date. */}
            <CalendarClock size={11} /> {step.when}
          </span>
        )}
      </span>
    </>
  )

  if (muted) {
    return (
      <li className="flex items-start gap-2.5 rounded-md border border-dashed border-[var(--color-line)] px-2.5 py-2 text-[var(--color-muted)]">
        {body}
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        aria-pressed={ticked}
        onClick={onTick}
        className="flex w-full items-start gap-2.5 rounded-md border border-[var(--color-line)] px-2.5 py-2 text-left hover:bg-[var(--color-hover)]"
      >
        <span
          aria-hidden
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            ticked
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
              : 'border-[var(--color-line)]'
          }`}
        >
          {ticked && <Check size={11} />}
        </span>
        {body}
      </button>
    </li>
  )
}
