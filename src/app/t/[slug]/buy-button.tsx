'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ErrorNote } from '@/components/ui'
import { beginPurchase } from './purchase'

export function BuyButton({
  toolId,
  slug,
  signedIn,
}: {
  toolId: string
  slug: string
  signedIn: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!signedIn) {
    return (
      <Link href={`/signin?next=/t/${slug}`} className="btn btn-primary px-5 py-2.5">
        Sign in to buy
      </Link>
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await beginPurchase(toolId, slug)
            if (result.error) setError(result.error)
            else if (result.url) window.location.href = result.url
          })
        }
        className="btn btn-primary px-5 py-2.5"
      >
        {pending ? 'Opening checkout…' : 'Buy this tool'}
      </button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  )
}
