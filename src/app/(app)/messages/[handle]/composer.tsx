'use client'

import { useRef } from 'react'
import { sendMessage } from '../actions'

export function MessageComposer({ handle, otherId }: { handle: string; otherId: string }) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await sendMessage(formData)
        formRef.current?.reset()
      }}
      className="flex items-end gap-2"
    >
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="other_id" value={otherId} />
      <textarea
        name="body"
        rows={1}
        required
        placeholder="Write a message…"
        className="field max-h-32 min-h-[42px] flex-1 resize-none py-2.5"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
      />
      <button type="submit" className="btn btn-primary shrink-0 py-2.5">
        Send
      </button>
    </form>
  )
}
