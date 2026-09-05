'use client'

import { useRef, useState } from 'react'
import { Avatar } from '@/components/avatar'
import type { Profile } from '@/lib/types'
import { createAsk, respondToAsk } from '../actions'

export function AskComposer({
  slug,
  pursuitId,
  profile,
}: {
  slug: string
  pursuitId: string
  profile: Profile
}) {
  const [kind, setKind] = useState<'need' | 'offer' | null>(null)
  const askForm = useRef<HTMLFormElement>(null)

  if (!kind) {
    return (
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Avatar profile={profile} size="sm" />
        <p className="flex-1 text-sm text-ink-muted">
          What would move you forward — or what could you save someone else from?
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setKind('need')} className="btn btn-quiet">
            I need…
          </button>
          <button type="button" onClick={() => setKind('offer')} className="btn btn-primary">
            I can help…
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      ref={askForm}
      action={async (formData) => {
        await createAsk(formData)
        askForm.current?.reset()
        setKind(null)
      }}
      className="card p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />
      <input type="hidden" name="kind" value={kind} />

      <h3 className="text-sm font-semibold text-ink">
        {kind === 'need' ? 'What do you need?' : 'What can you help with?'}
      </h3>

      <input
        name="title"
        required
        className="field mt-3"
        placeholder={
          kind === 'need'
            ? 'Someone experienced with B2B customer acquisition'
            : 'I have grown two B2B SaaS products'
        }
      />

      <textarea
        name="body"
        rows={3}
        className="field mt-2.5 resize-none"
        placeholder={
          kind === 'need'
            ? 'What you have tried, and what specifically would unblock you.'
            : 'What you have actually done, and how you would help.'
        }
      />

      <input
        name="tags"
        className="field mt-2.5"
        placeholder="Tags, comma separated: b2b, sales, growth"
      />
      <p className="mt-1.5 text-[11px] text-ink-faint">
        Tags are how this gets matched to the person on the other side of it.
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setKind(null)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Post
        </button>
      </div>
    </form>
  )
}

export function RespondForm({
  slug,
  askId,
  kind,
}: {
  slug: string
  askId: string
  kind: 'need' | 'offer'
}) {
  const [open, setOpen] = useState(false)
  const respondForm = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-quiet mt-3.5"
      >
        {kind === 'need' ? 'I can help with this' : 'I would like this'}
      </button>
    )
  }

  return (
    <form
      ref={respondForm}
      action={async (formData) => {
        await respondToAsk(formData)
        respondForm.current?.reset()
        setOpen(false)
      }}
      className="mt-3.5"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ask_id" value={askId} />
      <textarea
        name="body"
        rows={3}
        required
        autoFocus
        className="field resize-none text-[13px]"
        placeholder={
          kind === 'need'
            ? 'How you can help, and what you have done that makes you useful here.'
            : 'What you are hoping to get from this.'
        }
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Send
        </button>
      </div>
    </form>
  )
}
