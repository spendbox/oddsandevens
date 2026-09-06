'use client'

import { useActionState, useState } from 'react'
import { ErrorNote } from '@/components/ui'
import { startTool, type NewToolState } from './actions'

const initial: NewToolState = { error: null }

export function BriefBox({ examples }: { examples: string[] }) {
  const [state, formAction, pending] = useActionState(startTool, initial)
  const [value, setValue] = useState('')

  return (
    <form action={formAction}>
      <textarea
        name="brief"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={4}
        autoFocus
        placeholder="A calculator that works out import duty on a car coming into Nigeria…"
        aria-label="Describe the tool you want"
        className="field resize-none text-[15px] leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || value.trim().length < 12} className="btn btn-primary px-5 py-2.5">
          {pending ? 'Starting…' : 'Build it'}
        </button>
        <span className="text-[12px] text-ink-faint">Takes about a minute.</span>
      </div>

      {state.error ? <div className="mt-4"><ErrorNote>{state.error}</ErrorNote></div> : null}

      <div className="mt-8">
        <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
          Or start from one of these
        </p>
        <ul className="mt-3 space-y-1.5">
          {examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => setValue(example)}
                className="w-full rounded-[10px] px-3 py-2 text-left text-[13px] leading-relaxed text-ink-soft transition-colors hover:bg-mist hover:text-ink"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  )
}
