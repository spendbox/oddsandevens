// Times, said the way somebody reading a screen would say them.
//
// The admin surfaces are the only place in the product that shows a raw
// timestamp, and "2026-08-25T22:56:40.721Z" answers a different question from
// the one being asked. What an administrator wants from a `last seen` column
// is *how stale is this* — and the honest unit for that changes with the
// distance: minutes for somebody who is here now, days for somebody who isn't.
//
// Both of these take a nullable string, because half the columns they render
// are nullable and the alternative is the same ternary at every call site.

/** "just now", "14m ago", "3h ago", "6d ago", "24 Feb". */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";

  const seconds = Math.round((now - then) / 1000);
  // A clock a few seconds ahead of ours is the normal case, not an error:
  // the row was written by the database, and it is not this machine's clock.
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;

  // Past a fortnight the gap stops being the interesting part and the date
  // starts being it — "37d ago" is arithmetic nobody wants to do backwards.
  return new Date(then).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    ...(new Date(then).getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" }),
  });
}

/** "25 Aug, 22:56" — for the times a support answer has to be exact about. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
