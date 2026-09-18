'use client'

import { ArrowUpCircle } from 'lucide-react'
import { applyUpdate, useUpdateReady } from '@/lib/update'

/**
 * "Update" — there, only when there is genuinely a newer version waiting.
 *
 * ## Why it is offered rather than taken
 *
 * Because the alternative is reloading the page under somebody who is
 * writing. An installed app is resumed rather than reopened, so the moment a
 * new version lands is a moment of the deploy's choosing and has nothing to
 * do with what the reader is in the middle of. This says so and waits; the
 * work is already on the device either way, so nothing is at stake in
 * waiting.
 *
 * ## Why it is in the bar and not a banner
 *
 * A banner across the top of a list pushes every row down to say something
 * nobody urgently needs. This is the same shape and the same corner as the
 * install button, which is the other thing on this screen that is about the
 * app rather than about the notes, and it is gone the moment it is pressed.
 */
export default function UpdateButton() {
  const ready = useUpdateReady()
  if (!ready) return null

  return (
    <button
      type="button"
      onClick={applyUpdate}
      aria-label="Update to the new version"
      title="A new version is ready"
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
    >
      <ArrowUpCircle size={14} />
      <span className="hidden sm:inline">Update</span>
    </button>
  )
}
