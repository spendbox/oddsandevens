/**
 * How long ago something happened, in the words people use.
 *
 * "3 minutes ago" and "yesterday" are how memory works; "14/02/2026, 09:41" is
 * how a filesystem works, and reading one to answer "is this the thing I was
 * writing before lunch" takes a subtraction nobody should have to do. Past a
 * week the relative form stops helping — "23 days ago" means nothing — so it
 * becomes a date.
 *
 * `now` is a parameter so the awkward boundaries are unit tests rather than
 * something to reproduce by waiting.
 */
export function when(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
