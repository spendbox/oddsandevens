"use client";

// Where a reward goes.
//
// This used to be collected inside a claim, which meant winning twice meant
// typing an account number twice with no way to correct the first. The details
// belong to the player now: set them once, change them whenever, and every
// future claim pre-fills from them.
//
// Only the last four digits ever come back from the server. Nothing on this
// screen needs the whole number read aloud, and a page that prints somebody's
// account number is a page you have to be careful where you open.

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Landmark } from "lucide-react";
import { ACCOUNT_NUMBER_REGEX } from "@/lib/constants";
import type { Bank } from "@/lib/types";

interface BankState {
  bankCode: string | null;
  bankName: string | null;
  accountLast4: string | null;
  accountName: string | null;
  connected: boolean;
}

const INPUT =
  "w-full rounded-xl border-2 border-white/10 bg-black/25 px-4 py-3 text-foreground outline-none transition placeholder:text-zinc-500 focus:border-brass";

export function BankPanel() {
  const [bank, setBank] = useState<BankState | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/player/bank", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { bank: BankState; banks: Bank[] };
    setBank(body.bank);
    setBanks(body.banks ?? []);
  }, []);

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, [load]);

  async function save() {
    if (!bankCode || !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
      setError("Pick a bank and enter the 10-digit account number.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    const res = await fetch("/api/player/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankCode,
        bankName: banks.find((b) => b.code === bankCode)?.name,
        accountNumber,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      accountName?: string;
      error?: string;
    };
    setBusy(false);
    if (res.ok) {
      setAccountNumber("");
      setSaved(body.accountName ?? "Saved.");
      await load();
      return;
    }
    setError(
      body.error === "account_not_found"
        ? "That account number doesn't match the bank. Check both."
        : body.error === "payments_unavailable"
          ? "Payments aren't switched on yet."
          : "Couldn't save that. Try again in a moment."
    );
  }

  return (
    <section className="panel space-y-4 rounded-3xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Landmark className="size-4 text-brass" aria-hidden />
        Where your rewards go
      </h2>

      {bank?.connected && (
        <p className="flex items-start gap-2 rounded-2xl border-2 border-mint/40 bg-mint/10 px-3 py-2.5 text-sm font-semibold text-mint">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {bank.accountName} · {bank.bankName} ···· {bank.accountLast4}
          </span>
        </p>
      )}

      <p className="text-sm text-zinc-400">
        {bank?.connected
          ? "Change it below whenever you like. We check the number with your bank first."
          : "Add an account now and any reward you win goes straight to it — no forms at the moment you win."}
      </p>

      <div className="space-y-3">
        <select
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          className={INPUT}
        >
          <option value="">Choose your bank</option>
          {banks.map((b) => (
            <option key={b.code} value={b.code} className="text-zinc-900">
              {b.name}
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

        {error && <p className="text-sm font-semibold text-berry">{error}</p>}
        {saved && (
          <p className="text-sm font-semibold text-mint">Saved — {saved}.</p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-5 py-3.5 text-ink"
        >
          {busy ? "Checking with the bank…" : bank?.connected ? "Update" : "Save"}
        </button>

        {banks.length === 0 && (
          <p className="text-xs text-zinc-500">
            The bank list isn&apos;t loading right now — try again shortly.
          </p>
        )}
      </div>
    </section>
  );
}
