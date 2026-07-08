"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgePercent,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Gift,
  Hourglass,
  Mail,
  MessageCircle,
  PartyPopper,
  Plus,
  Puzzle,
  RefreshCw,
  Star,
  Target,
  Ticket,
  X,
} from "lucide-react";
import { EMAIL_REGEX } from "@/lib/constants";
import type {
  CustomerState,
  PlayResult,
  PublicBoardState,
  PublicGrid,
} from "@/lib/types";
import {
  allEdgeCombos,
  curvedPathD,
  edgesFor,
  edgesKey,
  interlockSliceStyle,
  isOutTile,
  sharpClipPolygon,
} from "@/lib/tile-shapes";

const EMAIL_STORAGE_KEY = "tilehunt_email";
const WELCOME_STORAGE_PREFIX = "tilehunt_welcomed_";
const SPLASH_MS = 1600;

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
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Points about to lapse (under a day left) get the amber treatment.
function expiringSoon(iso: string): boolean {
  return new Date(iso).getTime() - Date.now() < 24 * 3_600_000;
}

// "3d 4h" / "5h" — coarse span for the points-expiry hint (no ticking).
function formatSpan(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h`;
  return `${Math.max(Math.ceil(ms / 60_000), 1)}m`;
}

// What the reveal popup shows after a tile is tapped.
type Reveal =
  | { kind: "hit"; description: string; code: string; expiresAt: string }
  | { kind: "miss"; points: number };

export default function PlayBoard({ slug }: { slug: string }) {
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [board, setBoard] = useState<PublicBoardState | null>(null);
  const [gridIndex, setGridIndex] = useState(0);
  const [me, setMe] = useState<CustomerState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [lastMiss, setLastMiss] = useState<{
    gridId: string;
    row: number;
    col: number;
  } | null>(null);
  // Splash: a single branded overlay that only starts once the board (and
  // with it the business logo) has arrived — no generic pre-splash.
  const [splashDone, setSplashDone] = useState(false);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!board) return;
    const id = setTimeout(() => setSplashLeaving(true), SPLASH_MS);
    const id2 = setTimeout(() => {
      setSplashDone(true);
      // Welcome popup: once per browser session per business, after the splash.
      if (!window.sessionStorage.getItem(WELCOME_STORAGE_PREFIX + slug)) {
        setShowWelcome(true);
      }
    }, SPLASH_MS + 500);
    return () => {
      clearTimeout(id);
      clearTimeout(id2);
    };
  }, [board, slug]);

  // Fetchers are pure (no setState) so effects can apply their results in
  // async callbacks — required by the react-hooks/set-state-in-effect rule.
  const fetchBoard = useCallback(async (): Promise<
    { board: PublicBoardState } | { error: string }
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
    return { board: (await res.json()) as PublicBoardState };
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
    fetchBoard().then((r) => {
      if (ignore) return;
      const stored = window.localStorage.getItem(EMAIL_STORAGE_KEY);
      if (stored && EMAIL_REGEX.test(stored)) setEmail(stored);
      if ("error" in r) setLoadError(r.error);
      else setBoard(r.board);
    });
    return () => {
      ignore = true;
    };
  }, [fetchBoard]);

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
    const [b, state] = await Promise.all([fetchBoard(), fetchMe()]);
    if ("board" in b) setBoard(b.board);
    if (state) setMe(state);
  }, [fetchBoard, fetchMe]);

  const cooldownLeft = useCountdown(me?.cooldownUntil ?? null);

  const grid: PublicGrid | null =
    board?.grids[Math.min(gridIndex, (board?.grids.length ?? 1) - 1)] ?? null;

  const resetCountdown = useCountdown(grid?.resetsAt ?? null);
  const gridResting = grid?.completedAt != null;

  const revealedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const t of grid?.revealed ?? []) map.set(`${t.row}:${t.col}`, t.hit);
    return map;
  }, [grid]);

  async function clickTile(row: number, col: number) {
    if (!email || busy || cooldownLeft || !grid || gridResting) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/play/${slug}/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, gridId: grid.id, row, col }),
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
        setLastMiss({ gridId: grid.id, row, col });
        setReveal({ kind: "miss", points: result.loyalty_points });
      } else if (result.result === "cooldown") {
        setFlash("You've already played recently. Come back when the timer ends!");
      } else if (result.result === "grid_completed") {
        setFlash(
          "All rewards on this grid have been found — it's resting before the next round."
        );
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

  // Brand tint for everything below (splash included, once the board is in).
  const brandStyle = {
    "--brand": board?.brandColor ?? "#059669",
  } as React.CSSProperties;

  const splash =
    board && !splashDone && !loadError ? (
      <div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white"
        style={{
          ...brandStyle,
          animation: splashLeaving ? "splash-out 0.5s ease-out both" : undefined,
        }}
        aria-hidden
      >
        <div style={{ animation: "splash-logo 0.9s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          {board.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- merchant-uploaded, host not known at build time
            <img
              src={board.logoUrl}
              alt=""
              className="size-24 rounded-3xl border border-zinc-200 object-cover shadow-xl"
            />
          ) : (
            <div
              className="flex size-24 items-center justify-center rounded-3xl text-white shadow-xl"
              style={{ backgroundColor: "var(--brand)" }}
            >
              <Target className="size-12" aria-hidden />
            </div>
          )}
        </div>
        <p
          className="mt-4 text-lg font-bold tracking-tight text-zinc-900"
          style={{ animation: "splash-logo 0.9s 0.15s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          {board.businessName}
        </p>
      </div>
    ) : null;

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

  if (!board || !grid) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        {splash}
        <span className="animate-pulse">Loading board…</span>
      </main>
    );
  }

  if (!email) {
    return (
      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={brandStyle}
      >
        {splash}
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
          <BusinessMark board={board} size="lg" />
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            {board.tagline ?? "Tap a tile, win a reward."} Enter your email so
            we can send you your redemption code if you hit one.
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

  const canRedeemPoints = (me?.loyaltyPoints ?? 0) >= board.pointsPerDiscount;

  return (
    <main className="min-h-screen p-4 pb-28 sm:p-8 sm:pb-28" style={brandStyle}>
      {splash}
      <div className="animate-fade-up mx-auto max-w-3xl">
        <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <BusinessMark board={board} size="md" />
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
              {gridResting
                ? "All rewards found — the grid is resting before the next round."
                : grid.rewardsRemaining > 0
                  ? `${grid.rewardsRemaining} reward${grid.rewardsRemaining === 1 ? "" : "s"} still hidden — good luck!`
                  : "All rewards found on this grid — earn loyalty points or try another!"}
            </p>
          </div>
          <div className="card flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm text-zinc-700">
            <span className="flex items-center gap-1.5">
              <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
              <span className="font-semibold">{me?.loyaltyPoints ?? 0}</span>
              point{(me?.loyaltyPoints ?? 0) === 1 ? "" : "s"}
            </span>
            <span className="text-zinc-400">
              · {board.pointsPerDiscount} pts = {board.discountPercent}% off
            </span>
            {me?.pointsExpireAt && (me?.loyaltyPoints ?? 0) > 0 && (
              <span
                className={
                  "text-xs " +
                  (expiringSoon(me.pointsExpireAt)
                    ? "font-medium text-amber-600"
                    : "text-zinc-400")
                }
              >
                · expire in {formatSpan(me.pointsExpireAt)}
              </span>
            )}
          </div>
        </header>

        <CodesStrip
          me={me}
          discountPercent={board.discountPercent}
          eligible={canRedeemPoints}
        />

        {board.grids.length > 1 && (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setGridIndex((i) => Math.max(i - 1, 0))}
              disabled={gridIndex === 0}
              className="btn-secondary shrink-0 p-2"
              aria-label="Previous grid"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <div className="flex grow gap-2 overflow-x-auto">
              {board.grids.map((g, i) => (
                <button
                  key={g.id}
                  onClick={() => setGridIndex(i)}
                  className={
                    "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition " +
                    (i === gridIndex
                      ? "text-white"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50")
                  }
                  style={
                    i === gridIndex ? { backgroundColor: "var(--brand)" } : undefined
                  }
                >
                  {g.title ?? `Grid ${i + 1}`}
                </button>
              ))}
            </div>
            <button
              onClick={() =>
                setGridIndex((i) => Math.min(i + 1, board.grids.length - 1))
              }
              disabled={gridIndex === board.grids.length - 1}
              className="btn-secondary shrink-0 p-2"
              aria-label="Next grid"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {gridResting && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
            <RefreshCw className="size-4 shrink-0" aria-hidden />
            <span>
              All rewards found — this grid resets with fresh rewards in{" "}
              <strong className="font-semibold tabular-nums">
                {resetCountdown ?? "a moment"}
              </strong>
              .
            </span>
          </div>
        )}

        {cooldownLeft && !gridResting && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <Hourglass className="size-4 shrink-0" aria-hidden />
            <span>
              You can play again in{" "}
              <strong className="font-semibold tabular-nums">{cooldownLeft}</strong>.
            </span>
          </div>
        )}

        {flash && !cooldownLeft && (
          <div className="animate-pop-in card mt-4 px-4 py-3 text-sm text-zinc-700">
            {flash}
          </div>
        )}

        <TileGrid
          grid={grid}
          revealedMap={revealedMap}
          lastMiss={lastMiss}
          disabled={busy || !!cooldownLeft || gridResting}
          cooldown={!!cooldownLeft && !gridResting}
          resting={gridResting}
          onTileClick={clickTile}
        />

        <footer className="mt-10 text-center text-xs text-zinc-400">
          Playing as {email} ·{" "}
          <Link href="/me" className="underline transition hover:text-zinc-600">
            my rewards
          </Link>{" "}
          ·{" "}
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

      <ContactFab board={board} />

      {reveal && (
        <RevealModal
          reveal={reveal}
          board={board}
          brandStyle={brandStyle}
          onClose={() => setReveal(null)}
        />
      )}

      {showWelcome && !reveal && (
        <WelcomeModal
          board={board}
          grid={grid}
          brandStyle={brandStyle}
          onClose={() => {
            window.sessionStorage.setItem(WELCOME_STORAGE_PREFIX + slug, "1");
            setShowWelcome(false);
          }}
        />
      )}
    </main>
  );
}

// Codes live at the top of the page, right by the points: the cycling
// loyalty code plus a one-time code for every unredeemed reward.
function CodesStrip({
  me,
  discountPercent,
  eligible,
}: {
  me: CustomerState | null;
  discountPercent: number;
  eligible: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!me || (!me.loyaltyCode && me.codes.length === 0)) return null;

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  const codeChip = (code: string) => (
    <button
      onClick={() => copy(code)}
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--brand),transparent_60%)] bg-[color-mix(in_oklab,var(--brand),transparent_92%)] px-3 py-1.5 font-mono text-base tracking-[0.2em] text-[var(--brand)] transition hover:brightness-95"
      aria-label={`Copy code ${code}`}
    >
      {code}
      {copied === code ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5 opacity-60" aria-hidden />
      )}
    </button>
  );

  return (
    <section className="mt-4 space-y-2">
      {me.loyaltyCode && (
        <div className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
              <BadgePercent className="size-4 text-[var(--brand)]" aria-hidden />
              Loyalty code
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              {eligible
                ? `You have enough points — show this at the counter for ${discountPercent}% off!`
                : "Show at the counter to spend your points. It changes after each use."}
            </p>
          </div>
          {codeChip(me.loyaltyCode)}
        </div>
      )}
      {me.codes.map((c) => (
        <div
          key={c.code}
          className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
              <Gift className="size-4 text-[var(--brand)]" aria-hidden />
              {c.description}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              Show to staff to claim · expires{" "}
              {new Date(c.expiresAt).toLocaleString()}
            </p>
          </div>
          {codeChip(c.code)}
        </div>
      ))}
    </section>
  );
}

// First-visit popup: a branded welcome with how-to-play and what's hidden in
// the grid (reward names + optional details, never positions).
function WelcomeModal({
  board,
  grid,
  brandStyle,
  onClose,
}: {
  board: PublicBoardState;
  grid: PublicGrid;
  brandStyle: React.CSSProperties;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-6 backdrop-blur-sm"
      style={brandStyle}
      onClick={onClose}
    >
      <div
        className="animate-pop-in card relative max-h-[85vh] w-full max-w-sm overflow-y-auto p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center">
          {board.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- merchant-uploaded, host not known at build time
            <img
              src={board.logoUrl}
              alt=""
              className="size-16 rounded-2xl border border-zinc-200 object-cover shadow"
            />
          ) : (
            <div
              className="flex size-16 items-center justify-center rounded-2xl text-white shadow"
              style={{ backgroundColor: "var(--brand)" }}
            >
              <Target className="size-8" aria-hidden />
            </div>
          )}
        </div>
        <h2 className="mt-4 text-center text-xl font-bold tracking-tight text-zinc-900">
          Welcome to {board.businessName}!
        </h2>
        <p className="mt-1.5 text-center text-sm leading-relaxed text-zinc-500">
          {board.tagline ??
            "Tap a tile and see what's underneath — rewards are hiding in the grid."}
        </p>

        {grid.rewardsInfo.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Hidden in this grid
            </p>
            <ul className="mt-2 space-y-2">
              {grid.rewardsInfo.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-xl bg-[color-mix(in_oklab,var(--brand),transparent_94%)] px-3 py-2.5"
                >
                  <Gift
                    className="mt-0.5 size-4 shrink-0 text-[var(--brand)]"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800">
                      {r.description}
                    </p>
                    {r.details && (
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                        {r.details}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-400">
          Miss a reward and you still earn a loyalty point —{" "}
          {board.pointsPerDiscount} points get you {board.discountPercent}% off
          at the counter.
        </p>

        <button onClick={onClose} className="btn-primary mt-5 w-full">
          Start hunting
        </button>
      </div>
    </div>
  );
}

// The board itself. Revealed tiles uncover their slice of the grid's puzzle
// image (if it has one); unrevealed tiles are brand-colored. Interlocking
// shapes render each tile as an oversized clipped box so tabs reach into the
// neighbouring cells (see src/lib/tile-shapes.ts).
function TileGrid({
  grid,
  revealedMap,
  lastMiss,
  disabled,
  cooldown,
  resting,
  onTileClick,
}: {
  grid: PublicGrid;
  revealedMap: Map<string, boolean>;
  lastMiss: { gridId: string; row: number; col: number } | null;
  disabled: boolean;
  cooldown: boolean;
  resting: boolean;
  onTileClick: (row: number, col: number) => void;
}) {
  const interlock =
    grid.tileShape === "interlock-sharp" || grid.tileShape === "interlock-curved";

  // One SVG clipPath per distinct silhouette on this board (curved only).
  const curvedCombos = useMemo(
    () =>
      grid.tileShape === "interlock-curved"
        ? allEdgeCombos(grid.rows, grid.cols)
        : [],
    [grid.tileShape, grid.rows, grid.cols]
  );

  function clipStyle(row: number, col: number): React.CSSProperties {
    const edges = edgesFor(row, col, grid.rows, grid.cols);
    if (grid.tileShape === "interlock-sharp") {
      return { clipPath: sharpClipPolygon(edges) };
    }
    return { clipPath: `url(#jig-${grid.id}-${edgesKey(edges)})` };
  }

  function squareSliceStyle(row: number, col: number): React.CSSProperties {
    if (!grid.imageUrl) return {};
    return {
      backgroundImage: `url(${grid.imageUrl})`,
      backgroundSize: `${grid.cols * 100}% ${grid.rows * 100}%`,
      backgroundPosition: `${
        grid.cols > 1 ? (col / (grid.cols - 1)) * 100 : 0
      }% ${grid.rows > 1 ? (row / (grid.rows - 1)) * 100 : 0}%`,
    };
  }

  // Deterministic per-tile "randomness" so cooldown tiles twinkle out of sync.
  function twinkleStyle(i: number): React.CSSProperties {
    if (!cooldown) return {};
    return {
      "--twinkle-delay": `${(i * 137) % 3000}ms`,
      "--twinkle-duration": `${2400 + ((i * 97) % 1900)}ms`,
    } as React.CSSProperties;
  }

  const liveClasses = cooldown
    ? "tile-cooldown cursor-not-allowed"
    : resting
      ? "cursor-not-allowed bg-zinc-100 ring-1 ring-zinc-200 opacity-70"
      : interlock
        ? "tile-live tile-live-shaped cursor-pointer hover:brightness-110 active:brightness-95"
        : "tile-live cursor-pointer hover:scale-105 active:scale-95";

  return (
    <div className={"mx-auto mt-6 w-full max-w-[540px]" + (resting ? " opacity-80" : "")}>
      {curvedCombos.length > 0 && (
        <svg width="0" height="0" className="absolute" aria-hidden>
          <defs>
            {curvedCombos.map((edges) => (
              <clipPath
                key={edgesKey(edges)}
                id={`jig-${grid.id}-${edgesKey(edges)}`}
                clipPathUnits="objectBoundingBox"
              >
                <path d={curvedPathD(edges)} />
              </clipPath>
            ))}
          </defs>
        </svg>
      )}
      <div
        className={"grid " + (interlock ? "gap-0" : "gap-2 sm:gap-2.5")}
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: grid.rows * grid.cols }, (_, i) => {
          const row = Math.floor(i / grid.cols);
          const col = i % grid.cols;
          const state = revealedMap.get(`${row}:${col}`);
          const isRevealed = state !== undefined;
          const isMyMiss =
            lastMiss?.gridId === grid.id &&
            lastMiss.row === row &&
            lastMiss.col === col;

          if (!interlock) {
            if (isRevealed) {
              // Revealed: show the puzzle-image slice (or a plain marker without
              // an image). Hits get a small gift badge on top of the slice.
              return (
                <div
                  key={i}
                  aria-label={`Tile ${row + 1}, ${col + 1} (already revealed)`}
                  className={
                    "relative flex aspect-square items-center justify-center rounded-lg " +
                    (isMyMiss ? "animate-tile-reveal " : "") +
                    (grid.imageUrl
                      ? "ring-1 ring-zinc-200"
                      : state === true
                        ? "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300"
                        : "bg-zinc-100 text-zinc-300 ring-1 ring-zinc-200")
                  }
                  style={squareSliceStyle(row, col)}
                >
                  {grid.imageUrl ? (
                    state === true && (
                      <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                        <Gift className="size-3" aria-hidden />
                      </span>
                    )
                  ) : state === true ? (
                    <Gift className="size-1/2 max-h-6 max-w-6" aria-hidden />
                  ) : (
                    <X className="size-1/2 max-h-5 max-w-5" aria-hidden />
                  )}
                </div>
              );
            }
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => onTileClick(row, col)}
                aria-label={`Tile ${row + 1}, ${col + 1}`}
                className={`aspect-square rounded-lg transition ${liveClasses}`}
                style={twinkleStyle(i)}
              />
            );
          }

          // Interlocking shapes: the cell stays in the grid flow; the visible
          // tile is an oversized clipped box whose tabs overhang the cell.
          // "Out" tiles draw above their notched neighbours.
          const boxStyle: React.CSSProperties = {
            inset: "-22%",
            zIndex: isOutTile(row, col) ? 2 : 1,
            ...clipStyle(row, col),
          };

          return (
            <div key={i} className="relative aspect-square">
              {isRevealed ? (
                <>
                  <div
                    aria-label={`Tile ${row + 1}, ${col + 1} (already revealed)`}
                    className={
                      "absolute flex items-center justify-center " +
                      (isMyMiss ? "animate-tile-reveal " : "") +
                      (grid.imageUrl
                        ? ""
                        : state === true
                          ? "bg-emerald-100 text-emerald-600"
                          : "bg-zinc-100 text-zinc-300")
                    }
                    style={{
                      ...boxStyle,
                      ...(grid.imageUrl
                        ? interlockSliceStyle(
                            row,
                            col,
                            grid.rows,
                            grid.cols,
                            grid.imageUrl
                          )
                        : {}),
                    }}
                  >
                    {!grid.imageUrl &&
                      (state === true ? (
                        <Gift className="size-1/3 max-h-6 max-w-6" aria-hidden />
                      ) : (
                        <X className="size-1/3 max-h-5 max-w-5" aria-hidden />
                      ))}
                  </div>
                  {grid.imageUrl && state === true && (
                    <span className="absolute -right-1 -top-1 z-10 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                      <Gift className="size-3" aria-hidden />
                    </span>
                  )}
                </>
              ) : (
                <button
                  disabled={disabled}
                  onClick={() => onTileClick(row, col)}
                  aria-label={`Tile ${row + 1}, ${col + 1}`}
                  className={`absolute transition ${liveClasses}`}
                  style={{ ...boxStyle, ...twinkleStyle(i) }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Logo + business name, used in the header and the email gate.
function BusinessMark({
  board,
  size,
}: {
  board: PublicBoardState;
  size: "md" | "lg";
}) {
  const img = size === "lg" ? "size-14" : "size-9";
  return (
    <div className="flex items-center gap-3">
      {board.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- merchant-uploaded, host not known at build time
        <img
          src={board.logoUrl}
          alt={`${board.businessName} logo`}
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
        {board.businessName}
      </h1>
    </div>
  );
}

// Floating action button: contact the business, jump to your rewards.
function ContactFab({ board }: { board: PublicBoardState }) {
  const [open, setOpen] = useState(false);
  const actions: { label: string; href: string; icon: React.ReactNode }[] = [];

  if (board.whatsapp) {
    actions.push({
      label: "WhatsApp us",
      href: `https://wa.me/${board.whatsapp.replace(/[^0-9]/g, "")}`,
      icon: <MessageCircle className="size-4" aria-hidden />,
    });
  }
  if (board.contactEmail) {
    actions.push({
      label: "Email us",
      href: `mailto:${board.contactEmail}`,
      icon: <Mail className="size-4" aria-hidden />,
    });
  }
  actions.push({
    label: "My rewards",
    href: "/me",
    icon: <Ticket className="size-4" aria-hidden />,
  });

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {open &&
        actions.map((a) => (
          <a
            key={a.label}
            href={a.href}
            target={a.href.startsWith("http") ? "_blank" : undefined}
            rel={a.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="animate-pop-in flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-2 pl-3 pr-4 text-sm font-medium text-zinc-700 shadow-lg transition hover:bg-zinc-50"
          >
            <span
              className="flex size-7 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: "var(--brand)" }}
            >
              {a.icon}
            </span>
            {a.label}
          </a>
        ))}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close actions" : "Open actions"}
        aria-expanded={open}
        className="flex size-14 cursor-pointer items-center justify-center rounded-full text-white shadow-xl transition hover:brightness-110 active:scale-95"
        style={{ backgroundColor: "var(--brand)" }}
      >
        <Plus
          className={`size-6 transition-transform ${open ? "rotate-45" : ""}`}
          aria-hidden
        />
      </button>
    </div>
  );
}

// The tile-reveal popup: a branded celebration for hits, an encouraging
// points update for misses.
function RevealModal({
  reveal,
  board,
  brandStyle,
  onClose,
}: {
  reveal: Reveal;
  board: PublicBoardState;
  brandStyle: React.CSSProperties;
  onClose: () => void;
}) {
  const countdown = useCountdown(reveal.kind === "hit" ? reveal.expiresAt : null);
  const isHit = reveal.kind === "hit";
  const pointsInCycle = isHit
    ? 0
    : reveal.points % board.pointsPerDiscount || // partial progress…
      (reveal.points > 0 ? board.pointsPerDiscount : 0); // …or a full, redeemable cycle

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
            <p className="mt-1 text-xs text-zinc-400">
              We also emailed it to you — it stays at the top of this page
              until you redeem it.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              No reward under that tile, but you&apos;re{" "}
              {reveal.points >= board.pointsPerDiscount
                ? `ready for ${board.discountPercent}% off — show your loyalty code at the counter!`
                : `${board.pointsPerDiscount - pointsInCycle} point${board.pointsPerDiscount - pointsInCycle === 1 ? "" : "s"} from ${board.discountPercent}% off.`}
            </p>
            {/* Progress dots toward the next discount */}
            <div className="mt-5 flex items-center justify-center gap-2">
              {Array.from({ length: board.pointsPerDiscount }, (_, i) => (
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
              {board.pointsPerDiscount} pts = {board.discountPercent}% off ·
              points last 7 days from your latest play
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
