"use client";

import { useState } from "react";
import { Coins, Crown, Gauge, Plus, Sparkles, Zap } from "lucide-react";
import {
  TOPUP_MAX_PLAYS,
  TOPUP_MIN_PLAYS,
  type SubscriptionTier,
} from "@/lib/constants";
import type { MerchantPlan } from "@/lib/types";
import { formatDate } from "./shared";

function naira(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString()}`;
}

// Fraction of the annual base allowance still available (0..1), for the bar.
function baseFraction(plan: MerchantPlan): number {
  if (plan.baseAllowance <= 0) return 0;
  return Math.max(0, Math.min(1, plan.baseRemaining / plan.baseAllowance));
}

// Compact home-page widget: plays left + one-tap routes into the Plans tab.
// The "Go Premium" button only shows on the free tier — no permanent upsell.
export function PlaysWidget({
  plan,
  onManage,
}: {
  plan: MerchantPlan | null;
  onManage: () => void;
}) {
  if (!plan) return null;
  const low = plan.playsRemaining <= Math.max(10, plan.baseAllowance * 0.1);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-title">
            <Gauge className="size-3.5" aria-hidden />
            Plays left this year
          </p>
          <p
            className={
              "mt-1 text-3xl font-bold tracking-tight " +
              (low ? "text-amber-600" : "text-zinc-900")
            }
          >
            {plan.playsRemaining.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {plan.baseRemaining.toLocaleString()} of{" "}
            {plan.baseAllowance.toLocaleString()} yearly
            {plan.topupPlays > 0 && (
              <> · +{plan.topupPlays.toLocaleString()} topped up</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {plan.tier === "free" && (
            <button
              onClick={onManage}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
            >
              <Crown className="size-4" aria-hidden />
              Go Premium
            </button>
          )}
          <button onClick={onManage} className="btn-secondary px-3.5 py-2 text-sm">
            <Plus className="size-4" aria-hidden />
            Top up
          </button>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${baseFraction(plan) * 100}%`,
            backgroundColor: low ? "#d97706" : "var(--brand)",
          }}
        />
      </div>
      {low && (
        <p className="mt-2 text-xs font-medium text-amber-600">
          Running low — top up or upgrade so your board keeps running.
        </p>
      )}
    </div>
  );
}

// The full Plans tab: allowance breakdown, a custom top-up purchase, and the
// premium upgrade / renewal.
export function PlansPanel({
  plan,
  tier,
  premiumExpiresAt,
}: {
  plan: MerchantPlan | null;
  tier: SubscriptionTier;
  premiumExpiresAt: string | null;
}) {
  const [qty, setQty] = useState(1000);
  const [busyTopup, setBusyTopup] = useState(false);
  const [busyPremium, setBusyPremium] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!plan) {
    return (
      <div className="card p-6 text-center text-zinc-400">Loading your plan…</div>
    );
  }

  const premium = tier === "premium";
  const lapsed = !premium && premiumExpiresAt !== null;
  const qtyValid =
    Number.isInteger(qty) && qty >= TOPUP_MIN_PLAYS && qty <= TOPUP_MAX_PLAYS;
  const topupCostKobo = qtyValid
    ? Math.max(1, Math.round((qty / 1000) * plan.topupPricePer1000Kobo))
    : 0;

  async function buyTopup() {
    setBusyTopup(true);
    setError(null);
    const res = await fetch("/api/merchant/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plays: qty }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.authorizationUrl) {
      window.location.href = body.authorizationUrl;
      return;
    }
    setBusyTopup(false);
    setError(
      body?.error === "payments_not_configured"
        ? "Payments aren't configured yet — set PAYSTACK_SECRET_KEY on the server."
        : body?.error === "invalid_quantity"
          ? `Choose between ${TOPUP_MIN_PLAYS.toLocaleString()} and ${TOPUP_MAX_PLAYS.toLocaleString()} plays.`
          : "Couldn't start the payment. Try again."
    );
  }

  async function goPremium() {
    setBusyPremium(true);
    setError(null);
    const res = await fetch("/api/merchant/upgrade", { method: "POST" });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.authorizationUrl) {
      window.location.href = body.authorizationUrl;
      return;
    }
    setBusyPremium(false);
    setError(
      body?.error === "payments_not_configured"
        ? "Payments aren't configured yet — set PAYSTACK_SECRET_KEY on the server."
        : "Couldn't start the payment. Try again."
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance summary */}
      <div className="card p-5">
        <p className="section-title">
          <Gauge className="size-3.5" aria-hidden />
          Your plays
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-4xl font-bold tracking-tight text-zinc-900">
              {plan.playsRemaining.toLocaleString()}
            </p>
            <p className="text-xs text-zinc-500">plays remaining</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-zinc-500">Yearly allowance</dt>
            <dd className="text-right font-medium text-zinc-800">
              {plan.baseRemaining.toLocaleString()} /{" "}
              {plan.baseAllowance.toLocaleString()}
            </dd>
            <dt className="text-zinc-500">Topped-up plays</dt>
            <dd className="text-right font-medium text-zinc-800">
              {plan.topupPlays.toLocaleString()}
            </dd>
            <dt className="text-zinc-500">Resets on</dt>
            <dd className="text-right font-medium text-zinc-800">
              {formatDate(plan.periodEnd)}
            </dd>
          </dl>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full"
            style={{
              width: `${baseFraction(plan) * 100}%`,
              backgroundColor: "var(--brand)",
            }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          A play is one tile tap by a customer. Your yearly allowance refills on
          the reset date; topped-up plays never expire.
        </p>
      </div>

      {/* Top up */}
      <div className="card p-5">
        <p className="section-title">
          <Coins className="size-3.5" aria-hidden />
          Buy more plays
        </p>
        <p className="mt-1.5 text-sm text-zinc-600">
          Top up any quantity — {naira(plan.topupPricePer1000Kobo)} per 1,000
          plays. No plan change required.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="field-label">Plays</span>
            <input
              type="number"
              min={TOPUP_MIN_PLAYS}
              max={TOPUP_MAX_PLAYS}
              step={1}
              value={Number.isNaN(qty) ? "" : qty}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) =>
                setQty(
                  e.target.value === "" ? NaN : Math.floor(Number(e.target.value))
                )
              }
              className="input-field w-40"
            />
          </label>
          <div className="pb-1">
            <p className="text-xs text-zinc-500">Cost</p>
            <p className="text-lg font-semibold text-zinc-900">
              {qtyValid ? naira(topupCostKobo) : "—"}
            </p>
          </div>
          <button
            onClick={buyTopup}
            disabled={busyTopup || !plan.paymentsEnabled || !qtyValid}
            className="btn-primary"
            title={plan.paymentsEnabled ? undefined : "Payments not configured"}
          >
            <Zap className="size-4" aria-hidden />
            {busyTopup ? "Redirecting…" : "Buy plays"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[1000, 5000, 10000].map((n) => (
            <button
              key={n}
              onClick={() => setQty(n)}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50"
            >
              {n.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Premium */}
      <div className="card border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
          <Crown className="size-4" aria-hidden />
          {premium
            ? "Premium plan"
            : lapsed
              ? "Your Premium plan has ended"
              : "Go Premium"}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {premium && premiumExpiresAt ? (
            <>
              Active until{" "}
              <span className="font-medium text-zinc-800">
                {formatDate(premiumExpiresAt)}
              </span>
              . A renewal adds a full year on top and refreshes your yearly plays.
            </>
          ) : (
            <>
              {plan.baseAllowance > 0 && (
                <>
                  <span className="font-medium text-zinc-800">
                    {plan.premiumPriceKobo > 0 && naira(plan.premiumPriceKobo)}/year
                  </span>{" "}
                  ·{" "}
                </>
              )}
              Up to 10 grids at once, 10 rewards per grid, custom puzzle images,
              interlocking tile shapes, longer reset cooldowns — and a much bigger
              yearly play allowance.
            </>
          )}
        </p>
        <ul className="mt-3 grid gap-1.5 text-sm text-zinc-600 sm:grid-cols-2">
          {[
            "10 active grids",
            "10 rewards per grid",
            "Custom puzzle images",
            "Interlocking tile shapes",
          ].map((f) => (
            <li key={f} className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-500" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
        {error && <p className="alert-error mt-3">{error}</p>}
        <button
          onClick={goPremium}
          disabled={busyPremium || !plan.paymentsEnabled}
          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          title={plan.paymentsEnabled ? undefined : "Payments not configured"}
        >
          <Crown className="size-4" aria-hidden />
          {busyPremium
            ? "Redirecting…"
            : premium
              ? `Renew${plan.premiumPriceKobo > 0 ? ` — ${naira(plan.premiumPriceKobo)}` : ""}`
              : `Upgrade${plan.premiumPriceKobo > 0 ? ` — ${naira(plan.premiumPriceKobo)}` : ""}`}
        </button>
      </div>
    </div>
  );
}
