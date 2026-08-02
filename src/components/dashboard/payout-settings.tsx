"use client";

// Where the money goes.
//
// Players pay for extra plays and most of it is the business's. Without an
// account on file that share would sit in our Paystack balance until somebody
// moved it by hand — so this is asked for once, before the first game goes
// live, and then it settles itself forever.
//
// The account number is resolved with the bank before it's saved, and the name
// that comes back is shown. Nobody should be asked to double-check ten digits
// they typed; they should be shown whose account those digits reached.

import { useCallback, useEffect, useState } from "react";
import { Check, Landmark, Loader2, Pencil } from "lucide-react";

interface PayoutState {
  connected: boolean;
  bankName: string | null;
  accountNumberLast4: string | null;
  accountName: string | null;
  yourSharePercent: number;
  paymentsEnabled: boolean;
  banks: { name: string; code: string }[];
}

export function PayoutSettings({ onSaved }: { onSaved?: () => void }) {
  const [state, setState] = useState<PayoutState | null>(null);
  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    const res = await fetch("/api/merchant/payout");
    return res.ok ? ((await res.json()) as PayoutState) : null;
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchState().then((s) => {
      if (!ignore && s) setState(s);
    });
    return () => {
      ignore = true;
    };
  }, [fetchState]);

  // The name on the account, as soon as there are ten digits and a bank to
  // check them against. Nobody has to press anything for this.
  useEffect(() => {
    if (!/^\d{10}$/.test(accountNumber) || !bankCode) return;
    let ignore = false;
    const timer = window.setTimeout(() => {
      fetch("/api/merchant/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", bankCode, accountNumber }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (ignore) return;
          setResolvedName(body?.accountName ?? null);
          if (!body?.accountName) {
            setError("We couldn't find that account. Check the number and bank.");
          } else {
            setError(null);
          }
        });
    }, 400);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [accountNumber, bankCode]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "connect", bankCode, accountNumber }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(
        body?.error === "account_not_found"
          ? "That account number doesn't match the bank you picked."
          : body?.error === "payments_not_configured"
            ? "Payments aren't switched on yet. Try again shortly."
            : "We couldn't save that. Give it another go."
      );
      return;
    }
    const fresh = await fetchState();
    if (fresh) setState(fresh);
    setEditing(false);
    setResolvedName(null);
    setAccountNumber("");
    onSaved?.();
  };

  if (!state) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-zinc-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading your account…
      </p>
    );
  }

  if (state.connected && !editing) {
    return (
      <div>
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              Getting paid to {state.bankName}
            </p>
            <p className="mt-0.5 text-sm text-emerald-800">
              {state.accountName} · ••••{state.accountNumberLast4}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          When someone buys extra plays on your games, {state.yourSharePercent}%
          lands here automatically. You don&apos;t have to ask us for it.
        </p>
        <button
          onClick={() => setEditing(true)}
          className="btn-secondary mt-3"
        >
          <Pencil className="size-4" aria-hidden />
          Change account
        </button>
      </div>
    );
  }

  return (
    <div>
      {!state.connected && (
        <p className="text-sm text-zinc-600">
          Add the account you want your money paid into. Players can buy extra
          plays on your games, and {state.yourSharePercent}% of that is yours —
          it goes straight to your bank, nothing to claim.
        </p>
      )}

      <label className="mt-4 block">
        <span className="field-label">Your bank</span>
        <select
          value={bankCode}
          onChange={(e) => {
            setBankCode(e.target.value);
            setResolvedName(null);
          }}
          className="input-field"
        >
          <option value="">Pick your bank…</option>
          {state.banks.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="field-label">Account number</span>
        <input
          inputMode="numeric"
          value={accountNumber}
          onChange={(e) => {
            setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
            setResolvedName(null);
          }}
          placeholder="0123456789"
          className="input-field font-mono tracking-widest"
        />
      </label>

      {resolvedName && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
          <Check className="size-4 shrink-0" aria-hidden />
          {resolvedName}
        </p>
      )}

      {error && <p className="alert-error mt-3">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={connect}
          disabled={busy || !resolvedName}
          className="btn-primary"
          style={{ backgroundColor: "var(--brand)" }}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              <Landmark className="size-4" aria-hidden />
              {state.connected ? "Use this account" : "Connect account"}
            </>
          )}
        </button>
        {state.connected && (
          <button onClick={() => setEditing(false)} className="btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
