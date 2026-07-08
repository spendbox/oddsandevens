"use client";

import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import type { GridStats } from "@/lib/types";
import type { SubscriptionTier } from "@/lib/constants";
import { GridCard } from "./grid-card";

export function GridsManager({
  grids,
  tier,
  activeCount,
  maxActive,
  onNewGrid,
  onChanged,
}: {
  grids: GridStats[];
  tier: SubscriptionTier;
  activeCount: number;
  maxActive: number;
  onNewGrid: () => void;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(id: string, status: "active" | "archived") {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/merchant/grids/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "too_many_active_grids"
          ? `Your ${tier} tier allows ${maxActive} active grid${maxActive === 1 ? "" : "s"} — archive one first.`
          : "Couldn't update that grid."
      );
      return;
    }
    await onChanged();
  }

  async function deleteGrid(id: string) {
    if (
      !window.confirm(
        "Delete this grid permanently? Its tiles and rewards are removed. Codes customers already won stay redeemable."
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/merchant/grids/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      setError("Couldn't delete that grid.");
      return;
    }
    await onChanged();
  }

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">
          <Layers className="size-3.5" aria-hidden />
          Your grids · {activeCount}/{maxActive} active
        </h2>
        <button onClick={onNewGrid} className="btn-primary px-4 py-2 text-sm">
          <Plus className="size-4" aria-hidden />
          New grid
        </button>
      </div>
      {error && <p className="alert-error mt-3">{error}</p>}
      {grids.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          No grids yet — create your first one to go live.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {grids.map((g) => (
            <GridCard
              key={g.id}
              grid={g}
              busy={busyId === g.id}
              onSetStatus={setStatus}
              onDelete={deleteGrid}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
