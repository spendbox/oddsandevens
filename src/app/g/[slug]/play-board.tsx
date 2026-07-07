"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DISCOUNT_PERCENT,
  EMAIL_REGEX,
  POINTS_PER_DISCOUNT,
} from "@/lib/constants";
import type { CustomerState, PlayResult, PublicGridState } from "@/lib/types";

const EMAIL_STORAGE_KEY = "tilehunt_email";

function useCountdown(target: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface HitInfo {
  description: string;
  code: string;
  expiresAt: string;
}

export default function PlayBoard({ slug }: { slug: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [grid, setGrid] = useState<PublicGridState | null>(null);
  const [me, setMe] = useState<CustomerState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState<HitInfo | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [lastMiss, setLastMiss] = useState<{ row: number; col: number } | null>(null);

  // Fetchers are pure (no setState) so effects can apply their results in
  // async callbacks — required by the react-hooks/set-state-in-effect rule.
  const fetchGrid = useCallback(async (): Promise<
    { grid: PublicGridState } | { error: string }
  > => {
    const res = await fetch(`/api/play/${slug}`);
    if (!res.ok) {
      return {
        error:
          res.status === 404
            ? "This TileHunt board doesn't exist or has no active grid."
            : "Couldn't load the board. Try again shortly.",
      };
    }
    return { grid: (await res.json()) as PublicGridState };
  }, [slug]);

  const fetchMe = useCallback(async (): Promise<CustomerState | null> => {
    if (!email) return null;
    const res = await fetch(
      `/api/play/${slug}/me?email=${encodeURIComponent(email)}`
    );
    return res.ok ? ((await res.json()) as CustomerState) : null;
  }, [slug, email]);

  useEffect(() => {
    let ignore = false;
    fetchGrid().then((r) => {
      if (ignore) return;
      const stored = window.localStorage.getItem(EMAIL_STORAGE_KEY);
      if (stored && EMAIL_REGEX.test(stored)) setEmail(stored);
      if ("error" in r) setLoadError(r.error);
      else setGrid(r.grid);
    });
    return () => {
      ignore = true;
    };
  }, [fetchGrid]);

  useEffect(() => {
    let ignore = false;
    fetchMe().then((state) => {
      if (!ignore && state) setMe(state);
    });
    return () => {
      ignore = true;
    };
  }, [fetchMe]);

  const refreshAll = useCallback(async () => {
    const [g, state] = await Promise.all([fetchGrid(), fetchMe()]);
    if ("grid" in g) setGrid(g.grid);
    if (state) setMe(state);
  }, [fetchGrid, fetchMe]);

  const cooldownLeft = useCountdown(me?.cooldownUntil ?? null);
  const revealedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const t of grid?.revealed ?? []) map.set(`${t.row}:${t.col}`, t.hit);
    return map;
  }, [grid]);

  async function clickTile(row: number, col: number) {
    if (!email || busy || cooldownLeft) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/play/${slug}/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, row, col }),
      });
      const result = (await res.json()) as PlayResult;
      if (result.result === "hit") {
        setHit({
          description: result.description,
          code: result.code,
          expiresAt: result.expires_at,
        });
      } else if (result.result === "miss") {
        setLastMiss({ row, col });
        setFlash(
          `No reward this time — but you earned a loyalty point! You now have ${result.loyalty_points} point${result.loyalty_points === 1 ? "" : "s"}.`
        );
      } else if (result.result === "cooldown") {
        setFlash("You've already played recently. Come back when the timer ends!");
      } else if (result.error === "tile_taken") {
        setFlash("Someone got to that tile first — pick another one!");
      } else {
        setFlash("Something went wrong. Refresh and try again.");
      }
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function redeemPoints() {
    if (!email || busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/play/${slug}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (result.result === "discount_issued") {
        setHit({
          description: `${result.discount_percent}% loyalty discount`,
          code: result.code,
          expiresAt: result.expires_at,
        });
      } else {
        setFlash("You need at least 3 points to redeem a discount.");
      }
      const state = await fetchMe();
      if (state) setMe(state);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-center text-zinc-300">
        {loadError}
      </main>
    );
  }

  if (!grid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading board…
      </main>
    );
  }

  if (!email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
        <form
          className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 shadow-xl ring-1 ring-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            const value = emailInput.trim().toLowerCase();
            if (!EMAIL_REGEX.test(value)) {
              setFlash("Enter a valid email address.");
              return;
            }
            window.localStorage.setItem(EMAIL_STORAGE_KEY, value);
            setEmail(value);
            setFlash(null);
          }}
        >
          <h1 className="text-xl font-bold text-white">
            🎯 {grid.businessName}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Tap a tile, win a reward. Enter your email so we can send you your
            redemption code if you hit one.
          </p>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="mt-4 w-full rounded-lg bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
          />
          {flash && <p className="mt-2 text-sm text-rose-400">{flash}</p>}
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400"
          >
            Start hunting
          </button>
        </form>
      </main>
    );
  }

  const canRedeemPoints = (me?.loyaltyPoints ?? 0) >= POINTS_PER_DISCOUNT;

  return (
    <main className="min-h-screen bg-zinc-950 p-4 pb-16 text-white sm:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">🎯 {grid.businessName}</h1>
            <p className="text-sm text-zinc-400">
              {grid.rewardsRemaining > 0
                ? `${grid.rewardsRemaining} reward${grid.rewardsRemaining === 1 ? "" : "s"} still hidden — good luck!`
                : "All rewards found — earn loyalty points until the next round!"}
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900 px-4 py-2 text-sm ring-1 ring-zinc-800">
            ⭐ {me?.loyaltyPoints ?? 0} point{(me?.loyaltyPoints ?? 0) === 1 ? "" : "s"}
            <span className="text-zinc-500"> · {POINTS_PER_DISCOUNT} pts = {DISCOUNT_PERCENT}% off</span>
          </div>
        </header>

        {cooldownLeft && (
          <div className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300 ring-1 ring-amber-500/30">
            ⏳ You can play again in <strong>{cooldownLeft}</strong>. Loyalty
            points and codes below stay yours.
          </div>
        )}

        {flash && !cooldownLeft && (
          <div className="mt-4 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-zinc-200 ring-1 ring-zinc-700">
            {flash}
          </div>
        )}

        <div
          className="mt-6 grid gap-1.5 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: grid.rows * grid.cols }, (_, i) => {
            const row = Math.floor(i / grid.cols);
            const col = i % grid.cols;
            const state = revealedMap.get(`${row}:${col}`);
            const isRevealed = state !== undefined;
            const isMyMiss = lastMiss?.row === row && lastMiss?.col === col;
            return (
              <button
                key={i}
                disabled={isRevealed || busy || !!cooldownLeft}
                onClick={() => clickTile(row, col)}
                aria-label={`Tile ${row + 1}, ${col + 1}${isRevealed ? " (already revealed)" : ""}`}
                className={
                  "aspect-square rounded-lg text-lg transition sm:text-xl " +
                  (state === true
                    ? "bg-emerald-500/20 ring-1 ring-emerald-500/40"
                    : state === false
                      ? "bg-zinc-900 ring-1 ring-zinc-800 " +
                        (isMyMiss ? "text-zinc-400" : "text-zinc-600")
                      : cooldownLeft
                        ? "cursor-not-allowed bg-zinc-800/60 ring-1 ring-zinc-700/50"
                        : "cursor-pointer bg-gradient-to-br from-emerald-600 to-teal-700 shadow hover:scale-105 hover:from-emerald-500 hover:to-teal-600 active:scale-95")
                }
              >
                {state === true ? "🎁" : state === false ? "✕" : ""}
              </button>
            );
          })}
        </div>

        {canRedeemPoints && (
          <button
            onClick={redeemPoints}
            disabled={busy}
            className="mt-6 w-full rounded-xl bg-amber-500 px-4 py-3 font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-50"
          >
            ⭐ Redeem {POINTS_PER_DISCOUNT} points for {DISCOUNT_PERCENT}% off
          </button>
        )}

        {(me?.codes.length ?? 0) > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Your active codes
            </h2>
            <ul className="mt-2 space-y-2">
              {me!.codes.map((c) => (
                <li
                  key={c.code}
                  className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 ring-1 ring-zinc-800"
                >
                  <div>
                    <p className="font-medium">{c.description}</p>
                    <p className="text-xs text-zinc-500">
                      Expires {new Date(c.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-lg bg-zinc-800 px-3 py-1 font-mono text-lg tracking-widest text-emerald-400">
                    {c.code}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-zinc-600">
          Playing as {email} ·{" "}
          <button
            className="underline hover:text-zinc-400"
            onClick={() => {
              window.localStorage.removeItem(EMAIL_STORAGE_KEY);
              setEmail(null);
              setMe(null);
            }}
          >
            switch email
          </button>
        </footer>
      </div>

      {hit && <HitModal hit={hit} onClose={() => setHit(null)} />}
    </main>
  );
}

function HitModal({ hit, onClose }: { hit: HitInfo; onClose: () => void }) {
  const countdown = useCountdown(hit.expiresAt);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 text-center shadow-2xl ring-1 ring-emerald-500/40">
        <div className="text-5xl">🎉</div>
        <h2 className="mt-3 text-xl font-bold text-white">You won!</h2>
        <p className="mt-1 text-emerald-300">{hit.description}</p>
        <p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">
          Show this code to staff
        </p>
        <p className="mt-1 rounded-xl bg-zinc-800 py-3 font-mono text-3xl tracking-[0.3em] text-emerald-400">
          {hit.code}
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          {countdown ? (
            <>
              ⏳ Expires in <strong className="text-amber-300">{countdown}</strong>
            </>
          ) : (
            "This code has expired."
          )}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          We also emailed it to you.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Done
        </button>
      </div>
    </div>
  );
}
