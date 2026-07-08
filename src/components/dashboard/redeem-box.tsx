"use client";

import { useState } from "react";
import { BadgePercent, Gift, RotateCcw, Ticket } from "lucide-react";
import type {
  LoyaltyRedeemResult,
  RedeemResult,
  StaffLookupResult,
} from "@/lib/types";
import { formatEta } from "./shared";

// Only successful lookups are kept in state; errors become flash messages.
type StaffLookupFound = Extract<StaffLookupResult, { result: "found" }>;

// Staff redemption in two steps: look the code up first (the customer's
// cycling loyalty code or a one-time reward code), show what it is, then
// confirm. The code is the credential — there's no lookup by customer email.
export function RedeemBox({ onRedeemed }: { onRedeemed: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<StaffLookupFound | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setCode("");
    setLookup(null);
    setMessage(null);
  }

  async function doLookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setLookup(null);
    const res = await fetch("/api/merchant/redeem/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = (await res.json().catch(() => null)) as StaffLookupResult | null;
    setBusy(false);
    if (body?.result === "found") {
      setLookup(body);
      return;
    }
    setOk(false);
    setMessage("Code not found for your business.");
  }

  async function confirm(kind: "loyalty" | "code") {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/merchant/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, code }),
    });
    const body = (await res.json().catch(() => null)) as
      | LoyaltyRedeemResult
      | RedeemResult
      | null;
    setBusy(false);

    if (body?.result === "loyalty_redeemed") {
      setOk(true);
      setMessage(
        `Give ${body.customer_email} ${body.discount_percent}% off. ` +
          `${body.points_remaining} points left — their loyalty code has cycled to a new one.`
      );
      reset();
      await onRedeemed();
      return;
    }
    if (body?.result === "redeemed") {
      setOk(true);
      setMessage(`Redeemed: ${body.description} (customer: ${body.customer_email})`);
      reset();
      // Tile rewards get reshuffled server-side on redemption; refresh the map.
      await onRedeemed();
      return;
    }

    setOk(false);
    const reason =
      body && "error" in body
        ? {
            code_not_found: "Code not found for your business.",
            already_redeemed: "That code was already redeemed.",
            expired: "That code has expired.",
            insufficient_points: "Not enough points yet.",
            merchant_not_found: "Couldn't redeem that code.",
          }[body.error]
        : null;
    setMessage(reason ?? "Couldn't redeem that code.");
  }

  return (
    <div className="card h-full p-4 sm:p-5">
      <h2 className="section-title">
        <Ticket className="size-3.5" aria-hidden />
        Redeem a customer code
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
        Type the code the customer shows you — their loyalty code or a reward
        code they won.
      </p>

      <form onSubmit={doLookup} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setLookup(null);
          }}
          placeholder="K7M2XQ"
          maxLength={6}
          className="input-field w-full text-center font-mono text-lg tracking-[0.25em] sm:w-44"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="btn-primary grow px-4 py-2 sm:grow-0"
          >
            {busy && !lookup ? "Checking…" : "Look up"}
          </button>
          {lookup && (
            <button
              type="button"
              onClick={reset}
              className="btn-ghost px-3 py-2 text-sm"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Clear
            </button>
          )}
        </div>
      </form>

      {lookup?.kind === "loyalty" && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
            <BadgePercent className="size-4 shrink-0 text-emerald-600" aria-hidden />
            <span className="break-all">Loyalty code · {lookup.customer_email}</span>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            {lookup.points} point{lookup.points === 1 ? "" : "s"} (needs{" "}
            {lookup.points_needed} for {lookup.discount_percent}% off)
            {lookup.points_expire_at && (
              <span className="text-zinc-400">
                {" "}
                · points expire {formatEta(lookup.points_expire_at)}
              </span>
            )}
          </p>
          {lookup.eligible ? (
            <button
              onClick={() => confirm("loyalty")}
              disabled={busy}
              className="btn-primary mt-3 w-full px-4 py-2 text-sm sm:w-auto"
            >
              {busy
                ? "Redeeming…"
                : `Redeem ${lookup.points_needed} points for ${lookup.discount_percent}% off`}
            </button>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Not enough points yet —{" "}
              {lookup.points_needed - lookup.points} more to go.
            </p>
          )}
        </div>
      )}

      {lookup?.kind === "code" && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
            <Gift className="size-4 shrink-0 text-violet-600" aria-hidden />
            <span className="break-all">Reward code · {lookup.customer_email}</span>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            {lookup.description}
            <span className="text-zinc-400">
              {" "}
              · expires {formatEta(lookup.expires_at)}
            </span>
          </p>
          {lookup.status === "unredeemed" ? (
            <button
              onClick={() => confirm("code")}
              disabled={busy}
              className="btn-primary mt-3 w-full px-4 py-2 text-sm sm:w-auto"
            >
              {busy ? "Redeeming…" : "Redeem"}
            </button>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              This code is {lookup.status}.
            </p>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-3 ${ok ? "alert-success" : "alert-error"}`}>{message}</p>
      )}
    </div>
  );
}
