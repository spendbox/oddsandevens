'use client'

import { useLinkStatus } from 'next/link'
import { useFormStatus } from 'react-dom'

/**
 * The two ways a plain piece of text can be busy.
 *
 * Buttons look after themselves — see components/button.tsx — but a link or a
 * submit that is styled as text rather than as a button still has to say it has
 * been tapped. A tap with no response for half a second reads as a broken
 * control, and people tap it again, which on this site can mean a second coin
 * or a second payment.
 *
 * Both are one line to add and render nothing at all until something is
 * actually happening.
 */
const DOT =
  'ml-1.5 inline-block size-3.5 animate-spin rounded-full border-2 ' +
  'border-current border-t-transparent opacity-70 align-[-0.15em]'

/** For a `<Link>`: spins while the page it points at is being fetched. */
export function PendingDot() {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return <span aria-hidden className={DOT} />
}

/** For a `<button type="submit">`: spins while its own form is in flight. */
export function SubmitDot() {
  const { pending } = useFormStatus()
  if (!pending) return null

  return <span aria-hidden className={DOT} />
}

