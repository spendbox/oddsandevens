'use client'

import { Brain, Plus, Power, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { newId } from '@/lib/id'
import { describe, type Rule, type RuleThen, type RuleWhen } from '@/lib/rules'

/**
 * Brain: the rules this document keeps about itself.
 *
 * ## Why it is a button and not a setting
 *
 * Rules belong to a document. The shapes in a meeting note are not the shapes
 * in a recipe, and one list of rules applied to everything would be wrong
 * somewhere inside a day. So this opens from the document it edits, says the
 * document's name nowhere and needs no explanation of scope: what you set here
 * is true here.
 *
 * ## Why it is optional and says so
 *
 * Most documents will never have a rule and must not be any slower or any
 * harder to use for it — an empty Brain costs one small button. A new document
 * is offered rules once, in a strip that goes away for good if it is turned
 * down, because the only moment somebody knows what shape a document will take
 * is when they are about to start it.
 *
 * ## Why it reads as sentences
 *
 * A rule is shown as "Every line starting with “AI:” becomes a task", not as
 * three dropdowns side by side. A list of rules somebody set a month ago has
 * to be readable at a glance or they will not trust what the document is
 * doing — and a rule nobody can read is one they switch off rather than fix.
 */

export interface BrainPanelProps {
  open: boolean
  onClose: () => void
  rules: Rule[]
  /** Whether the rules are paused for this document. */
  ignored: boolean
  onChange: (rules: Rule[]) => void
  onIgnoredChange: (ignored: boolean) => void
}

/** The conditions offered, in the order they are worth reaching for. */
const WHENS: Array<{ id: string; label: string; needsValue: boolean; make: (v: string) => RuleWhen }> = [
  { id: 'startsWith', label: 'starts with', needsValue: true, make: (v) => ({ kind: 'startsWith', value: v }) },
  { id: 'contains', label: 'contains the word', needsValue: true, make: (v) => ({ kind: 'contains', value: v }) },
  { id: 'endsWith', label: 'ends with', needsValue: true, make: (v) => ({ kind: 'endsWith', value: v }) },
  { id: 'bullet', label: 'is a bullet', needsValue: false, make: () => ({ kind: 'isType', value: 'bullet' }) },
  { id: 'quote', label: 'is a quote', needsValue: false, make: () => ({ kind: 'isType', value: 'quote' }) },
  { id: 'todo', label: 'is a task', needsValue: false, make: () => ({ kind: 'isType', value: 'todo' }) },
]

/** What a matched line can be turned into. */
const THENS: Array<{ id: string; label: string; make: () => RuleThen }> = [
  { id: 'todo', label: 'a task', make: () => ({ kind: 'become', value: 'todo' }) },
  { id: 'bullet', label: 'a bullet', make: () => ({ kind: 'become', value: 'bullet' }) },
  { id: 'h1', label: 'a heading 1', make: () => ({ kind: 'become', value: 'heading', level: 1 }) },
  { id: 'h2', label: 'a heading 2', make: () => ({ kind: 'become', value: 'heading', level: 2 }) },
  { id: 'h3', label: 'a heading 3', make: () => ({ kind: 'become', value: 'heading', level: 3 }) },
  { id: 'quote', label: 'a quote', make: () => ({ kind: 'become', value: 'quote' }) },
  { id: 'code', label: 'a code block', make: () => ({ kind: 'become', value: 'code' }) },
  { id: 'text', label: 'an ordinary paragraph', make: () => ({ kind: 'become', value: 'text' }) },
  { id: 'centre', label: 'centred', make: () => ({ kind: 'align', value: 'center' }) },
  { id: 'indent', label: 'indented', make: () => ({ kind: 'indent' }) },
]

/**
 * Rules worth offering before anybody has written one.
 *
 * An empty panel with a builder in it is a puzzle. Three examples that are
 * each one press away turn it into a menu, and between them they show what the
 * three kinds of condition look like.
 */
const SUGGESTED: Array<{ label: string; rule: () => Omit<Rule, 'id'> }> = [
  {
    label: 'Every bullet becomes a task',
    rule: () => ({ when: { kind: 'isType', value: 'bullet' }, then: { kind: 'become', value: 'todo' } }),
  },
  {
    label: 'Lines starting with “AI:” become tasks',
    rule: () => ({ when: { kind: 'startsWith', value: 'AI:' }, then: { kind: 'become', value: 'todo' }, strip: true }),
  },
  {
    label: 'Lines ending with “?” become quotes',
    rule: () => ({ when: { kind: 'endsWith', value: '?' }, then: { kind: 'become', value: 'quote' } }),
  },
]

export default function BrainPanel({
  open,
  onClose,
  rules,
  ignored,
  onChange,
  onIgnoredChange,
}: BrainPanelProps) {
  const [whenId, setWhenId] = useState(WHENS[0].id)
  const [thenId, setThenId] = useState(THENS[0].id)
  const [value, setValue] = useState('')
  const [strip, setStrip] = useState(true)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const when = WHENS.find((w) => w.id === whenId) ?? WHENS[0]
  const then = THENS.find((t) => t.id === thenId) ?? THENS[0]
  const ready = !when.needsValue || value.trim().length > 0

  const add = () => {
    if (!ready) return
    const rule: Rule = {
      id: newId(),
      when: when.make(value.trim()),
      then: then.make(),
    }
    if (whenId === 'startsWith' && strip) rule.strip = true
    onChange([...rules, rule])
    setValue('')
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close Brain"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/20"
      />
      <div
        role="dialog"
        aria-label="Brain"
        className="fixed inset-x-2 bottom-2 z-50 max-h-[80dvh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl sm:inset-x-auto sm:top-16 sm:bottom-auto sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
          <Brain size={16} className="shrink-0 text-[var(--color-accent)]" />
          <span className="text-[15px] font-medium">Brain</span>
          <span className="min-w-0 truncate text-[13px] text-[var(--color-faint)]">
            rules for this document only
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3">
          {rules.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={`group/rule flex items-center gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-2 ${
                    rule.off ? 'opacity-50' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 text-[14px] leading-snug">{describe(rule)}</span>
                  <button
                    type="button"
                    aria-label={rule.off ? 'Switch this rule on' : 'Switch this rule off'}
                    aria-pressed={!rule.off}
                    onClick={() =>
                      onChange(rules.map((r) => (r.id === rule.id ? { ...r, off: !r.off } : r)))
                    }
                    className="shrink-0 rounded p-1.5 text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
                  >
                    <Power size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove this rule"
                    onClick={() => onChange(rules.filter((r) => r.id !== rule.id))}
                    className="shrink-0 rounded p-1.5 text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-3">
              <p className="mb-2 text-[14px] leading-snug text-[var(--color-muted)]">
                A rule turns a shape you keep writing into the thing you meant. They apply as you
                type, only in this document, and every one of them can be undone.
              </p>
              <div className="space-y-1">
                {SUGGESTED.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => onChange([...rules, { id: newId(), ...suggestion.rule() }])}
                    className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-2 text-left text-[14px] hover:border-[var(--color-accent)] hover:bg-[var(--color-hover)]"
                  >
                    <Plus size={14} className="shrink-0 text-[var(--color-faint)]" />
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/*
            The builder, as one sentence with holes in it. Three dropdowns in a
            row is a form; a sentence is something somebody can read back and
            tell at a glance whether it says what they meant.
          */}
          <div className="rounded-lg bg-[var(--color-hover)] p-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
              <span className="text-[var(--color-muted)]">Every line that</span>
              <select
                aria-label="When"
                value={whenId}
                onChange={(e) => setWhenId(e.target.value)}
                className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 text-[14px] outline-none"
              >
                {WHENS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              {when.needsValue && (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') add()
                  }}
                  aria-label="What to look for"
                  placeholder="AI:"
                  className="h-8 w-28 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-2 text-[14px] outline-none focus:border-[var(--color-accent)]"
                />
              )}
              <span className="text-[var(--color-muted)]">becomes</span>
              <select
                aria-label="Becomes"
                value={thenId}
                onChange={(e) => setThenId(e.target.value)}
                className="h-8 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 text-[14px] outline-none"
              >
                {THENS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={add}
                disabled={!ready}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 text-[14px] font-medium text-white disabled:opacity-40"
              >
                <Plus size={14} /> Add
              </button>
            </div>
            {whenId === 'startsWith' && (
              <label className="mt-2 flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={strip}
                  onChange={(e) => setStrip(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                Take the marker off the line as it converts
              </label>
            )}
          </div>
        </div>

        {/*
          Pausing rather than deleting. "Not while I am drafting this" is a
          different thought from "I was wrong about that rule", and only one of
          them should cost somebody their rules.
        */}
        <label className="flex items-center gap-2.5 border-t border-[var(--color-line)] px-3 py-2.5 text-[14px]">
          <input
            type="checkbox"
            checked={ignored}
            onChange={(e) => onIgnoredChange(e.target.checked)}
            aria-label="Ignore the rules in this document"
            className="h-[15px] w-[15px] accent-[var(--color-accent)]"
          />
          <span className="min-w-0">
            Ignore these rules for now
            <span className="block text-[13px] text-[var(--color-faint)]">
              They stay written down; nothing is applied until this is unticked.
            </span>
          </span>
        </label>
      </div>
    </>
  )
}

/**
 * The one-time offer on a document that has just been made.
 *
 * Shown once, dismissable for good, and never on a document that already has
 * rules — the moment somebody knows what shape a document will take is the
 * moment before they start it, and there is no second good moment to ask.
 */
export function BrainOffer({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div
      data-print="hide"
      className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2 text-[14px]"
    >
      <Brain size={15} className="shrink-0 text-[var(--color-accent)]" />
      <span className="min-w-0 text-[var(--color-muted)]">
        Set rules for this document? Every bullet a task, every “AI:” line an action — that sort of
        thing.
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="ml-auto shrink-0 rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[13px] font-medium text-white"
      >
        Set rules
      </button>
      <button
        type="button"
        aria-label="No rules for this document"
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
      >
        <X size={14} />
      </button>
    </div>
  )
}
