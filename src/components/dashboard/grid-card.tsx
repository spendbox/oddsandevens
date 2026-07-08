"use client";

import { useState } from "react";
import {
  Archive,
  BarChart3,
  Hourglass,
  Play,
  Puzzle,
  Trash2,
} from "lucide-react";
import type { GridStats } from "@/lib/types";
import { formatEta } from "./shared";
import { RewardMap } from "./reward-map";

export function GridCard({
  grid,
  busy,
  onSetStatus,
  onDelete,
}: {
  grid: GridStats;
  busy: boolean;
  onSetStatus: (id: string, status: "active" | "archived") => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showMap, setShowMap] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const resting = grid.status === "active" && grid.completedAt !== null;
  const resetsAt = grid.completedAt
    ? new Date(
        new Date(grid.completedAt).getTime() + grid.resetDays * 86400_000
      ).toISOString()
    : null;

  return (
    <li className="rounded-xl border border-zinc-200 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        {grid.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- merchant/library image, host not known at build time
          <img
            src={grid.imageUrl}
            alt=""
            className="size-14 rounded-lg border border-zinc-200 object-cover"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400">
            <Puzzle className="size-6" aria-hidden />
          </div>
        )}
        <div className="min-w-0 grow">
          <p className="flex flex-wrap items-center gap-2 font-medium text-zinc-900">
            {grid.title ?? `${grid.rows}×${grid.cols} grid`}
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs font-medium " +
                (resting
                  ? "bg-sky-100 text-sky-700"
                  : grid.status === "active"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-zinc-100 text-zinc-500")
              }
            >
              {resting ? "resting" : grid.status}
            </span>
            {grid.cycle > 1 && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                round {grid.cycle}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            <span className="font-medium text-zinc-700">
              {grid.revealedCount.toLocaleString()}
            </span>{" "}
            tap{grid.revealedCount === 1 ? "" : "s"}
          </p>
          {resting && resetsAt && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-sky-700">
              <Hourglass className="size-3.5" aria-hidden />
              All rewards found — resets with fresh stock {formatEta(resetsAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats((s) => !s)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            <BarChart3 className="size-3.5" aria-hidden />
            Stats
          </button>
          <button
            onClick={() => setShowMap((s) => !s)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {showMap ? "Hide map" : "Map"}
          </button>
          {grid.status === "active" ? (
            <button
              onClick={() => onSetStatus(grid.id, "archived")}
              disabled={busy}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              <Archive className="size-3.5" aria-hidden />
              {busy ? "…" : "Archive"}
            </button>
          ) : (
            <button
              onClick={() => onSetStatus(grid.id, "active")}
              disabled={busy}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              <Play className="size-3.5" aria-hidden />
              {busy ? "…" : "Activate"}
            </button>
          )}
          <button
            onClick={() => onDelete(grid.id)}
            disabled={busy}
            className="btn-secondary px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
            aria-label="Delete grid"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {busy ? "…" : "Delete"}
          </button>
        </div>
      </div>
      {showStats && (
        <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 sm:grid-cols-4">
          {[
            { label: "Taps", value: grid.revealedCount.toLocaleString() },
            {
              label: "Tiles left",
              value: (grid.tileCount - grid.revealedCount).toLocaleString(),
            },
            { label: "Rounds", value: grid.cycle.toLocaleString() },
            {
              label: "Redeemed",
              value: `${grid.redeemedCount} of ${grid.unlockedCount}`,
            },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] uppercase tracking-wide text-zinc-400">
                {s.label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-zinc-800">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {showMap && <RewardMap gridId={grid.id} rows={grid.rows} cols={grid.cols} />}
    </li>
  );
}
