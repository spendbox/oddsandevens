'use client'

import { useActionState, useState } from 'react'
import { accent } from '@/lib/accent'
import type { Profile, Pursuit } from '@/lib/types'
import { completeOnboarding, type OnboardingState } from './actions'

const initial: OnboardingState = { error: null }

export function OnboardingForm({ profile, pursuits }: { profile: Profile; pursuits: Pursuit[] }) {
  const [state, formAction, pending] = useActionState(completeOnboarding, initial)
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )

  return (
    <form action={formAction}>
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
        Tell us who you are
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        Commons introduces people with a reason attached. The more it knows about what you can do,
        the better those reasons get.
      </p>

      <div className="mt-8 space-y-4">
        <Field label="Your name" name="full_name" defaultValue={profile.full_name} required
          placeholder="Ada Lovelace" />
        <Field label="What you do" name="headline" defaultValue={profile.headline}
          placeholder="Product designer, learning to code" />
        <Field label="Where you are" name="location" defaultValue={profile.location}
          placeholder="Lagos, Nigeria" />

        <div>
          <label htmlFor="skills" className="mb-1.5 block text-xs font-medium text-ink-soft">
            What you are good at
          </label>
          <input
            id="skills"
            name="skills"
            className="field"
            placeholder="Product Design, Figma, Research"
            defaultValue={profile.skills.join(', ')}
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Separate with commas. This is what lets someone be told &ldquo;you have what they
            asked for&rdquo;.
          </p>
        </div>

        <div>
          <label htmlFor="bio" className="mb-1.5 block text-xs font-medium text-ink-soft">
            A little about you
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={3}
            className="field resize-none"
            placeholder="What you are working on, and what you would happily help someone with."
            defaultValue={profile.bio}
          />
        </div>
      </div>

      {pursuits.length > 0 ? (
        <div className="mt-8">
          <p className="text-xs font-medium text-ink-soft">Pick a pursuit or two to start with</p>
          <div className="mt-3 space-y-2">
            {pursuits.map((pursuit) => {
              const on = picked.includes(pursuit.id)
              const tone = accent(pursuit.accent)
              return (
                <label
                  key={pursuit.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-[12px] border p-3 transition-colors ${
                    on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-mist'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="pursuit"
                    value={pursuit.id}
                    checked={on}
                    onChange={() => toggle(pursuit.id)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-base ${tone.soft}`}
                  >
                    {pursuit.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {pursuit.title}
                    </span>
                    <span className="block text-[11px] text-ink-muted">
                      {pursuit.member_count.toLocaleString()} pursuing this
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      on ? 'border-accent bg-accent text-white' : 'border-line-strong text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="mt-5 rounded-[10px] bg-rose-soft px-3 py-2.5 text-[13px] text-rose">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary mt-8 w-full py-2.5">
        {pending ? 'Setting up…' : 'Enter Commons'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-xs font-medium text-ink-soft">
        {label}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field"
      />
    </div>
  )
}
