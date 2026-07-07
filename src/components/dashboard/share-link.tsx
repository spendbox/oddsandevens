"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
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
    <div className="card flex h-full flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="section-title">
          <Link2 className="size-3.5" aria-hidden />
          Your customer link ·{" "}
          <span className="text-emerald-600">{tier} tier</span>
        </p>
        <p className="mt-1 truncate font-mono text-sm text-emerald-700 sm:text-base">
          {url}
        </p>
      </div>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn-secondary px-4 py-2 text-sm"
      >
        {copied ? (
          <>
            <Check className="size-4 text-emerald-600" aria-hidden /> Copied!
          </>
        ) : (
          <>
            <Copy className="size-4" aria-hidden /> Copy link
          </>
        )}
      </button>
    </div>
  );
}
