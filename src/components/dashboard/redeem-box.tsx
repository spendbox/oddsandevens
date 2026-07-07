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
// cycling loyalty code, their fixed reward code, or a legacy one-time code),
// show what it is, then confirm. The code is the credential — there's no
// lookup by customer email.
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

  async function confirm(payload: Record<string, string>) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/merchant/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      setCode("");
      setLookup(null);
      await onRedeemed();
      return;
    }
    if (body?.result === "redeemed") {
      setOk(true);
      setMessage(`Redeemed: ${body.description} (customer: ${body.customer_email})`);
      setCode("");
      setLookup(null);
      // Tile rewards get reshuffled server-side on redemption; refresh the map.
      await onRedeemed();
      return;
    }

    setOk(false);
    const reason =
      body && "error" in body
        ? {
            code_not_found: "Code not found for your business.",
            already_redeemed: "That reward was already redeemed.",
            expired: "That reward has expired.",
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
      <p className="mt-1.5 text-xs text-zinc-500">
        Type the code the customer shows you — their loyalty code, reward
        code, or an emailed one-time code.
      </p>

      <form onSubmit={doLookup} className="mt-3 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setLookup(null);
          }}
          placeholder="K7M2XQ"
          maxLength={6}
          className="input-field w-40 text-center font-mono text-lg tracking-[0.25em]"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="btn-primary px-4 py-2"
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
      </form>

      {lookup?.kind === "loyalty" && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
            <BadgePercent className="size-4 text-emerald-600" aria-hidden />
            Loyalty code · {lookup.customer_email}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
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
              onClick={() => confirm({ kind: "loyalty", code })}
              disabled={busy}
              className="btn-primary mt-3 px-4 py-2 text-sm"
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

      {lookup?.kind === "reward" && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
            <Gift className="size-4 text-violet-600" aria-hidden />
            Reward code · {lookup.customer_email}
          </p>
          {lookup.rewards.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              No unredeemed rewards right now.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {lookup.rewards.map((r) => (
                <li
                  key={r.unlocked_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800">
                      {r.description}
                    </p>
                    <p className="text-xs text-zinc-400">
                      expires {formatEta(r.expires_at)}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      confirm({ kind: "reward", unlockedId: r.unlocked_id })
                    }
                    disabled={busy}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    {busy ? "…" : "Redeem"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lookup?.kind === "legacy" && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-800">
            One-time code · {lookup.customer_email}
          </p>
          <p className="mt-1 text-sm text-zinc-600">{lookup.description}</p>
          {lookup.status === "unredeemed" ? (
            <button
              onClick={() => confirm({ kind: "legacy", code })}
              disabled={busy}
              className="btn-primary mt-3 px-4 py-2 text-sm"
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
