"use client";

// Where a prize goes.
//
// The account number is checked against the bank before anything is saved, and
// the name that comes back is shown — so a mistyped digit is caught here,
// while it is still a form, rather than after ₦2,000,000 has left.

import { useState } from "react";
import { ACCOUNT_NUMBER_REGEX } from "@/lib/constants";
import { formatNaira } from "@/lib/game/rewards";
import type { Bank } from "@/lib/types";

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

export function PrizeClaimForm({
  prize,
  banks,
  onDone,
}: {
  prize: Prize;
  banks: Bank[];
  onDone: () => void;
}) {
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!bankCode || !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
      setError("Pick a bank and enter the 10-digit account number.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/player/prizes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claimId: prize.id,
        bankCode,
        bankName: banks.find((b) => b.code === bankCode)?.name,
        accountNumber,
      }),
    });
    setBusy(false);
    if (res.ok) {
      onDone();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(
      body.error === "account_not_found"
        ? "That account number doesn't match the bank. Check both."
        : "Couldn't save those details. Try again."
    );
  }

  return (
    <div className="panel rounded-2xl p-4">
      <p className="text-sm text-zinc-400">
        <span className="brass-text text-xl font-bold">
          {formatNaira(prize.amountKobo)}
        </span>{" "}
        from {prize.title}
      </p>

      <div className="mt-3 space-y-2">
        <select
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-brass"
        >
          <option value="">Choose your bank</option>
          {banks.map((bank) => (
            <option key={bank.code} value={bank.code} className="text-zinc-900">
              {bank.name}
            </option>
          ))}
        </select>

        <input
          inputMode="numeric"
          maxLength={10}
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
          placeholder="10-digit account number"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none focus:border-brass"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-brass px-4 py-2.5 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
        >
          {busy ? "Checking the account…" : "Send my prize here"}
        </button>

        {banks.length === 0 && (
          <p className="text-xs text-zinc-500">
            The bank list isn&apos;t available right now. Try again shortly — the
            prize is safe either way.
          </p>
        )}
      </div>
    </div>
  );
}
