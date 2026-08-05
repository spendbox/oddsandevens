"use client";

// Where a contributor's share is sent.
//
// It used to register the account with Paystack as a subaccount so every sale
// split itself at settlement. Payouts are made by hand now — weekly, against a
// ledger — so this records an account and nothing more. The number is still
// checked with the bank before it is stored, because the mistake it catches is
// the same one either way.
//
// A saved account is a card rather than a form, and editing is something you
// ask for. A confirmation sitting above two empty inputs reads as an account
// that has not been saved.

import { useEffect, useState } from "react";
import { BadgeCheck, Pencil } from "lucide-react";
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
  const [editing, setEditing] = useState(false);

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
      setBankCode("");
      setEditing(false);
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
      {profile.payout.connected && !editing ? (
        <>
          <div className="rounded-2xl border-2 border-mint/40 bg-mint/10 p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-mint">
              <BadgeCheck className="size-4 shrink-0" aria-hidden />
              Account set
            </p>
            <p className="mt-2 truncate text-lg font-black tracking-tight">
              {profile.payout.accountName}
            </p>
            <p className="mt-0.5 truncate text-sm text-zinc-300">
              {profile.payout.bankName}
              {profile.payout.accountNumber
                ? ` · ···· ${profile.payout.accountNumber.slice(-4)}`
                : ""}
            </p>
          </div>

          <p className="mt-3 text-sm text-zinc-400">
            Your share is transferred here weekly. Everything earned so far is
            on the earnings tab.
          </p>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/15 bg-white/6 px-5 py-3 font-bold transition hover:border-brass/50 hover:bg-white/10 active:translate-y-0.5"
          >
            <Pencil className="size-4" aria-hidden />
            Change the account
          </button>
        </>
      ) : (
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

        {profile.payout.connected && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="w-full rounded-2xl px-5 py-2 text-sm font-bold text-zinc-500 transition hover:text-zinc-200"
          >
            Cancel
          </button>
        )}

        {banks.length === 0 && (
          <p className="text-xs text-zinc-500">
            The bank list isn’t loading right now — try again shortly.
          </p>
        )}
      </div>
      )}
    </Panel>
  );
}
