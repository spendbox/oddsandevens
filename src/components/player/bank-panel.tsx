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
import { BadgeCheck, Landmark, Pencil } from "lucide-react";
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
  "field px-4 py-3";

export function BankPanel() {
  const [bank, setBank] = useState<BankState | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /*
   * A saved account is a *card*, not a form.
   *
   * It used to be both at once: the confirmation sat above two empty inputs
   * and a button reading "Update", which reads as an account that has not been
   * saved yet — and left the one field somebody might fumble open at all
   * times. Editing is now a thing you ask for.
   */
  const [editing, setEditing] = useState(false);

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
      setBankCode("");
      setEditing(false);
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

      {bank?.connected && !editing ? (
        <>
          <div className="rounded-2xl border-2 border-mint/40 bg-mint/10 p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-mint">
              <BadgeCheck className="size-4 shrink-0" aria-hidden />
              Account set
            </p>
            <p className="mt-2 truncate text-lg font-black tracking-tight text-foreground">
              {bank.accountName}
            </p>
            <p className="mt-0.5 truncate text-sm text-zinc-300">
              {bank.bankName} · <span className="font-mono">···· {bank.accountLast4}</span>
            </p>
          </div>

          {saved && (
            <p className="text-sm font-semibold text-mint">Saved — {saved}.</p>
          )}

          <p className="text-sm text-zinc-400">
            Every reward you win goes here, within 24 hours of the crack.
          </p>

          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/15 bg-white/6 px-5 py-3 font-bold transition hover:border-brass/50 hover:bg-white/10 active:translate-y-0.5"
          >
            <Pencil className="size-4" aria-hidden />
            Change the account
          </button>
        </>
      ) : (
      <>
      <p className="text-sm text-zinc-400">
        {bank?.connected
          ? "Enter the new account. We check the number with your bank before anything is saved."
          : "Add an account now and any reward you win goes straight to it."}
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

        {bank?.connected && (
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
      </>
      )}
    </section>
  );
}
