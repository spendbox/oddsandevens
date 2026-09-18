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

/**
 * When a note was last touched, as a list would print it.
 *
 * A different question from `when` above, and the reason both exist: in a
 * sentence about one note, "3 minutes ago" is what somebody wants; in a column
 * beside forty of them, every row saying "ago" is noise and the eye is
 * actually scanning for *today* against *not today*. So today is a clock time,
 * yesterday says so, and anything older is a date — which is what every
 * messaging app and every mail client has settled on, because it is the form
 * that answers the question at a glance.
 *
 * `now` is a parameter for the same reason it is above: midnight, the turn of
 * the year and a stamp from the future are unit tests rather than something to
 * reproduce by waiting.
 */
export function stamp(at: number, now = Date.now()): string {
  const then = new Date(at)
  const today = new Date(now)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  // A clock time, never a date, for anything written today — including
  // anything stamped slightly in the future, which two devices with clocks a
  // minute apart produce all the time.
  if (sameDay(then, today) || at > now) {
    return then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(then, yesterday)) return 'Yesterday'
  if (then.getFullYear() === today.getFullYear()) {
    return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The same moment, written out, for the one line under a note's title.
 *
 * There is room for both halves there and only one note to describe, so it
 * says the day *and* the time — "Today, 4:32 PM" is the line somebody reads
 * once when they open a note to work out whether it is the one from this
 * morning.
 */
export function longStamp(at: number, now = Date.now()): string {
  const day = stamp(at, now)
  const time = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  // Today's stamp is already the time, so saying it twice would read
  // "4:32 PM, 4:32 PM".
  if (day === time) return `Today, ${time}`
  return `${day}, ${time}`
}

/**
 * The heading a note sits under in a list: Today, Yesterday, a weekday, or a
 * date.
 *
 * A flat column of forty notes is forty timestamps somebody has to read one at
 * a time. Days are how people actually remember writing something — "that was
 * Tuesday" — so the list is broken into them, and the two that matter most get
 * words rather than numbers. Inside the last week a weekday is more useful
 * than a date, because "Thursday" is a thing you remember and "15 Sep" is a
 * thing you work out.
 */
export function dayLabel(at: number, now = Date.now()): string {
  const then = new Date(at)
  const today = new Date(now)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  // A note stamped slightly in the future — two devices with clocks a minute
  // apart do this constantly — belongs to today, not to a day that has not
  // happened.
  const days = Math.round((startOf(today) - startOf(then)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'long' })
  if (then.getFullYear() === today.getFullYear()) {
    return then.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  }
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * A list of notes, broken into the days they were written on.
 *
 * Order is preserved exactly: the caller has already sorted, and a group is
 * only ever a run of neighbours that share a heading. Nothing is re-sorted
 * here, so a list sorted by "last written in" stays in that order and the
 * headings simply mark where the day changes.
 */
export function byDay<T extends { updatedAt: number }>(
  items: T[],
  now = Date.now(),
): Array<{ label: string; items: T[] }> {
  const out: Array<{ label: string; items: T[] }> = []
  for (const item of items) {
    const label = dayLabel(item.updatedAt, now)
    const last = out[out.length - 1]
    if (last && last.label === label) last.items.push(item)
    else out.push({ label, items: [item] })
  }
  return out
}
