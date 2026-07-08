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
    <div className="card flex h-full flex-col gap-3 p-4 sm:p-5">
      <p className="section-title">
        <Link2 className="size-3.5" aria-hidden />
        Your customer link ·{" "}
        <span className="text-emerald-600">{tier} tier</span>
      </p>
      <p className="break-all rounded-xl bg-emerald-50 px-3 py-2.5 font-mono text-sm leading-relaxed text-emerald-700">
        {url}
      </p>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn-secondary w-full px-4 py-2.5 text-sm sm:w-auto sm:self-start"
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
