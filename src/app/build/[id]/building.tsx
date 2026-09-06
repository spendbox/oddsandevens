'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorNote } from '@/components/ui'
import { generateTool } from './actions'

const STEPS = [
  'Reading what you asked for',
  'Working out what kind of tool this is',
  'Building it',
  'Checking it runs',
]

/**
 * The wait, made legible.
 *
 * Building takes the better part of a minute, which is a very long time to look
 * at a spinner. The steps are honest about the shape of the work — two calls,
 * then validation — rather than a fake progress bar.
 */
export function Building({ toolId, brief }: { toolId: string; brief: string }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // React runs effects twice in development; building twice would cost money.
    if (started.current) return
    started.current = true

    const ticker = setInterval(() => setStep((current) => Math.min(current + 1, STEPS.length - 1)), 9000)

    generateTool(toolId)
      .then((result) => {
        clearInterval(ticker)
        if (result.error) setError(result.error)
        else router.refresh()
      })
      .catch(() => {
        clearInterval(ticker)
        setError('The tool could not be built. Try again in a moment.')
      })

    return () => clearInterval(ticker)
  }, [toolId, router])

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <p className="text-[13px] leading-relaxed text-ink-muted">You asked for:</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{brief}</p>

      <ol className="mt-6 space-y-2.5">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                index < step
                  ? 'bg-lift text-white'
                  : index === step
                    ? 'bg-accent text-white'
                    : 'bg-mist text-ink-faint'
              }`}
            >
              {index < step ? '✓' : index + 1}
            </span>
            <span
              className={`text-[13px] ${index <= step ? 'text-ink' : 'text-ink-faint'}`}
            >
              {label}
              {index === step ? <span className="animate-pulse">…</span> : null}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-[12px] text-ink-faint">
        This usually takes under a minute. You can leave the page and come back.
      </p>
    </div>
  )
}
