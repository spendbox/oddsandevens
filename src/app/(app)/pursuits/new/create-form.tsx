'use client'

import { useActionState, useState } from 'react'
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

const EMOJI = ['🎯', '🚀', '📘', '📍', '🏃', '🐍', '🔥', '🎨', '💡', '🌱', '🏔️', '⚡']

export function CreateForm({ initialTitle }: { initialTitle: string }) {
  const [state, formAction, pending] = useActionState(createPursuit, initial)
  const [stages, setStages] = useState(['', '', ''])
  const [emoji, setEmoji] = useState('🎯')
  const [accent, setAccent] = useState('violet')

  const setStage = (index: number, value: string) =>
    setStages((current) => current.map((item, i) => (i === index ? value : item)))

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="emoji" value={emoji} />
      <input type="hidden" name="accent" value={accent} />

      <div className="card space-y-4 p-4">
        <div>
          <label htmlFor="title" className="mb-1.5 block text-xs font-medium text-ink-soft">
            The outcome
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={initialTitle}
            className="field"
            placeholder="Build a Profitable SaaS Company"
          />
        </div>

        <div>
          <label htmlFor="tagline" className="mb-1.5 block text-xs font-medium text-ink-soft">
            One line about it
          </label>
          <input
            id="tagline"
            name="tagline"
            className="field"
            placeholder="From an idea you cannot stop thinking about to revenue you can live on."
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-xs font-medium text-ink-soft">
            What this pursuit is for
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            className="field resize-none"
            placeholder="Who it is for, and what they should expect to get out of being here."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className="mb-1.5 block text-xs font-medium text-ink-soft">
              Category
            </label>
            <select id="category" name="category" className="field" defaultValue="business">
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
        <h2 className="text-sm font-semibold text-ink">The stages people pass through</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          In order, from where someone starts to where they finish. This is what the progress board
          is built from — and what makes it possible to say &ldquo;two stages ahead of you&rdquo;.
        </p>

        <div className="mt-4 space-y-2">
          {stages.map((stage, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-[11px] text-ink-faint tabular-nums">
                {index + 1}
              </span>
              <input
                name="stage"
                value={stage}
                onChange={(event) => setStage(index, event.target.value)}
                className="field"
                placeholder={
                  ['Idea', 'Validating', 'Building', 'Beta', 'Launched', 'Profitable'][index] ??
                  'Next stage'
                }
              />
              {stages.length > 2 ? (
                <button
                  type="button"
                  onClick={() => setStages((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove stage ${index + 1}`}
                  className="shrink-0 px-1 text-ink-faint hover:text-rose"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {stages.length < 8 ? (
          <button
            type="button"
            onClick={() => setStages((current) => [...current, ''])}
            className="mt-3 text-[12px] font-medium text-accent hover:text-accent-hover"
          >
            + Add a stage
          </button>
        ) : null}
      </div>

      <div className="card p-4">
        <label htmlFor="intent" className="mb-1.5 block text-xs font-medium text-ink-soft">
          What are you here to do?
        </label>
        <textarea
          id="intent"
          name="intent"
          rows={2}
          className="field resize-none"
          placeholder="Get my first ten paying customers."
        />
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
