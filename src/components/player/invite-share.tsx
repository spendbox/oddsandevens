"use client";

// The invite link, and the one gesture that gets it out of here.
//
// Shared because it is now asked for from two places that have nothing else in
// common: the panel on `/me`, where inviting is the whole point of the screen,
// and the buy-lives dialog, where it is the free alternative to paying. Both
// need the same link, the same share sheet, and the same clipboard fallback —
// only the button around it differs, so only the button is left to the caller.

import { useCallback, useState } from "react";

/** Where a `?ref=` link points. Empty on the server, where there's no origin. */
export function inviteLink(code: string | null): string {
  if (!code) return "";
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/?ref=${code}`;
}

/**
 * Share the link, or copy it.
 *
 * `navigator.share` is the whole point on a phone — it opens WhatsApp, which is
 * where these actually travel — and it is absent on most desktops and rejects
 * when the sheet is dismissed. Either way we fall through to the clipboard, and
 * `copied` is what the caller shows for the two seconds afterwards.
 */
export function useInviteShare(code: string | null): {
  link: string;
  copied: boolean;
  share: () => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(code);

  const share = useCallback(async () => {
    if (!link) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Spendbox",
          text: "Guess a password, open a safe, keep what's inside.",
          url: link,
        });
        return;
      } catch {
        // Cancelled, or no sheet — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen anyway.
    }
  }, [link]);

  return { link, copied, share };
}
