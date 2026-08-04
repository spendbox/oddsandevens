"use client";

// Small pieces the dashboard panels all reach for.

import { Check, Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * A text box.
 *
 * The surface itself is the `field` utility in `globals.css`, so a dialog that
 * doesn't import from the dashboard can still get an identical box; this is
 * only the padding, which `field` deliberately leaves alone so an input with an
 * icon in it can inset one side without a specificity fight.
 */
export const INPUT = "field px-4 py-3";

/** The one button on a screen that does the thing. Gold slab, hard lip. */
export const PRIMARY = "btn-chunky rounded-2xl bg-brass px-5 py-3.5 text-ink";

/** Everything else. Raised, but quietly. */
export const GHOST =
  "rounded-xl border-2 border-white/12 bg-white/6 px-4 py-2.5 text-sm font-bold transition hover:border-brass/50 hover:bg-white/10 active:translate-y-0.5 disabled:opacity-50";

export function Panel({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel rounded-3xl p-5">
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-zinc-500">{children}</p>;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-2xl p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

/**
 * The share button. Uses the native share sheet where there is one — a
 * contributor's whole job after building a box is getting people to it, and on
 * a phone that means WhatsApp, not a clipboard.
 */
export function ShareButton({ slug, title }: { slug: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/b/${slug}`;
    const text = `Guess the password and the money's yours — ${title}`;

    // Decided here rather than at render: `navigator` doesn't exist during
    // SSR, and branching the icon on it would change during hydration.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // Cancelled, or the sheet refused — fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing sensible left to do; the link is on screen anyway.
    }
  }

  return (
    <button type="button" onClick={() => void share()} className={GHOST}>
      <span className="flex items-center gap-1.5">
        {copied ? (
          <Check className="size-4 text-mark-green" aria-hidden />
        ) : (
          <Share2 className="size-4" aria-hidden />
        )}
        {copied ? "Link copied" : "Share"}
      </span>
    </button>
  );
}

const STATUS_STYLES: Record<string, string> = {
  live: "bg-mint text-ink",
  funding: "bg-brass text-ink",
  unlocked: "bg-grape text-ink",
  closed: "bg-white/10 text-zinc-400",
  draft: "bg-white/10 text-zinc-400",
};

const STATUS_LABELS: Record<string, string> = {
  live: "Live",
  funding: "Needs funding",
  unlocked: "Cracked",
  closed: "Closed",
  draft: "Draft",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={
        "shrink-0 rounded-lg px-2.5 py-1 text-xs font-black " +
        (STATUS_STYLES[status] ?? STATUS_STYLES.closed)
      }
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
