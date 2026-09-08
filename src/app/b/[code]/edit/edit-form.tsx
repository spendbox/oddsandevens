'use client'

import { useActionState, useState } from 'react'
import { Check, Eye } from 'lucide-react'
import { Button, Card, Field, Note, Problem } from '@/components/ui'
import { BoxPreview } from '@/components/box-preview'
import { FlyerStudio } from '@/components/flyer-studio'
import type { Box } from '@/lib/types'
import { saveBox, type EditState } from './actions'

/**
 * Editing a box, with what it will look like sitting next to it.
 *
 * The preview and the flyers both read from what is currently typed rather than
 * from what is saved, so a creator can see the effect of a sentence before
 * committing to it — which is the only way to write a description that works at
 * the size it is actually read.
 */
export function EditForm({ box }: { box: Box }) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveBox, {})
  const [title, setTitle] = useState(box.title)
  const [description, setDescription] = useState(box.description)
  // Pictures are switched off for now, so the preview shows whatever the box
  // already has rather than anything being chosen. The upload path itself is
  // untouched — src/components/image-picker.tsx and the handling in actions.ts
  // are still there and still work; only this control is hidden.
  const preview: Box = { ...box, title, description }

  return (
    <div className="grid gap-6">
      <Card>
        <form action={action} className="grid gap-5">
          <input type="hidden" name="code" value={box.code} />

          <Field
            label="Box name"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={60}
            placeholder="Friday night challenge"
            hint="What people see when you share the link."
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-mist">Description</span>
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Tell people why they should try. Trash talk encouraged."
              className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-base
                         text-chalk placeholder:text-dusk focus:border-violet/60 focus:outline-none
                         focus:ring-2 focus:ring-violet/25"
            />
            <span className="mt-1.5 block text-xs text-dusk">
              {description.length}/280 · shows on your box page and on your flyers.
            </span>
          </label>

          {state.problem ? <Problem>{state.problem}</Problem> : null}
          {state.saved ? (
            <Note>
              <span className="inline-flex items-center gap-1.5">
                <Check size={15} /> Saved. Your box page and flyers are updated.
              </span>
            </Note>
          ) : null}

          <Button type="submit" tone="gold" size="lg" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>

      <section>
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Eye size={15} /> How your box looks
        </p>
        <p className="mb-4 text-xs text-dusk">
          Live, from what you have typed. Save to make it real.
        </p>
        <BoxPreview
          box={preview}
          title={title}
          description={description}
          imageUrl={preview.image_url}
        />
      </section>

      <section>
        <p className="mb-1 px-1 text-sm font-semibold">Your flyers</p>
        <p className="mb-3 px-1 text-xs text-dusk">
          These carry your name and description. Download as a PNG or a PDF.
        </p>
        <FlyerStudio box={preview} />
      </section>
    </div>
  )
}
