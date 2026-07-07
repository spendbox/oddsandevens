"use client";

import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Lazily loads the merchant-only reward map for one grid (RLS lets owners
// read their own tiles).
export function RewardMap({
  gridId,
  rows,
  cols,
}: {
  gridId: string;
  rows: number;
  cols: number;
}) {
  const [tiles, setTiles] = useState<
    { row_index: number; col_index: number; reward_id: string | null; is_revealed: boolean }[] | null
  >(null);

  useEffect(() => {
    let ignore = false;
    supabaseBrowser()
      .from("tiles")
      .select("row_index, col_index, reward_id, is_revealed")
      .eq("grid_id", gridId)
      .then(({ data }) => {
        if (!ignore) setTiles(data ?? []);
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
        Highlighted tiles hide rewards — only you can see this. Positions
        shuffle every time a reward is redeemed.
      </p>
      <div
        className="mt-2 grid max-w-sm gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const t = tileMap.get(`${Math.floor(i / cols)}:${i % cols}`);
          return (
            <div
              key={i}
              className={
                "flex aspect-square items-center justify-center rounded " +
                (t?.is_revealed
                  ? "bg-zinc-100 text-zinc-300 ring-1 ring-zinc-200"
                  : t?.reward_id
                    ? "bg-amber-100 text-amber-600 ring-1 ring-amber-300"
                    : "bg-zinc-50 ring-1 ring-zinc-200")
              }
            >
              {t?.is_revealed ? (
                <X className="size-3" aria-hidden />
              ) : t?.reward_id ? (
                <Gift className="size-3" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
