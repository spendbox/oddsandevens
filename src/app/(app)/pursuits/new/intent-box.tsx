'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function IntentBox() {
  const router = useRouter()
  const [value, setValue] = useState('')

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const intent = value.trim()
        if (intent) router.push(`/pursuits/new?q=${encodeURIComponent(intent)}`)
      }}
    >
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
        rows={2}
        autoFocus
        placeholder="I want to learn AI automation this year"
        aria-label="What do you want to do?"
        className="field resize-none text-[15px] leading-relaxed"
      />
      <button type="submit" disabled={!value.trim()} className="btn btn-primary mt-3 px-5 py-2.5">
        Find people doing this
      </button>
    </form>
  )
}
