'use client'

import { useActionState } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, Note, Problem } from '@/components/ui'
import { ImagePicker } from '@/components/image-picker'
import type { Box } from '@/lib/types'
import { saveBox, type EditState } from './actions'

export function EditForm({ box }: { box: Box }) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveBox, {})

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="code" value={box.code} />

      <Field
        label="Box name"
        name="title"
        defaultValue={box.title}
        maxLength={60}
        placeholder="Friday night challenge"
        hint="What people see when you share the link."
      />

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-mist">Description</span>
        <textarea
          name="description"
          defaultValue={box.description}
          maxLength={280}
          rows={3}
          placeholder="Tell people why they should try. Trash talk encouraged."
          className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-base
                     text-chalk placeholder:text-dusk focus:border-violet/60 focus:outline-none
                     focus:ring-2 focus:ring-violet/25"
        />
        <span className="mt-1.5 block text-xs text-dusk">Up to 280 characters.</span>
      </label>

      <ImagePicker currentUrl={state.imageUrl ?? box.image_url} />

      {state.problem ? <Problem>{state.problem}</Problem> : null}
      {state.saved ? (
        <Note>
          <span className="inline-flex items-center gap-1.5">
            <Check size={15} /> Saved. Your box page is updated.
          </span>
        </Note>
      ) : null}

      <Button type="submit" tone="gold" size="lg" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
