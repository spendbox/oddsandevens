'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorNote } from '@/components/ui'
import { ACCENTS } from '@/lib/engines'
import type { Tool } from '@/lib/types'
import { saveDetails } from './actions'

const EMOJI = ['🛠️', '🧮', '📋', '📄', '📊', '🗂', '✨', '💰', '🏥', '🎓', '🏠', '🚗']

export function DetailsForm({ tool }: { tool: Tool }) {
  const router = useRouter()
  const [emoji, setEmoji] = useState(tool.emoji)
  const [accentName, setAccentName] = useState(tool.accent)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          setError(null)
          const result = await saveDetails(tool.id, formData)
          if (result.error) setError(result.error)
          else {
            setSaved(true)
            router.refresh()
          }
        })
      }}
      className="space-y-4"
    >
      <input type="hidden" name="emoji" value={emoji} />
      <input type="hidden" name="accent" value={accentName} />

      <div>
        <label htmlFor="title" className="label">
          Name
        </label>
        <input id="title" name="title" defaultValue={tool.title} required className="field" />
      </div>

      <div>
        <label htmlFor="tagline" className="label">
          One line about it
        </label>
        <input id="tagline" name="tagline" defaultValue={tool.tagline} className="field" />
      </div>

      <div>
        <label htmlFor="description" className="label">
          Anything else people should know
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={tool.description}
          className="field resize-none"
          placeholder="Where the figures come from, what it does not cover, who it is for."
        />
      </div>

      <div>
        <label htmlFor="price" className="label">
          Price (₦)
        </label>
        <input
          id="price"
          name="price"
          type="number"
          min={0}
          step={50}
          defaultValue={tool.price_kobo / 100}
          className="field"
        />
        <p className="mt-1.5 text-[12px] text-ink-faint">
          Leave at 0 to keep it free. Anyone who pays keeps access for good.
        </p>
      </div>

      <div>
        <p className="label">Icon</p>
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
        <p className="label">Colour</p>
        <div className="flex gap-2">
          {Object.entries(ACCENTS).map(([name, tone]) => (
            <button
              key={name}
              type="button"
              onClick={() => setAccentName(name)}
              aria-label={name}
              aria-pressed={accentName === name}
              className={`h-7 w-7 rounded-full ${tone.solid} transition-transform ${
                accentName === name ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'
              }`}
            />
          ))}
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && !pending ? <span className="text-[12px] text-lift">Saved</span> : null}
      </div>
    </form>
  )
}
