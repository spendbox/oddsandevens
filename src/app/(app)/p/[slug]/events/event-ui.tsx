'use client'

import { useRef, useState, useTransition } from 'react'
import { createEvent, toggleRsvp } from '../actions'

const KINDS = [
  { value: 'challenge', label: 'Challenge', hint: 'A deadline everyone works to.' },
  { value: 'meetup', label: 'Meetup', hint: 'People in one place.' },
  { value: 'workshop', label: 'Workshop', hint: 'Learn one thing properly.' },
  { value: 'ama', label: 'AMA', hint: 'Someone ahead answers questions.' },
  { value: 'session', label: 'Session', hint: 'Working together, live.' },
]

export function EventComposer({ slug, pursuitId }: { slug: string; pursuitId: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('challenge')
  const eventForm = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card card-hover w-full p-4 text-left text-sm text-ink-faint"
      >
        Start a challenge, call a meetup, or run a session…
      </button>
    )
  }

  return (
    <form
      ref={eventForm}
      action={async (formData) => {
        await createEvent(formData)
        eventForm.current?.reset()
        setOpen(false)
      }}
      className="card p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={`chip transition-colors ${
              kind === option.value ? 'bg-accent text-white' : 'bg-mist text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        {KINDS.find((option) => option.value === kind)?.hint}
      </p>

      <input name="title" required className="field mt-3" placeholder="30-Day MVP Challenge" />

      <textarea
        name="description"
        rows={3}
        className="field mt-2.5 resize-none"
        placeholder="What people are committing to, and what finishing looks like."
      />

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <label htmlFor="starts_at" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Starts
          </label>
          <input id="starts_at" name="starts_at" type="datetime-local" required className="field" />
        </div>
        <div>
          <label htmlFor="location" className="mb-1.5 block text-xs font-medium text-ink-soft">
            Where
          </label>
          <input id="location" name="location" className="field" placeholder="Online" />
        </div>
      </div>

      <input name="url" type="url" className="field mt-2.5" placeholder="Link (optional)" />

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create
        </button>
      </div>
    </form>
  )
}

export function RsvpButton({
  slug,
  eventId,
  going,
  kind,
}: {
  slug: string
  eventId: string
  going: boolean
  kind: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void toggleRsvp(slug, eventId)
        })
      }
      className={`btn w-full ${going ? 'btn-quiet' : 'btn-primary'}`}
    >
      {pending
        ? 'One moment…'
        : going
          ? kind === 'challenge'
            ? 'You are in'
            : 'Going'
          : kind === 'challenge'
            ? 'Join the challenge'
            : 'Count me in'}
    </button>
  )
}
