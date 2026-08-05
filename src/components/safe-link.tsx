"use client";

// The tap that opens a safe, and the two seconds after it.
//
// Every card on the front page is a stretched link to `/b/<slug>`, and that
// route reads four things out of Postgres before it can render. On a phone
// that is a real pause during which the card did nothing at all — no press
// state, no dimming, nothing — so the tap read as having missed, and a tap
// that reads as having missed gets repeated.
//
// `loading.tsx` covers the destination. This covers the *origin*: the card you
// pressed says so, immediately, before the navigation has even been dispatched.
// Both are needed. The route fallback can only appear once the router has
// begun, and the interesting part of the wait is before that.
//
// `useLinkStatus` has to live inside the `<Link>` it reports on, which is why
// this is a component rather than a hook at the card level — and it is why the
// overlay is a child of the stretched link rather than a sibling of it.

import Link from "next/link";
import { useLinkStatus } from "next/link";

export function SafeLink({
  slug,
  title,
  className = "",
}: {
  slug: string;
  title: string;
  className?: string;
}) {
  return (
    <Link href={`/b/${slug}`} aria-label={title} className={className}>
      <LinkOpening />
    </Link>
  );
}

/**
 * The card, caught mid-open.
 *
 * A dial rather than a spinner, and "Opening" rather than "Loading", because
 * everything else on this site is a safe and a spinner is a web page. The
 * dimming is what does the real work — it is the only part visible from the
 * corner of an eye, which is where a thumb-press is.
 */
export function LinkOpening() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span className="animate-fade-up absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] bg-background-deep/70 backdrop-blur-[1px]">
      <span className="flex items-center gap-2 rounded-full border-2 border-brass/60 bg-background/90 px-3.5 py-2 text-xs font-black text-brass shadow-lg">
        <Dial />
        Opening…
      </span>
    </span>
  );
}

/** A combination dial, hunting. The same one the play screen spins. */
function Dial() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <g className="safe-dial-spin" style={{ transformOrigin: "50% 50%" }}>
        <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3.2 L12 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
