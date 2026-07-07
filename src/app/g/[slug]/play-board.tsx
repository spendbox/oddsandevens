"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Gift,
  Hourglass,
  PartyPopper,
  Puzzle,
  Star,
  Target,
  X,
} from "lucide-react";
import { EMAIL_REGEX } from "@/lib/constants";
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

// What the reveal popup shows after a tile is tapped (or points are traded).
type Reveal =
  | { kind: "hit"; description: string; code: string; expiresAt: string }
  | { kind: "miss"; points: number };

export default function PlayBoard({ slug }: { slug: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [grid, setGrid] = useState<PublicGridState | null>(null);
  const [me, setMe] = useState<CustomerState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
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
        setReveal({
          kind: "hit",
          description: result.description,
          code: result.code,
          expiresAt: result.expires_at,
        });
      } else if (result.result === "miss") {
        setLastMiss({ row, col });
        setReveal({ kind: "miss", points: result.loyalty_points });
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
    if (!email || busy || !grid) return;
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
        setReveal({
          kind: "hit",
          description: `${result.discount_percent}% loyalty discount`,
          code: result.code,
          expiresAt: result.expires_at,
        });
      } else {
        setFlash(
          `You need at least ${grid.pointsPerDiscount} points to redeem a discount.`
        );
      }
      const state = await fetchMe();
      if (state) setMe(state);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-sm p-6 text-center text-zinc-600">
          <Puzzle className="mx-auto size-8 text-zinc-300" aria-hidden />
          <p className="mt-3">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!grid) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <span className="animate-pulse">Loading board…</span>
      </main>
    );
  }

  // Everything below is tinted with the merchant's brand color via --brand.
  const brandStyle = { "--brand": grid.brandColor } as React.CSSProperties;

  if (!email) {
    return (
      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={brandStyle}
      >
        <form
          className="card animate-fade-up w-full max-w-sm p-6 sm:p-8"
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
          <BusinessMark grid={grid} size="lg" />
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            {grid.tagline ??
              "Tap a tile, win a reward."}{" "}
            Enter your email so we can send you your redemption code if you hit
            one.
          </p>
          <label className="mt-5 block">
            <span className="field-label">Email</span>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="input-field"
            />
          </label>
          {flash && <p className="alert-error mt-3">{flash}</p>}
          <button type="submit" className="btn-primary mt-5 w-full">
            Start hunting
          </button>
        </form>
      </main>
    );
  }

  const canRedeemPoints = (me?.loyaltyPoints ?? 0) >= grid.pointsPerDiscount;

  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8" style={brandStyle}>
      <div className="animate-fade-up mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <BusinessMark grid={grid} size="md" />
            <p className="mt-1 text-sm text-zinc-500">
              {grid.rewardsRemaining > 0
                ? `${grid.rewardsRemaining} reward${grid.rewardsRemaining === 1 ? "" : "s"} still hidden — good luck!`
                : "All rewards found — earn loyalty points until the next round!"}
            </p>
          </div>
          <div className="card flex items-center gap-1.5 px-4 py-2 text-sm text-zinc-700">
            <Star
              className="size-4 fill-amber-400 text-amber-400"
              aria-hidden
            />
            <span className="font-semibold">{me?.loyaltyPoints ?? 0}</span>
            point{(me?.loyaltyPoints ?? 0) === 1 ? "" : "s"}
            <span className="text-zinc-400">
              · {grid.pointsPerDiscount} pts = {grid.discountPercent}% off
            </span>
          </div>
        </header>

        {cooldownLeft && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <Hourglass className="size-4 shrink-0" aria-hidden />
            <span>
              You can play again in{" "}
              <strong className="font-semibold tabular-nums">{cooldownLeft}</strong>.
              Loyalty points and codes below stay yours.
            </span>
          </div>
        )}

        {flash && !cooldownLeft && (
          <div className="animate-pop-in card mt-4 px-4 py-3 text-sm text-zinc-700">
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
                  "flex aspect-square items-center justify-center rounded-lg transition " +
                  (state === true
                    ? "animate-tile-reveal bg-emerald-100 text-emerald-600 shadow-[0_0_14px_rgb(16_185_129/0.3)] ring-1 ring-emerald-300"
                    : state === false
                      ? (isMyMiss ? "animate-tile-reveal " : "") +
                        "bg-zinc-100 text-zinc-300 ring-1 ring-zinc-200"
                      : cooldownLeft
                        ? "cursor-not-allowed bg-zinc-100 ring-1 ring-zinc-200"
                        : "tile-live cursor-pointer hover:scale-105 active:scale-95")
                }
              >
                {state === true ? (
                  <Gift className="size-1/2 max-h-6 max-w-6" aria-hidden />
                ) : state === false ? (
                  <X className="size-1/2 max-h-5 max-w-5" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>

        {canRedeemPoints && (
          <button
            onClick={redeemPoints}
            disabled={busy}
            className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-semibold text-amber-950 shadow-sm transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Star className="size-5 fill-current" aria-hidden />
            Redeem {grid.pointsPerDiscount} points for {grid.discountPercent}% off
          </button>
        )}

        {(me?.codes.length ?? 0) > 0 && (
          <section className="mt-8">
            <h2 className="section-title">Your active codes</h2>
            <ul className="mt-3 space-y-2">
              {me!.codes.map((c) => (
                <li
                  key={c.code}
                  className="card flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-800">
                      {c.description}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Expires {new Date(c.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-lg border border-[color-mix(in_oklab,var(--brand),transparent_60%)] bg-[color-mix(in_oklab,var(--brand),transparent_92%)] px-3 py-1.5 font-mono text-lg tracking-widest text-[var(--brand)]">
                    {c.code}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 text-center text-xs text-zinc-400">
          Playing as {email} ·{" "}
          <button
            className="cursor-pointer underline transition hover:text-zinc-600"
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

      {reveal && (
        <RevealModal
          reveal={reveal}
          grid={grid}
          brandStyle={brandStyle}
          onClose={() => setReveal(null)}
        />
      )}
    </main>
  );
}

// Logo + business name, used in the header and the email gate.
function BusinessMark({
  grid,
  size,
}: {
  grid: PublicGridState;
  size: "md" | "lg";
}) {
  const img = size === "lg" ? "size-14" : "size-9";
  return (
    <div className="flex items-center gap-3">
      {grid.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- merchant-uploaded, host not known at build time
        <img
          src={grid.logoUrl}
          alt={`${grid.businessName} logo`}
          className={`${img} rounded-xl border border-zinc-200 object-cover`}
        />
      ) : (
        <div
          className={`${img} flex items-center justify-center rounded-xl text-white`}
          style={{ backgroundColor: "var(--brand)" }}
        >
          <Target className="size-1/2" aria-hidden />
        </div>
      )}
      <h1
        className={
          "font-bold tracking-tight text-zinc-900 " +
          (size === "lg" ? "text-xl" : "text-2xl")
        }
      >
        {grid.businessName}
      </h1>
    </div>
  );
}

// The tile-reveal popup: a branded celebration for hits, an encouraging
// points update for misses.
function RevealModal({
  reveal,
  grid,
  brandStyle,
  onClose,
}: {
  reveal: Reveal;
  grid: PublicGridState;
  brandStyle: React.CSSProperties;
  onClose: () => void;
}) {
  const countdown = useCountdown(reveal.kind === "hit" ? reveal.expiresAt : null);
  const isHit = reveal.kind === "hit";
  const pointsInCycle = isHit
    ? 0
    : reveal.points % grid.pointsPerDiscount || // partial progress…
      (reveal.points > 0 ? grid.pointsPerDiscount : 0); // …or a full, redeemable cycle

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-6 backdrop-blur-sm"
      style={brandStyle}
      onClick={onClose}
    >
      <div
        className="animate-pop-in card relative w-full max-w-sm overflow-hidden p-6 text-center sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Brand-colored halo behind the icon */}
        <div className="relative mx-auto flex size-20 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              backgroundColor: "color-mix(in oklab, var(--brand), transparent 85%)",
              animation: "burst-ring 0.9s ease-out 0.15s both",
            }}
          />
          <div
            className="animate-bounce-soft relative flex size-16 items-center justify-center rounded-2xl text-white shadow-lg"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {isHit ? (
              <PartyPopper className="size-8" aria-hidden />
            ) : (
              <Star className="size-8 fill-current" aria-hidden />
            )}
          </div>
        </div>

        <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">
          {isHit ? "You won!" : "+1 loyalty point"}
        </h2>

        {isHit ? (
          <>
            <p className="mt-1 font-medium" style={{ color: "var(--brand)" }}>
              {reveal.description}
            </p>
            <p className="mt-5 text-xs uppercase tracking-[0.14em] text-zinc-400">
              Show this code to staff
            </p>
            <p
              className="mt-2 rounded-xl py-3.5 font-mono text-3xl tracking-[0.3em]"
              style={{
                color: "var(--brand)",
                backgroundColor:
                  "color-mix(in oklab, var(--brand), transparent 93%)",
                border:
                  "1px solid color-mix(in oklab, var(--brand), transparent 70%)",
              }}
            >
              {reveal.code}
            </p>
            <p className="mt-4 text-sm text-zinc-500">
              {countdown ? (
                <>
                  Expires in{" "}
                  <strong className="font-semibold text-amber-600 tabular-nums">
                    {countdown}
                  </strong>
                </>
              ) : (
                "This code has expired."
              )}
            </p>
            <p className="mt-1 text-xs text-zinc-400">We also emailed it to you.</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              No reward under that tile, but you&apos;re{" "}
              {reveal.points >= grid.pointsPerDiscount
                ? "ready to redeem a discount!"
                : `${grid.pointsPerDiscount - pointsInCycle} point${grid.pointsPerDiscount - pointsInCycle === 1 ? "" : "s"} from ${grid.discountPercent}% off.`}
            </p>
            {/* Progress dots toward the next discount */}
            <div className="mt-5 flex items-center justify-center gap-2">
              {Array.from({ length: grid.pointsPerDiscount }, (_, i) => (
                <span
                  key={i}
                  className="size-3 rounded-full transition"
                  style={{
                    backgroundColor:
                      i < pointsInCycle
                        ? "var(--brand)"
                        : "color-mix(in oklab, var(--brand), transparent 85%)",
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {reveal.points} point{reveal.points === 1 ? "" : "s"} total ·{" "}
              {grid.pointsPerDiscount} pts = {grid.discountPercent}% off
            </p>
          </>
        )}

        <button onClick={onClose} className="btn-primary mt-6 w-full">
          {isHit ? "Done" : "Keep hunting next time"}
        </button>
      </div>
    </div>
  );
}
