'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ErrorNote } from '@/components/ui'
import { askForChange } from './actions'

/** The main way a tool gets edited: say what should be different. */
export function AskForChange({ toolId, engineName }: { toolId: string; engineName: string }) {
  const router = useRouter()
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="card p-4">
      <label htmlFor="change" className="label">
        Change something
      </label>
      <textarea
        id="change"
        rows={3}
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Add a field for VAT, and show the total with and without it."
        className="field resize-none"
      />
      <p className="mt-1.5 text-[12px] text-ink-faint">
        Say it plainly. Forge rebuilds the {engineName} with the change and leaves everything else
        alone.
      </p>

      {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}

      <button
        type="button"
        disabled={pending || instruction.trim().length < 4}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await askForChange(toolId, instruction)
            if (result.error) setError(result.error)
            else {
              setInstruction('')
              router.refresh()
            }
          })
        }
        className="btn btn-primary mt-3 w-full"
      >
        {pending ? 'Making the change…' : 'Make the change'}
      </button>
    </div>
  )
}
