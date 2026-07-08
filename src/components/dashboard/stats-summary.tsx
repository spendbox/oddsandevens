"use client";

import { useState } from "react";
import { BarChart3, Play, Users, X } from "lucide-react";
import type { MerchantStats } from "@/lib/types";
import { StatsKpis } from "./stats-kpis";

// The home tab shows just the two headline numbers; everything else lives
// behind the "View all stats" popup.
export function StatsSummary({ stats }: { stats: MerchantStats | null }) {
  const [open, setOpen] = useState(false);
  if (!stats) return null;

  return (
    <>
      <section aria-label="Business stats" className="flex flex-wrap items-stretch gap-3">
        <div className="card flex min-w-32 grow items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Users className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900">
              {stats.totalCustomers.toLocaleString()}
            </p>
            <p className="text-xs font-medium text-zinc-500">Customers</p>
          </div>
        </div>
        <div className="card flex min-w-32 grow items-center gap-3 p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Play className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900">
              {stats.totalPlays.toLocaleString()}
            </p>
            <p className="text-xs font-medium text-zinc-500">Total taps</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="card flex min-w-32 grow cursor-pointer items-center justify-center gap-2 p-4 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          <BarChart3 className="size-4 text-zinc-400" aria-hidden />
          View all stats
        </button>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-pop-in card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
                <BarChart3 className="size-5 text-emerald-600" aria-hidden />
                All stats
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="btn-ghost"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-4">
              <StatsKpis stats={stats} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
