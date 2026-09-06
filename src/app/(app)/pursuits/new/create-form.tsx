'use client'

import { useActionState, useState } from 'react'
import type { Suggestion } from '@/lib/stage-suggestions'
import { createPursuit, type CreateState } from './actions'

const initial: CreateState = { error: null }

const CATEGORIES = [
  { value: 'business', label: 'Business' },
  { value: 'skill', label: 'A skill' },
  { value: 'life', label: 'Life' },
  { value: 'health', label: 'Health' },
  { value: 'money', label: 'Money' },
  { value: 'creative', label: 'Creative' },
  { value: 'other', label: 'Something else' },
]

const ACCENTS = ['violet', 'emerald', 'amber', 'rose', 'sky', 'orange']
const ACCENT_SWATCH: Record<string, string> = {
  violet: 'bg-[#5b53e8]',
  emerald: 'bg-[#16a34a]',
  amber: 'bg-[#f59e0b]',
  rose: 'bg-[#e11d48]',
  sky: 'bg-[#0284c7]',
  orange: 'bg-[#ea580c]',
}

const EMOJI = ['🎯', '🚀', '📘', '📍', '🏃', '🐍', '🔥', '🎨', '💡', '🌱', '🏔️', '💼']

export function CreateForm({
  intent,
  initialTitle,
  suggestion,
}: {
  intent: string
  initialTitle: string
  suggestion: Suggestion
}) {
  const [state, formAction, pending] = useActionState(createPursuit, initial)
  const [stages, setStages] = useState(suggestion.stages.map((stage) => ({ ...stage })))
  const [emoji, setEmoji] = useState(suggestion.emoji)
  const [accent, setAccent] = useState(suggestion.accent)

  const setStage = (index: number, field: 'name' | 'description', value: string) =>
    setStages((current) =>
      current.map((stage, i) => (i === index ? { ...stage, [field]: value } : stage)),
    )

  const move = (index: number, direction: -1 | 1) =>
    setStages((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="emoji" value={emoji} />
      <input type="hidden" name="accent" value={accent} />
      <input type="hidden" name="intent" value={intent} />

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">The stages</h2>
          <span className="text-[11px] text-ink-faint">{stages.length} stages</span>
        </div>

        <p className="mb-4 rounded-[10px] bg-accent-soft px-3 py-2 text-[12px] leading-relaxed text-accent">
          {suggestion.because}
        </p>

        <div className="space-y-2.5">
          {stages.map((stage, index) => (
            <div key={index} className="rounded-[12px] border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mist text-[10px] font-semibold text-ink-muted">
                  {index + 1}
                </span>
                <input
                  name="stage"
                  value={stage.name}
                  onChange={(event) => setStage(index, 'name', event.target.value)}
                  className="field"
                  placeholder="Stage name"
                />
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${stage.name || 'stage'} earlier`}
                    className="px-1 text-[10px] leading-none text-ink-faint hover:text-ink disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === stages.length - 1}
                    aria-label={`Move ${stage.name || 'stage'} later`}
                    className="px-1 text-[10px] leading-none text-ink-faint hover:text-ink disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                {stages.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setStages((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove ${stage.name || 'stage'}`}
                    className="shrink-0 px-1 text-ink-faint hover:text-rose"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <input
                name="stage_description"
                value={stage.description}
                onChange={(event) => setStage(index, 'description', event.target.value)}
                className="field mt-2 ml-7 w-[calc(100%-1.75rem)] text-[12px]"
                placeholder="What finishing this stage means"
              />
            </div>
          ))}
        </div>

        {stages.length < 10 ? (
          <button
            type="button"
            onClick={() => setStages((current) => [...current, { name: '', description: '' }])}
            className="mt-3 text-[12px] font-medium text-accent hover:text-accent-hover"
          >
            + Add a stage
          </button>
        ) : null}
      </div>

      <div className="card space-y-4 p-4">
        <h2 className="text-sm font-semibold text-ink">The pursuit itself</h2>

        <div>
          <label htmlFor="title" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Name
          </label>
          <input id="title" name="title" required defaultValue={initialTitle} className="field" />
        </div>

        <div>
          <label htmlFor="tagline" className="mb-1.5 block text-xs font-medium text-ink-soft">
            One line about it
          </label>
          <input
            id="tagline"
            name="tagline"
            className="field"
            placeholder="From where you are now to the thing you actually want."
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Who it is for
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            className="field resize-none"
            placeholder="What someone should expect to get out of being here."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className="mb-1.5 block text-xs font-medium text-ink-soft">
              Category
            </label>
            <select id="category" name="category" className="field" defaultValue={suggestion.category}>
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tags" className="mb-1.5 block text-xs font-medium text-ink-soft">
              Tags
            </label>
            <input id="tags" name="tags" className="field" placeholder="saas, startups, revenue" />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ink-soft">Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEmoji(option)}
                aria-pressed={emoji === option}
                className={`flex h-9 w-9 items-center justify-center rounded-[10px] border text-base transition-colors ${
                  emoji === option ? 'border-accent bg-accent-soft' : 'border-line hover:bg-mist'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ink-soft">Colour</p>
          <div className="flex gap-2">
            {ACCENTS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAccent(option)}
                aria-label={option}
                aria-pressed={accent === option}
                className={`h-7 w-7 rounded-full ${ACCENT_SWATCH[option]} transition-transform ${
                  accent === option ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <label htmlFor="intent_note" className="mb-1.5 block text-xs font-medium text-ink-soft">
          What are you here to do?
        </label>
        <textarea
          id="intent_note"
          name="member_intent"
          rows={2}
          defaultValue={intent}
          className="field resize-none"
        />
        <p className="mt-1.5 text-[11px] text-ink-faint">
          Other members see this when Commons suggests you to them.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-[10px] bg-rose-soft px-3 py-2.5 text-[13px] text-rose">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary w-full py-2.5">
        {pending ? 'Creating…' : 'Create pursuit'}
      </button>
    </form>
  )
}
