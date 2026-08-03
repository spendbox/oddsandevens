"use client";

// Small pieces the dashboard panels all reach for.

import { Check, Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";

export const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brass";

export const PRIMARY =
  "rounded-xl bg-brass px-5 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50";

export const GHOST =
  "rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold transition hover:border-brass/40 disabled:opacity-50";

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
    <section className="panel rounded-2xl p-5">
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
    <div className="panel rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-zinc-100">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
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
  live: "bg-mark-green/20 text-mark-green",
  funding: "bg-brass/20 text-brass",
  unlocked: "bg-white/10 text-zinc-300",
  closed: "bg-white/5 text-zinc-500",
  draft: "bg-white/5 text-zinc-500",
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
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold " +
        (STATUS_STYLES[status] ?? STATUS_STYLES.closed)
      }
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
