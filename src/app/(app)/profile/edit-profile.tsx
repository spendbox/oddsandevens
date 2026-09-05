'use client'

import { useActionState } from 'react'
import type { Profile } from '@/lib/types'
import { saveProfile, type ProfileState } from './actions'

const initial: ProfileState = { error: null, saved: false }

export function EditProfile({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(saveProfile, initial)

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <div>
        <label htmlFor="full_name" className="mb-1.5 block text-xs font-medium text-ink-soft">
          Name
        </label>
        <input id="full_name" name="full_name" defaultValue={profile.full_name} className="field" />
      </div>

      <div>
        <label htmlFor="headline" className="mb-1.5 block text-xs font-medium text-ink-soft">
          What you do
        </label>
        <input id="headline" name="headline" defaultValue={profile.headline} className="field" />
      </div>

      <div>
        <label htmlFor="location" className="mb-1.5 block text-xs font-medium text-ink-soft">
          Where you are
        </label>
        <input id="location" name="location" defaultValue={profile.location} className="field" />
      </div>

      <div>
        <label htmlFor="skills" className="mb-1.5 block text-xs font-medium text-ink-soft">
          What you can help with
        </label>
        <input
          id="skills"
          name="skills"
          defaultValue={profile.skills.join(', ')}
          className="field"
          placeholder="Product Design, Figma, Research"
        />
        <p className="mt-1.5 text-[11px] text-ink-faint">
          Comma separated. These are matched against what other people say they need.
        </p>
      </div>

      <div>
        <label htmlFor="bio" className="mb-1.5 block text-xs font-medium text-ink-soft">
          About you
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          defaultValue={profile.bio}
          className="field resize-none"
        />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-[10px] bg-rose-soft px-3 py-2.5 text-[13px] text-rose">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {state.saved && !pending ? (
          <span className="text-[12px] text-lift">Saved</span>
        ) : null}
      </div>
    </form>
  )
}
