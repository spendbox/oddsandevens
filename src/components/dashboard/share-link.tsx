"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import type { SubscriptionTier } from "@/lib/constants";

export function ShareLink({
  slug,
  tier,
}: {
  slug: string;
  tier: SubscriptionTier;
}) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/g/${slug}` : `/g/${slug}`;
  return (
    <div className="card flex h-full flex-col gap-3 p-4 sm:p-5">
      <p className="section-title">
        <Link2 className="size-3.5" aria-hidden />
        Your customer link ·{" "}
        <span style={{ color: "var(--brand)" }}>{tier} tier</span>
      </p>
      <p
        className="break-all rounded-xl px-3 py-2.5 font-mono text-sm leading-relaxed"
        style={{
          backgroundColor: "color-mix(in oklab, var(--brand), transparent 92%)",
          color: "var(--brand)",
        }}
      >
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="btn-secondary px-4 py-2.5 text-sm"
        >
          {copied ? (
            <>
              <Check className="size-4" style={{ color: "var(--brand)" }} aria-hidden />{" "}
              Copied!
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden /> Copy link
            </>
          )}
        </button>
        <a
          href={`/g/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary px-4 py-2.5 text-sm"
        >
          <ExternalLink className="size-4" aria-hidden /> Visit page
        </a>
      </div>
    </div>
  );
}
