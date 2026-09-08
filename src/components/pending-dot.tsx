'use client'

import { useLinkStatus } from 'next/link'

/**
 * A link that shows it has been tapped.
 *
 * Navigation in this app often means a database round trip, and a tap with no
 * response for half a second reads as a broken button — so people tap again.
 * `useLinkStatus` reports the pending state of the enclosing Link, which is
 * what this turns into a spinner.
 */
export function PendingDot() {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <span
      aria-hidden
      className="ml-1.5 inline-block size-3.5 animate-spin rounded-full border-2
                 border-current border-t-transparent opacity-70"
    />
  )
}

