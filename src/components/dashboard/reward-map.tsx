"use client";

import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

interface Tile {
  row_index: number;
  col_index: number;
  reward_id: string | null;
  is_revealed: boolean;
}

// Lazily loads the merchant-only reward map for one grid (RLS lets owners
// read their own tiles + rewards). Tapping a hidden-reward tile reveals which
// reward it holds in a popup.
export function RewardMap({
  gridId,
  rows,
  cols,
}: {
  gridId: string;
  rows: number;
  cols: number;
}) {
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [rewards, setRewards] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<
    { row: number; col: number; description: string } | null
  >(null);

  useEffect(() => {
    let ignore = false;
    const db = supabaseBrowser();
    Promise.all([
      db
        .from("tiles")
        .select("row_index, col_index, reward_id, is_revealed")
        .eq("grid_id", gridId),
      db.from("rewards").select("id, description").eq("grid_id", gridId),
    ]).then(([tilesRes, rewardsRes]) => {
      if (ignore) return;
      setTiles((tilesRes.data as Tile[]) ?? []);
      setRewards(
        new Map(
          ((rewardsRes.data as { id: string; description: string }[]) ?? []).map(
            (r) => [r.id, r.description]
          )
        )
      );
    });
    return () => {
      ignore = true;
    };
  }, [gridId]);

  if (!tiles) {
    return <p className="mt-3 animate-pulse text-xs text-zinc-400">Loading map…</p>;
  }
  const tileMap = new Map(tiles.map((t) => [`${t.row_index}:${t.col_index}`, t]));
  return (
    <div className="mt-3">
      <p className="text-xs text-zinc-500">
        Highlighted tiles hide rewards — only you can see this. Tap one to see
        which reward it holds. Positions shuffle after every redemption.
      </p>
      <div
        className="mt-2 grid max-w-sm gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const t = tileMap.get(`${row}:${col}`);
          const hasReward = !t?.is_revealed && !!t?.reward_id;
          const baseClass =
            "flex aspect-square items-center justify-center rounded " +
            (t?.is_revealed
              ? "bg-zinc-100 text-zinc-300 ring-1 ring-zinc-200"
              : t?.reward_id
                ? "bg-amber-100 text-amber-600 ring-1 ring-amber-300"
                : "bg-zinc-50 ring-1 ring-zinc-200");
          if (hasReward) {
            return (
              <button
                key={i}
                onClick={() =>
                  setSelected({
                    row,
                    col,
                    description:
                      rewards.get(t!.reward_id!) ?? "A reward is hidden here",
                  })
                }
                className={baseClass + " cursor-pointer transition hover:brightness-95"}
                aria-label={`Reward tile ${row + 1}, ${col + 1}`}
              >
                <Gift className="size-3" aria-hidden />
              </button>
            );
          }
          return (
            <div key={i} className={baseClass}>
              {t?.is_revealed ? <X className="size-3" aria-hidden /> : null}
            </div>
          );
        })}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-6 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="animate-pop-in card w-full max-w-xs p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <Gift className="size-6" aria-hidden />
            </div>
            <p className="mt-3 text-xs uppercase tracking-wide text-zinc-400">
              Tile {selected.row + 1}, {selected.col + 1} hides
            </p>
            <p className="mt-1 text-base font-semibold text-zinc-900">
              {selected.description}
            </p>
            <button
              onClick={() => setSelected(null)}
              className="btn-secondary mt-4 w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
