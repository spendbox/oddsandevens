"use client";

// A reward that is owed, and where it is going.
//
// This used to be a second bank form. A player who had already saved an
// account on the next tab was asked for one again the moment they won, which
// is both an insult and a hazard: two accounts on file, no way to tell which
// one anything was sent to, and a form standing between somebody and the money
// they have just spent a fortnight earning.
//
// There is one account per player now, it lives on the account tab, and this
// reads it. Winning asks for nothing at all — if the account is there, the
// transfer is already queued; if it isn't, this points at the one screen that
// fixes that.

import Link from "next/link";
import { ArrowRight, BadgeCheck, Landmark } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";

export interface Prize {
  id: string;
  amountKobo: number;
  status: "unclaimed" | "submitted" | "paid";
  title: string;
  slug: string | null;
  accountName: string | null;
  bankName: string | null;
  wonAt: string;
  paidAt: string | null;
}

/** What we currently know about where this player's money goes. */
export interface PayoutAccount {
  accountName: string | null;
  bankName: string | null;
  accountLast4: string | null;
  connected: boolean;
}

export function PrizeOwed({
  prize,
  account,
  onAddAccount,
}: {
  prize: Prize;
  account: PayoutAccount | null;
  /** Switches the safehouse to the account tab. */
  onAddAccount: () => void;
}) {
  const ready = !!account?.connected;

  return (
    <div
      className={
        "panel rounded-2xl p-4 " + (ready ? "border-mint/30" : "border-brass/40")
      }
    >
      <p className="text-sm text-zinc-400">
        <span className="brass-text text-xl font-bold">
          {formatNaira(prize.amountKobo)}
        </span>{" "}
        from {prize.title}
      </p>

      {ready ? (
        <>
          <p className="mt-3 flex items-start gap-2 rounded-xl border-2 border-mint/40 bg-mint/10 px-3 py-2.5 text-sm font-semibold text-mint">
            <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Going to {account.accountName} · {account.bankName} ····{" "}
              {account.accountLast4}
            </span>
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Sent within 24 hours of the crack. Nothing for you to do — change
            the account on the{" "}
            <button
              type="button"
              onClick={onAddAccount}
              className="font-bold text-brass underline underline-offset-2"
            >
              account tab
            </button>{" "}
            if it is wrong.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 flex items-start gap-2 rounded-xl border-2 border-brass/40 bg-brass/10 px-3 py-2.5 text-sm font-semibold text-brass">
            <Landmark className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>We don’t have an account to send this to yet.</span>
          </p>
          <button
            type="button"
            onClick={onAddAccount}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-5 py-3 text-ink"
          >
            Add your bank account
            <ArrowRight className="size-4" aria-hidden />
          </button>
          <p className="mt-2 text-center text-xs text-zinc-500">
            The 24 hours starts when the account arrives — money cannot be sent
            to an account nobody has.
          </p>
        </>
      )}

      {prize.slug && (
        <Link
          href={`/b/${prize.slug}`}
          className="mt-3 block text-center text-xs font-bold text-zinc-500 hover:text-zinc-300"
        >
          See the safe you cracked
        </Link>
      )}
    </div>
  );
}
