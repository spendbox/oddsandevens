"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { formatDate, isPremiumNow, type Merchant } from "./shared";

// Free & lapsed merchants see the yearly upsell; premium merchants see their
// expiry and a renew button (a renewal payment stacks a year on top).
export function PremiumCard({ merchant }: { merchant: Merchant }) {
  const [priceKobo, setPriceKobo] = useState<number | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const premium = isPremiumNow(merchant);
  const lapsed = !premium && merchant.premium_expires_at !== null;

  useEffect(() => {
    let ignore = false;
    fetch("/api/merchant/upgrade")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (ignore || !body) return;
        setPriceKobo(body.premiumPriceKobo);
        setPaymentsEnabled(body.paymentsEnabled);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/upgrade", { method: "POST" });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.authorizationUrl) {
      window.location.href = body.authorizationUrl;
      return;
    }
    setBusy(false);
    setError(
      body?.error === "payments_not_configured"
        ? "Payments aren't configured yet — set PAYSTACK_SECRET_KEY on the server."
        : "Couldn't start the payment. Try again."
    );
  }

  const price =
    priceKobo !== null ? `₦${(priceKobo / 100).toLocaleString()}/year` : null;

  return (
    <div className="card flex h-full flex-wrap items-center justify-between gap-4 border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 sm:p-5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
          <Crown className="size-4" aria-hidden />
          {premium
            ? "Premium plan"
            : lapsed
              ? "Your Premium plan has ended"
              : "Go Premium"}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {premium && merchant.premium_expires_at ? (
            <>
              Active until{" "}
              <span className="font-medium text-zinc-800">
                {formatDate(merchant.premium_expires_at)}
              </span>
              . Renew any time — a renewal adds a full year on top.
            </>
          ) : (
            "Run up to 10 grids at once, 10 rewards per grid, custom puzzle images, interlocking tile shapes, and reset cooldowns up to a year."
          )}
        </p>
        {error && <p className="alert-error mt-2">{error}</p>}
      </div>
      <button
        onClick={pay}
        disabled={busy || !paymentsEnabled}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        title={paymentsEnabled ? undefined : "Payments not configured"}
      >
        <Crown className="size-4" aria-hidden />
        {busy
          ? "Redirecting…"
          : premium
            ? price
              ? `Renew — ${price}`
              : "Renew"
            : price
              ? `Upgrade — ${price}`
              : "Upgrade"}
      </button>
    </div>
  );
}
