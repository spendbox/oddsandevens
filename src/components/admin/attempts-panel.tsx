"use client";

// Who is closest, on every box at once.
//
// A contributor sees their own boxes and a player sees their own hunts; this
// is the only screen that sees the whole board. What it is for is knowing that
// something is about to be won *before* it is — a hunt at 94% on a ₦7,000,000
// safe is a payout to have the money ready for.

import { useCallback, useEffect, useState } from "react";
import { Search, Swords } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";
import { timeAgo } from "@/lib/when";

interface Hunt {
  huntId: string;
  boxSlug: string;
  boxTitle: string;
  boxKind: string;
  rewardKobo: number;
  passwordLength: number;
  playerEmail: string;
  bestPercent: number;
  attempts: number;
  lastAttemptAt: string | null;
  powerUpsBought: number;
  powerUpKobo: number;
}

type Sort = "best" | "attempts" | "recent" | "reward";

const SORTS: { id: Sort; label: string }[] = [
  { id: "best", label: "Closest" },
  { id: "attempts", label: "Most attempts" },
  { id: "recent", label: "Most recent" },
  { id: "reward", label: "Biggest prize" },
];

const CHIP = "rounded-lg px-3 py-1.5 text-xs font-bold transition active:translate-y-px";

export function AttemptsPanel() {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [sort, setSort] = useState<Sort>("best");
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState("");
  const [readAt, setReadAt] = useState(0);
  const [unmigrated, setUnmigrated] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ sort, live: live ? "1" : "0" });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/admin/attempts?${params}`, { cache: "no-store" });
    setUnmigrated(res.status === 503);
    if (res.ok) {
      setHunts(((await res.json()) as { hunts: Hunt[] }).hunts);
      setReadAt(Date.now());
    }
    setLoading(false);
  }, [sort, live, query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  if (unmigrated) {
    return (
      <div className="panel rounded-2xl px-4 py-8 text-center">
        <p className="font-black tracking-tight">This needs a migration.</p>
        <p className="mt-1 text-sm text-zinc-400">
          Run <code className="font-mono">npx supabase db push</code>.
        </p>
      </div>
    );
  }

  const closest = hunts[0];

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Swords className="size-4 text-sky" aria-hidden />
        Every hunt
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        The best score on every box, whoever holds it.{" "}
        {closest && sort === "best" && (
          <span className="text-zinc-400">
            Closest right now is {Math.round(closest.bestPercent)}% on{" "}
            {closest.boxTitle} — {formatNaira(closest.rewardKobo)}.
          </span>
        )}
      </p>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player's email…"
          className="field w-full py-2.5 pl-11 pr-4"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={`${CHIP} ${
              sort === s.id ? "bg-brass text-ink" : "bg-white/6 text-zinc-400 hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="grow" />
        <button
          type="button"
          onClick={() => setLive(!live)}
          className={`${CHIP} ${live ? "bg-mint/15 text-mint" : "bg-white/6 text-zinc-400"}`}
        >
          {live ? "Live boxes only" : "Every box"}
        </button>
      </div>

      {loading && hunts.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
      ) : hunts.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Nobody is hunting anything.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {hunts.map((hunt) => (
            <li key={hunt.huntId} className="rounded-2xl bg-black/25 p-3">
              <div className="flex items-center gap-3">
                {/* The score leads, because it is the only reason to look at
                    this screen. Everything else is context for it. */}
                <span
                  className={
                    "w-14 shrink-0 text-right font-mono text-xl font-black " +
                    (hunt.bestPercent >= 90
                      ? "text-berry"
                      : hunt.bestPercent >= 70
                        ? "text-brass"
                        : "text-zinc-300")
                  }
                >
                  {Math.round(hunt.bestPercent)}%
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {hunt.boxTitle}{" "}
                    <span className="font-normal text-zinc-500">
                      {formatNaira(hunt.rewardKobo)}
                      {hunt.boxKind === "promo" && (
                        <span className="ml-1 text-grape">promo</span>
                      )}
                    </span>
                  </span>
                  <span className="block truncate font-mono text-xs text-zinc-500">
                    {hunt.playerEmail}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-zinc-500">
                  <span className="block">{hunt.attempts.toLocaleString()} tries</span>
                  <span className="block">{timeAgo(hunt.lastAttemptAt, readAt)}</span>
                </span>
              </div>
              {hunt.powerUpsBought > 0 && (
                // A very high score reads differently when most of it was
                // bought, so the shelf spend sits next to it.
                <p className="mt-1.5 pl-[68px] text-[11px] text-grape">
                  {hunt.powerUpsBought} power-ups · {formatNaira(hunt.powerUpKobo)} spent on hints
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
