"use client";

import { useState } from "react";
import { BarChart3, Play, Users } from "lucide-react";
import type { MerchantStats } from "@/lib/types";
import { StatsKpis } from "./stats-kpis";
import { Modal } from "@/components/ui/modal";

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
            <p className="text-xs font-medium text-zinc-500">Total plays</p>
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
        <Modal
          title="All stats"
          icon={<BarChart3 className="size-5 text-emerald-600" aria-hidden />}
          width="lg"
          onClose={() => setOpen(false)}
        >
          <StatsKpis stats={stats} />
        </Modal>
      )}
    </>
  );
}
