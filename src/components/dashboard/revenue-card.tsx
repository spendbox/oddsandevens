"use client";

// What the games have earned.
//
// Players get three plays a week for nothing; anyone who wants more can buy a
// block. That money is split — most of it goes to the business whose game was
// being played, the rest to us for running the thing. This card is the
// business's side of that, and it is deliberately blunt about the split rather
// than quoting a gross figure the business never receives.
//
// Zero is a normal reading, not an error: most weeks most boards sell nothing,
// because the free plays are enough. The card says so plainly rather than
// showing an empty state that looks like a fault.

import { Coins, TrendingUp } from "lucide-react";
import type { LifeRevenue } from "@/lib/types";
import { naira } from "./shared";

export function RevenueCard({ revenue }: { revenue: LifeRevenue | null }) {
  if (!revenue) return null;
  const businessShare = 100 - revenue.platformSharePercent;

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-title">
            <Coins className="size-3.5" aria-hidden />
            Earned from extra plays
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
            {naira(revenue.businessKobo)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            your {businessShare}% of {naira(revenue.grossKobo)} — Spendbox keeps{" "}
            {revenue.platformSharePercent}%
          </p>
        </div>
        {revenue.business30dKobo > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <TrendingUp className="size-3.5" aria-hidden />
            {naira(revenue.business30dKobo)} in 30 days
          </span>
        )}
      </div>

      {revenue.orders === 0 ? (
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-500">
          Nothing yet. Everyone gets three plays a week free, and that&apos;s
          usually enough — this is just what the people who want another go
          decide to pay for.
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Purchases", value: revenue.orders.toLocaleString() },
            { label: "Plays sold", value: revenue.livesSold.toLocaleString() },
            { label: "Gross", value: naira(revenue.grossKobo) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-zinc-50 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {stat.label}
              </dt>
              <dd className="text-base font-bold tabular-nums text-zinc-900">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
