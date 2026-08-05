"use client";

// Handing somebody a safe.
//
// One box is one link, and a link somebody sent you is how nearly everyone
// arrives — so the share affordance belongs wherever a box is, not only in the
// dashboard where its author can find it. A player looking at a board of safes
// is the person most likely to send one to a friend who would enjoy it.
//
// The native share sheet where there is one, the clipboard where there isn't.
// Decided at the moment of the tap rather than at render: `navigator.share`
// doesn't exist during SSR, and branching the icon on it would change during
// hydration.

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Share, or copy. Resolves true when the link ended up on the clipboard. */
export async function shareSafe(slug: string, title: string): Promise<boolean> {
  const url = `${window.location.origin}/b/${slug}`;
  const text = `Guess the password and the money's yours — ${title}`;

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return false;
    } catch {
      // Cancelled, or the sheet refused — fall through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // Nothing sensible left to do; the link is on screen anyway.
    return false;
  }
}

/**
 * The compact one, for a corner of a card.
 *
 * `stopPropagation` matters: these sit on top of a card that is itself a link,
 * and a share that also navigates you away from the thing you were sharing is
 * worse than no share button.
 */
export function ShareChip({
  slug,
  title,
  className = "",
}: {
  slug: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Share ${title}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void shareSafe(slug, title).then((wasCopied) => {
          if (!wasCopied) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
      className={
        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-background/85 text-zinc-400 transition hover:border-brass/60 hover:text-brass " +
        className
      }
    >
      {copied ? (
        <Check className="size-4 text-mark-green" aria-hidden />
      ) : (
        <Share2 className="size-4" aria-hidden />
      )}
    </button>
  );
}
