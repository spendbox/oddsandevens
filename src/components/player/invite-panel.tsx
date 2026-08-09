"use client";

// Bring somebody with you.
//
// Deliberately short, and shorter than it was: the terms are one sentence now,
// so the panel is the sentence, the link, and what the link has brought in.
// There is no longer a condition to explain — a friend joining *is* the payout
// — which is what took a paragraph and three figures down to a line and two.

import { useCallback, useEffect, useState } from "react";
import { Check, Gift, Share2 } from "lucide-react";
import { plural } from "@/lib/plural";
import { useInviteShare } from "./invite-share";
import type { ReferralState } from "@/lib/types";

export function InvitePanel() {
  const [referral, setReferral] = useState<ReferralState | null>(null);
  const { link, copied, share } = useInviteShare(referral?.inviteCode ?? null);

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

  return (
    <section className="panel space-y-3 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        <Gift className="size-4 text-brass" aria-hidden />
        Invite a friend
      </h2>

      <p className="text-sm text-zinc-400">
        When someone joins on your link you{" "}
        <strong className="text-brass">both get {referral.bonus} free lives</strong>
        , straight away. Nothing to buy. It stacks: ten friends is{" "}
        {referral.bonus * 10} lives.
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

      <dl className="grid grid-cols-2 gap-2 text-center">
        <Figure label="Joined" value={referral.joined} />
        <Figure
          label="Lives earned"
          value={referral.joined * referral.bonus}
          accent
        />
      </dl>

      {/*
        Only ever true for players who banked lives under the old terms, where
        the bonus waited for a paid top-up. Nothing adds to it now, so this line
        disappears for good once they spend it.
      */}
      {referral.bonusLivesPending > 0 && (
        <p className="rounded-xl bg-brass/10 px-3 py-2 text-center text-xs text-brass">
          {plural(referral.bonusLivesPending, "free life", "free lives")} from
          before land automatically on your next top-up.
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
