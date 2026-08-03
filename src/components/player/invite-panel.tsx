"use client";

// Bring somebody with you.
//
// Deliberately short. A player does not need the mechanics of who earns what
// from whose spending — that's a contributor's business, and it's on the FAQ
// for anyone curious. What a player needs is the link, the one condition, and
// what they've got waiting.

import { useCallback, useEffect, useState } from "react";
import { Check, Gift, Share2 } from "lucide-react";
import { plural } from "@/lib/plural";
import type { ReferralState } from "@/lib/types";

export function InvitePanel() {
  const [referral, setReferral] = useState<ReferralState | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/player/invite", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { referral: ReferralState };
        setReferral(body.referral);
      }
    } catch {
      // Nothing here is load-bearing; an absent panel beats a broken one.
    }
  }, []);

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, [load]);

  if (!referral?.inviteCode) return null;

  const link = `${typeof window === "undefined" ? "" : window.location.origin}/?ref=${referral.inviteCode}`;

  async function share() {
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
  }

  return (
    <section className="panel space-y-3 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        <Gift className="size-4 text-brass" aria-hidden />
        Invite a friend
      </h2>

      <p className="text-sm text-zinc-400">
        When someone who joins on your link buys{" "}
        {plural(referral.minLives, "life", "lives")} or more, you get{" "}
        <strong className="text-brass">
          {plural(referral.inviterBonus, "free life", "free lives")}
        </strong>{" "}
        on your next top-up — and they get {referral.inviteeBonus}. It stacks:
        ten friends is {referral.inviterBonus * 10} lives.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl bg-white/5 px-3 py-2.5 font-mono text-sm text-zinc-200">
          {link}
        </code>
        <button
          type="button"
          onClick={() => void share()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brass px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-brass-bright"
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Share2 className="size-4" aria-hidden />
          )}
          {copied ? "Copied" : "Share"}
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Figure label="Joined" value={referral.joined} />
        <Figure label="Paid up" value={referral.qualified} />
        <Figure label="Lives waiting" value={referral.bonusLivesPending} accent />
      </dl>

      {referral.bonusLivesPending > 0 && (
        <p className="rounded-xl bg-brass/10 px-3 py-2 text-center text-xs text-brass">
          {plural(referral.bonusLivesPending, "free life", "free lives")} land
          automatically on your next top-up.
        </p>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2.5">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd
        className={
          "mt-0.5 font-mono text-lg font-bold " +
          (accent && value > 0 ? "text-brass" : "text-zinc-200")
        }
      >
        {value}
      </dd>
    </div>
  );
}
