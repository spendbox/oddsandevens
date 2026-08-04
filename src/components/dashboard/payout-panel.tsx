"use client";

// Connecting a bank account.
//
// This is what turns the 70% from a number on a dashboard into money in an
// account: the details are registered with Paystack as a subaccount, and every
// power-up sale after that is split at settlement. Nobody here moves it by
// hand, and the contributor's share never sits in a Spendbox balance at all.

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { ACCOUNT_NUMBER_REGEX } from "@/lib/constants";
import type { Bank, ContributorProfile } from "@/lib/types";
import { INPUT, Panel, PRIMARY } from "./shared";

export function PayoutPanel({
  profile,
  onSaved,
}: {
  profile: ContributorProfile;
  onSaved: () => void;
}) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/contributor/payout")
      .then((res) => (res.ok ? res.json() : { banks: [] }))
      .then((body: { banks: Bank[] }) => setBanks(body.banks))
      .catch(() => setBanks([]));
  }, []);

  async function save() {
    if (!bankCode || !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
      setError("Pick a bank and enter the 10-digit account number.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/contributor/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankCode,
        bankName: banks.find((b) => b.code === bankCode)?.name,
        accountNumber,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setAccountNumber("");
      onSaved();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(
      body.error === "account_not_found"
        ? "That account number doesn't match the bank. Check both."
        : body.error === "payments_unavailable"
          ? "Payments aren't switched on yet."
          : "Couldn't save that. Try again in a moment."
    );
  }

  return (
    <Panel title="Getting paid">
      {profile.payout.connected && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-mark-green/10 px-3 py-2.5 text-sm text-mark-green">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Settling to <strong>{profile.payout.accountName}</strong> at{" "}
            {profile.payout.bankName}
            {profile.payout.accountNumber
              ? ` (•••• ${profile.payout.accountNumber.slice(-4)})`
              : ""}
            . Change it below whenever you like.
          </span>
        </p>
      )}

      <div className="space-y-3">
        <select
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          className={INPUT}
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
          className={`${INPUT} font-mono`}
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button type="button" disabled={busy} onClick={() => void save()} className={PRIMARY}>
          {busy ? "Checking the account…" : profile.payout.connected ? "Update" : "Connect"}
        </button>

        {banks.length === 0 && (
          <p className="text-xs text-zinc-500">
            The bank list isn’t loading right now — try again shortly.
          </p>
        )}
      </div>
    </Panel>
  );
}
