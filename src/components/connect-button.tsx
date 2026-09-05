'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { requestConnection } from '@/lib/connections'

export function ConnectButton({
  profileId,
  handle,
  pursuitId,
  reason,
  slug,
  state,
}: {
  profileId: string
  handle: string
  pursuitId: string | null
  reason: string
  slug?: string
  state?: string
}) {
  const [pending, startTransition] = useTransition()
  const path = slug ? `/p/${slug}/people` : '/people'

  if (state === 'accepted') {
    return (
      <Link href={`/messages/${handle}`} className="btn btn-quiet w-full">
        Message
      </Link>
    )
  }

  if (state === 'pending') {
    return (
      <button type="button" disabled className="btn btn-quiet w-full">
        Request sent
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void requestConnection(profileId, reason, pursuitId, path)
        })
      }
      className="btn btn-primary w-full"
    >
      {pending ? 'Sending…' : 'Connect'}
    </button>
  )
}
