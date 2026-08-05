"use client";

// Contributor money, and the week's work of sending it.
//
// A power-up or a life bought against somebody's box used to split itself at
// settlement, against their own Paystack subaccount, so this screen was for
// the exceptions and a healthy row read zero. Payouts are made by hand now, so
// every row here is real: whoever is doing the transfers works down this list
// once a week, and ticking one off records it and emails the contributor.
//
// The ledger is the record, not a running balance this screen keeps — owed is
// earned minus sent, recomputed in SQL every time it is asked. That is what
// makes recording a payout late, twice or partially harmless.

import { useCallback, useEffect, useState } from "react";
import { Banknote, Check, Landmark } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";
import { KOBO } from "@/lib/constants";

interface Payout {
  contributorId: string;
  name: string;
  handle: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  earnedKobo: number;
  paidKobo: number;
  owedKobo: number;
  lastPaidAt: string | null;
}

export function PayoutsPanel() {
  const [rows, setRows] = useState<Payout[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/payouts", { cache: "no-store" });
    if (res.ok) setRows(((await res.json()) as { payouts: Payout[] }).payouts);
    setReady(true);
  }, []);

  useEffect(() => {
    // Wrapped rather than called straight: the lint rule reads a bare `void
    // load()` in an effect body as a synchronous setState, and the promise
    // boundary is what tells it — correctly — that nothing is set until the
    // fetch resolves.
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const owing = rows.filter((r) => r.owedKobo > 0);
  const total = owing.reduce((sum, r) => sum + r.owedKobo, 0);

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Landmark className="size-4" aria-hidden />
        Contributor payouts {owing.length > 0 && `(${owing.length})`}
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Contributors are told payouts go out <strong className="text-zinc-300">every week</strong>,
        and every naira of it is transferred by hand. Ticking one off records
        the transfer, emails them, and updates their dashboard.
        {total > 0 && (
          <>
            {" "}
            <strong className="text-brass">{formatNaira(total)}</strong> outstanding
            in total.
          </>
        )}
      </p>

      {!ready ? (
        <p className="py-4 text-center text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">
          Nobody has earned anything yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <PayoutRow key={row.contributorId} row={row} onPaid={() => void load()} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PayoutRow({ row, onPaid }: { row: Payout; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  // Pre-filled with the whole balance, which is what gets sent almost every
  // time. A partial transfer is possible and has to be typed, which is the
  // right way round.
  const owed = Math.round(row.owedKobo / KOBO);

  async function record() {
    const naira = Math.trunc(Number(amount || owed));
    if (!Number.isFinite(naira) || naira <= 0) return;
    setBusy(true);
    await fetch("/api/admin/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contributorId: row.contributorId,
        amountKobo: naira * KOBO,
        note,
      }),
    });
    setBusy(false);
    setOpen(false);
    setAmount("");
    setNote("");
    onPaid();
  }

  return (
    <li className="rounded-xl bg-white/5 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-200">
            {row.name}
            <span className="ml-2 text-xs font-normal text-zinc-500">@{row.handle}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {row.accountNumber
              ? `${row.accountName} · ${row.bankName} · ${row.accountNumber}`
              : "No bank details yet — they have to add them first."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span
            className={
              "block font-mono font-bold " +
              (row.owedKobo > 0 ? "text-brass" : "text-zinc-500")
            }
          >
            {formatNaira(row.owedKobo)}
          </span>
          <span className="block text-[11px] text-zinc-600">
            {formatNaira(row.earnedKobo)} earned · {formatNaira(row.paidKobo)} sent
          </span>
        </div>
      </div>

      {row.owedKobo > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold transition hover:border-brass/40"
        >
          <Banknote className="size-3.5" aria-hidden />
          Record a transfer
        </button>
      )}

      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative">
            <span className="absolute inset-y-0 left-2.5 flex items-center text-xs text-zinc-500">
              ₦
            </span>
            <input
              inputMode="numeric"
              value={amount}
              placeholder={String(owed)}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              className="w-32 rounded-lg border border-white/10 bg-black/30 py-1.5 pl-6 pr-2 font-mono text-xs"
            />
          </div>
          <input
            value={note}
            placeholder="Transfer reference"
            onChange={(e) => setNote(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void record()}
            className="flex items-center gap-1.5 rounded-lg border border-mark-green/40 bg-mark-green/10 px-3 py-1.5 text-xs font-semibold text-mark-green transition hover:border-mark-green disabled:opacity-50"
          >
            <Check className="size-3.5" aria-hidden />
            {busy ? "Saving…" : "Sent"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      )}

      {row.lastPaidAt && (
        <p className="mt-1 text-[11px] text-zinc-600">
          Last sent {new Date(row.lastPaidAt).toLocaleDateString()}
        </p>
      )}
    </li>
  );
}
