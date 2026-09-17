'use client'

import { LoaderCircle, Plus, RotateCcw, Target, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addGoal, MAX_GOALS, parseSuggestions, removeGoal } from '@/lib/goals'

/**
 * What this document is for, and what to do next about it.
 *
 * ## Why goals are here and not in a setting
 *
 * The same reason Brain's rules are on the document: what a complaint to a
 * landlord is trying to do is not what a recipe is trying to do, and one list
 * applied to everything would be wrong somewhere inside a day. A goal is one
 * line, in the writer's own words, about one document.
 *
 * ## What the suggestions are, and what they are not
 *
 * They are things to do, never things done. Nothing on this panel can change
 * the document — pressing a suggestion does not apply it, because there is
 * nothing to apply: it is a sentence saying "cut the second paragraph, it
 * repeats the first". That is the rule every piece of writing help in this app
 * keeps, and the reason is that an assistant which silently rewrites what
 * somebody wrote is one they stop trusting the first time it makes a sentence
 * worse, by which point they cannot tell what it changed.
 *
 * ## Why it does not ask the model on every keystroke
 *
 * Because that is somebody's money, three times a minute, to be told what they
 * were told ten seconds ago. It asks once when goals are first set on a
 * document with something written in it, remembers the answer for as long as
 * the tab is open, and otherwise waits to be asked again. Setting a goal is
 * deliberate, so one call on the back of it is a fair trade; a call per
 * paragraph is not.
 */
export interface GoalsSectionProps {
  docId: string
  goals: string[]
  onGoals: (goals: string[]) => void
  title: string
  /** The draft as plain text, so suggestions are about what is actually there. */
  text: string
  /** False when no key is configured, which hides the suggestions entirely. */
  aiReady: boolean
}

/**
 * Answers already paid for, kept for as long as the tab is open.
 *
 * Module level rather than state, so switching to another document and back
 * does not buy the same four sentences twice. It is deliberately not
 * persisted: a suggestion about a draft is worth nothing once the draft has
 * moved on, and stale advice read as current is worse than none.
 */
const answered = new Map<string, string[]>()

/**
 * Documents already offered suggestions without being asked.
 *
 * Module level, beside the answers, because it is the same fact: a note about
 * what this tab has already paid for. It is deliberately not React state —
 * marking it is something an effect may do to an external system, which is
 * exactly what an effect is for, whereas setting state from an effect body is
 * a cascading render and the lint rule that forbids it is right.
 */
const offered = new Set<string>()

/** Below this there is not enough written for a suggestion to mean anything. */
const ENOUGH_CHARS = 120

export default function GoalsSection({
  docId,
  goals,
  onGoals,
  title,
  text,
  aiReady,
}: GoalsSectionProps) {
  const [draft, setDraft] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>(() => answered.get(docId) ?? [])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  /*
    A different document is a different set of answers. Adjusted during render
    rather than in an effect — the pattern this codebase uses for "a prop
    changed, so this state is stale" — because in an effect the previous
    document's suggestions paint for a frame against this one's goals.
  */
  const [lastId, setLastId] = useState(docId)
  if (docId !== lastId) {
    setLastId(docId)
    setSuggestions(answered.get(docId) ?? [])
    setProblem(null)
    setBusy(false)
    setDraft('')
  }

  const ask = async (goalList: string[], body: string) => {
    setBusy(true)
    setProblem(null)
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', goals: goalList, title, text: body }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) {
        setProblem(data.error ?? 'Could not reach the writing service.')
        return
      }
      const parsed = parseSuggestions(data.text)
      answered.set(docId, parsed)
      setSuggestions(parsed)
    } catch {
      setProblem('Could not reach the writing service. Your work is untouched.')
    } finally {
      setBusy(false)
    }
  }

  /*
    The one automatic call: goals exist, something is written, and this
    document has not been asked yet in this session. Everything after that is
    the refresh button, which is what keeps this from being a meter running in
    the corner of somebody's screen.
  */
  const enough = text.trim().length >= ENOUGH_CHARS
  useEffect(() => {
    if (!aiReady || !enough || !goals.length || offered.has(docId)) return
    // In a timer rather than straight out of the effect body: this sets state,
    // and setting state synchronously inside an effect is a cascading render.
    const timer = setTimeout(() => {
      offered.add(docId)
      void ask(goals, text)
    }, 0)
    return () => clearTimeout(timer)
    // `enough` rather than `text`, so this fires on the transition into "has
    // goals and has something written" and never once per keystroke after it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady, enough, goals.length, docId])

  const add = () => {
    const next = addGoal(goals, draft)
    setDraft('')
    // The same array back means nothing was added — a blank line, a duplicate,
    // or the sixth goal. Writing it anyway would save and sync the document
    // for no change at all.
    if (next !== goals) onGoals(next)
  }

  return (
    <div className="px-1 pb-1">
      <ul className="space-y-1">
        {goals.map((goal) => (
          <li
            key={goal}
            className="flex items-start gap-1.5 rounded-md bg-[var(--color-hover)] px-2 py-1.5"
          >
            <Target size={13} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
            <span className="min-w-0 flex-1 text-[13px] leading-snug">{goal}</span>
            <button
              type="button"
              aria-label={`Remove goal: ${goal}`}
              onClick={() => onGoals(removeGoal(goals, goal))}
              className="shrink-0 rounded p-0.5 text-[var(--color-faint)] hover:text-[var(--color-danger)]"
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>

      {goals.length < MAX_GOALS && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2 py-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
            placeholder={goals.length ? 'Add another' : 'What is this document for?'}
            aria-label="Add a goal for this document"
            className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-[var(--color-faint)]"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            aria-label="Add this goal"
            className="shrink-0 rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)] disabled:opacity-40"
          >
            <Plus size={14} />
          </button>
        </div>
      )}

      {!goals.length && (
        <p className="mt-1.5 px-1 text-[12px] leading-snug text-[var(--color-faint)]">
          Say what it is trying to do — “persuade the landlord”, “under 400
          words”. Nothing here changes the document.
        </p>
      )}

      {aiReady && goals.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center gap-1.5 px-1">
            <span className="min-w-0 flex-1 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
              What to do next
            </span>
            <button
              type="button"
              onClick={() => void ask(goals, text)}
              disabled={busy}
              aria-label="Look at the draft again"
              title="Look at the draft again"
              className="shrink-0 rounded p-1 text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)] disabled:opacity-40"
            >
              {busy ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <RotateCcw size={13} />
              )}
            </button>
          </div>

          {problem ? (
            <p className="px-1 text-[12px] leading-snug text-[var(--color-danger)]">{problem}</p>
          ) : suggestions.length ? (
            <ul className="space-y-1">
              {suggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[13px] leading-snug text-[var(--color-muted)]"
                >
                  {suggestion}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 text-[12px] leading-snug text-[var(--color-faint)]">
              {busy
                ? 'Reading the draft…'
                : text.trim().length < ENOUGH_CHARS
                  ? 'Write a little more and there will be something to say.'
                  : 'Nothing yet — press the arrow to read the draft.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
