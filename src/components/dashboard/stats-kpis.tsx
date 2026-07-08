"use client";

import {
  BadgeCheck,
  Gift,
  Play,
  Star,
  Ticket,
  Users,
} from "lucide-react";
import type { MerchantStats } from "@/lib/types";

// The full KPI grid, shown inside the "View all stats" popup.
export function StatsKpis({ stats }: { stats: MerchantStats | null }) {
  if (!stats) return null;

  const tiles = [
    {
      label: "Customers",
      value: stats.totalCustomers,
      icon: Users,
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Total plays",
      value: stats.totalPlays,
      icon: Play,
      accent: "text-sky-600 bg-sky-50",
    },
    {
      label: "Rewards won",
      value: stats.rewardsUnlocked,
      icon: Gift,
      accent: "text-violet-600 bg-violet-50",
    },
    {
      label: "Redemptions",
      value: stats.redemptions,
      sub:
        stats.redemptionsLast30d > 0
          ? `${stats.redemptionsLast30d} in last 30 days`
          : `${Math.round(stats.redemptionRate * 100)}% of codes redeemed`,
      icon: BadgeCheck,
      accent: "text-amber-600 bg-amber-50",
    },
    {
      label: "Active codes",
      value: stats.activeCodes,
      icon: Ticket,
      accent: "text-rose-600 bg-rose-50",
    },
    {
      label: "Points in play",
      value: stats.pointsOutstanding,
      icon: Star,
      accent: "text-yellow-600 bg-yellow-50",
    },
  ];

  return (
    <section aria-label="Business stats">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(({ label, value, sub, icon: Icon, accent }) => (
          <div key={label} className="card flex flex-col gap-2 p-4">
            <span
              className={`flex size-8 items-center justify-center rounded-lg ${accent}`}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900">
                {value.toLocaleString()}
              </p>
              <p className="text-xs font-medium text-zinc-500">{label}</p>
              {sub && <p className="mt-0.5 text-[11px] text-zinc-400">{sub}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
