"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SLUG_REGEX, TIER_LIMITS, type SubscriptionTier } from "@/lib/constants";
import type { RedeemResult } from "@/lib/types";

interface Merchant {
  id: string;
  business_name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
}

interface GridRow {
  id: string;
  rows: number;
  cols: number;
}

interface TileRow {
  row_index: number;
  col_index: number;
  reward_id: string | null;
  is_revealed: boolean;
}

interface RewardRow {
  id: string;
  description: string;
  expiry_hours: number;
  max_redemptions: number;
}

interface UnlockRow {
  id: string;
  redemption_code: string;
  reward_type: string;
  discount_percent: number | null;
  status: string;
  unlocked_at: string;
  expires_at: string;
  // Computed at fetch time (render must stay pure, no Date.now() in JSX).
  isExpired: boolean;
  rewards: { description: string } | null;
  customers: { email: string } | null;
}

interface Snapshot {
  merchant: Merchant | null;
  grid: GridRow | null;
  tiles: TileRow[];
  rewards: RewardRow[];
  unlocks: UnlockRow[];
}

interface RewardDraft {
  description: string;
  expiryHours: number;
  maxRedemptions: number;
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [grid, setGrid] = useState<GridRow | null>(null);
  const [tiles, setTiles] = useState<TileRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [showGridForm, setShowGridForm] = useState(false);

  // Pure fetcher (no setState) so the mount effect can apply the snapshot in
  // an async callback — required by the react-hooks/set-state-in-effect rule.
  const fetchAll = useCallback(async (): Promise<Snapshot | "unauthenticated"> => {
    // Created lazily (not during render) so the page can prerender without env vars.
    const supabase = supabaseBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "unauthenticated";

    const snap: Snapshot = {
      merchant: null,
      grid: null,
      tiles: [],
      rewards: [],
      unlocks: [],
    };

    const { data: m } = await supabase
      .from("merchants")
      .select("id, business_name, slug, subscription_tier")
      .maybeSingle();
    snap.merchant = m as Merchant | null;
    if (!m) return snap;

    const { data: g } = await supabase
      .from("grids")
      .select("id, rows, cols")
      .eq("merchant_id", m.id)
      .eq("status", "active")
      .maybeSingle();
    snap.grid = g as GridRow | null;

    if (g) {
      const [{ data: t }, { data: r }] = await Promise.all([
        supabase
          .from("tiles")
          .select("row_index, col_index, reward_id, is_revealed")
          .eq("grid_id", g.id),
        supabase
          .from("rewards")
          .select("id, description, expiry_hours, max_redemptions")
          .eq("grid_id", g.id),
      ]);
      snap.tiles = (t as TileRow[]) ?? [];
      snap.rewards = (r as RewardRow[]) ?? [];
    }

    const { data: u } = await supabase
      .from("unlocked_rewards")
      .select(
        "id, redemption_code, reward_type, discount_percent, status, unlocked_at, expires_at, rewards(description), customers(email)"
      )
      .eq("merchant_id", m.id)
      .order("unlocked_at", { ascending: false })
      .limit(25);
    const now = Date.now();
    snap.unlocks = ((u as unknown as Omit<UnlockRow, "isExpired">[]) ?? []).map(
      (row) => ({ ...row, isExpired: new Date(row.expires_at).getTime() < now })
    );
    return snap;
  }, []);

  const load = useCallback(async () => {
    const snap = await fetchAll();
    if (snap === "unauthenticated") {
      router.push("/login");
      return;
    }
    setMerchant(snap.merchant);
    setGrid(snap.grid);
    setTiles(snap.tiles);
    setRewards(snap.rewards);
    setUnlocks(snap.unlocks);
    setLoading(false);
  }, [fetchAll, router]);

  useEffect(() => {
    let ignore = false;
    fetchAll().then((snap) => {
      if (ignore) return;
      if (snap === "unauthenticated") {
        router.push("/login");
        return;
      }
      setMerchant(snap.merchant);
      setGrid(snap.grid);
      setTiles(snap.tiles);
      setRewards(snap.rewards);
      setUnlocks(snap.unlocks);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAll, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading dashboard…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-4 pb-16 text-white sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            🧩 TileHunt {merchant ? `· ${merchant.business_name}` : ""}
          </h1>
          <button
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              router.push("/login");
            }}
            className="text-sm text-zinc-400 underline hover:text-white"
          >
            Sign out
          </button>
        </header>

        {!merchant ? (
          <OnboardingForm onCreated={load} />
        ) : (
          <>
            <ShareLink slug={merchant.slug} tier={merchant.subscription_tier} />
            <RedeemBox />
            {grid && !showGridForm ? (
              <GridPreview
                grid={grid}
                tiles={tiles}
                rewards={rewards}
                onReset={() => setShowGridForm(true)}
              />
            ) : (
              <GridForm
                tier={merchant.subscription_tier}
                hasActiveGrid={!!grid}
                onDone={async () => {
                  setShowGridForm(false);
                  await load();
                }}
                onCancel={grid ? () => setShowGridForm(false) : undefined}
              />
            )}
            <UnlocksList unlocks={unlocks} />
          </>
        )}
      </div>
    </main>
  );
}

function OnboardingForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!SLUG_REGEX.test(slug)) {
      setError(
        "Link name must be 3-40 characters: lowercase letters, numbers, and dashes."
      );
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, slug }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "slug_taken"
          ? "That link name is taken — try another."
          : "Couldn't create your profile. Check the fields and try again."
      );
      return;
    }
    await onCreated();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 max-w-md rounded-2xl bg-zinc-900 p-6 ring-1 ring-zinc-800"
    >
      <h2 className="text-lg font-semibold">Set up your business</h2>
      <label className="mt-4 block text-sm text-zinc-400">
        Business name
        <input
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Mama Put Kitchen"
          className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-white ring-1 ring-zinc-700 focus:ring-emerald-500"
        />
      </label>
      <label className="mt-3 block text-sm text-zinc-400">
        Shareable link name
        <div className="mt-1 flex items-center rounded-lg bg-zinc-800 ring-1 ring-zinc-700 focus-within:ring-emerald-500">
          <span className="pl-3 text-zinc-500">/g/</span>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="mama-put-kitchen"
            className="w-full bg-transparent px-1 py-2 text-white outline-none"
          />
        </div>
      </label>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create profile"}
      </button>
    </form>
  );
}

function ShareLink({ slug, tier }: { slug: string; tier: SubscriptionTier }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/g/${slug}` : `/g/${slug}`;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          Your customer link · {tier} tier
        </p>
        <p className="truncate font-mono text-emerald-400">{url}</p>
      </div>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}

function RedeemBox() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/merchant/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = (await res.json().catch(() => null)) as RedeemResult | null;
    setBusy(false);
    if (body?.result === "redeemed") {
      setOk(true);
      setResult(
        `✅ Redeemed: ${body.description} (customer: ${body.customer_email})`
      );
      setCode("");
    } else {
      setOk(false);
      const reason =
        body && "error" in body
          ? {
              code_not_found: "Code not found for your business.",
              already_redeemed: "That code was already redeemed.",
              expired: "That code has expired.",
            }[body.error]
          : null;
      setResult(`❌ ${reason ?? "Couldn't redeem that code."}`);
    }
  }

  return (
    <form
      onSubmit={redeem}
      className="mt-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Redeem a customer code
      </h2>
      <div className="mt-2 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7M2XQ"
          maxLength={6}
          className="w-40 rounded-lg bg-zinc-800 px-3 py-2 font-mono text-lg tracking-widest text-white ring-1 ring-zinc-700 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Redeem"}
        </button>
      </div>
      {result && (
        <p className={`mt-2 text-sm ${ok ? "text-emerald-300" : "text-rose-400"}`}>
          {result}
        </p>
      )}
    </form>
  );
}

function GridPreview({
  grid,
  tiles,
  rewards,
  onReset,
}: {
  grid: GridRow;
  tiles: TileRow[];
  rewards: RewardRow[];
  onReset: () => void;
}) {
  const tileMap = new Map(tiles.map((t) => [`${t.row_index}:${t.col_index}`, t]));
  const revealedCount = tiles.filter((t) => t.is_revealed).length;
  return (
    <section className="mt-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Active grid · {grid.rows}×{grid.cols} · {revealedCount}/{tiles.length}{" "}
          tiles revealed
        </h2>
        <button
          onClick={onReset}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
        >
          Reset grid
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        💰 marks your hidden reward tiles — only you can see this map.
      </p>
      <div
        className="mt-3 grid max-w-xl gap-1"
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: grid.rows * grid.cols }, (_, i) => {
          const row = Math.floor(i / grid.cols);
          const col = i % grid.cols;
          const t = tileMap.get(`${row}:${col}`);
          return (
            <div
              key={i}
              className={
                "flex aspect-square items-center justify-center rounded text-xs sm:text-sm " +
                (t?.is_revealed
                  ? "bg-zinc-800 text-zinc-500"
                  : t?.reward_id
                    ? "bg-amber-500/20 ring-1 ring-amber-500/40"
                    : "bg-zinc-800/50 ring-1 ring-zinc-800")
              }
            >
              {t?.is_revealed ? "✕" : t?.reward_id ? "💰" : ""}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 space-y-1 text-sm text-zinc-300">
        {rewards.map((r) => (
          <li key={r.id}>
            🎁 {r.description}{" "}
            <span className="text-zinc-500">
              · {r.max_redemptions}x · valid {r.expiry_hours}h after unlock
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GridForm({
  tier,
  hasActiveGrid,
  onDone,
  onCancel,
}: {
  tier: SubscriptionTier;
  hasActiveGrid: boolean;
  onDone: () => Promise<void>;
  onCancel?: () => void;
}) {
  const limits = TIER_LIMITS[tier];
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [drafts, setDrafts] = useState<RewardDraft[]>([
    { description: "", expiryHours: 48, maxRedemptions: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setDraft(i: number, patch: Partial<RewardDraft>) {
    setDrafts((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/grid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, cols, rewards: drafts }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        {
          grid_size_not_allowed: `Your ${tier} tier allows ${limits.minGrid}×${limits.minGrid}${limits.maxGrid > limits.minGrid ? ` up to ${limits.maxGrid}×${limits.maxGrid}` : ""} grids.`,
          too_many_rewards: `Your ${tier} tier allows up to ${limits.maxRewards} reward${limits.maxRewards === 1 ? "" : "s"}.`,
          invalid_reward: "Each reward needs a description and sensible numbers.",
          rewards_exceed_tiles: "More reward redemptions than tiles — shrink the rewards or grow the grid.",
          no_rewards: "Add at least one reward.",
        }[String(body?.error)] ?? "Couldn't create the grid."
      );
      return;
    }
    await onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        {hasActiveGrid ? "Reset grid" : "Create your grid"}
      </h2>
      {hasActiveGrid && (
        <p className="mt-1 text-xs text-amber-300">
          Resetting archives the current grid; already-issued codes stay valid.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        {(["rows", "cols"] as const).map((dim) => (
          <label key={dim} className="text-sm text-zinc-400">
            {dim === "rows" ? "Rows" : "Columns"}
            <input
              type="number"
              min={limits.minGrid}
              max={limits.maxGrid}
              value={dim === "rows" ? rows : cols}
              disabled={limits.minGrid === limits.maxGrid}
              onChange={(e) =>
                (dim === "rows" ? setRows : setCols)(Number(e.target.value))
              }
              className="mt-1 block w-24 rounded-lg bg-zinc-800 px-3 py-2 text-white ring-1 ring-zinc-700 focus:ring-emerald-500 disabled:opacity-60"
            />
          </label>
        ))}
        <p className="self-end pb-2 text-xs text-zinc-500">
          {tier === "free"
            ? "Free tier: fixed 5×5. Upgrade for up to 20×20."
            : "Premium: 5×5 up to 20×20."}
        </p>
      </div>

      <h3 className="mt-4 text-sm text-zinc-400">
        Rewards ({drafts.length}/{limits.maxRewards})
      </h3>
      {drafts.map((d, i) => (
        <div key={i} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grow text-xs text-zinc-500">
            Description
            <input
              required
              value={d.description}
              onChange={(e) => setDraft(i, { description: e.target.value })}
              placeholder="Free plate of jollof rice"
              className="mt-1 w-full rounded-lg bg-zinc-800 px-3 py-2 text-white ring-1 ring-zinc-700 focus:ring-emerald-500"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Expires (hours)
            <input
              type="number"
              min={1}
              max={720}
              value={d.expiryHours}
              onChange={(e) => setDraft(i, { expiryHours: Number(e.target.value) })}
              className="mt-1 block w-24 rounded-lg bg-zinc-800 px-3 py-2 text-white ring-1 ring-zinc-700 focus:ring-emerald-500"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Winners
            <input
              type="number"
              min={1}
              max={400}
              value={d.maxRedemptions}
              onChange={(e) =>
                setDraft(i, { maxRedemptions: Number(e.target.value) })
              }
              className="mt-1 block w-20 rounded-lg bg-zinc-800 px-3 py-2 text-white ring-1 ring-zinc-700 focus:ring-emerald-500"
            />
          </label>
          {drafts.length > 1 && (
            <button
              type="button"
              onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-rose-400 hover:bg-zinc-700"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {drafts.length < limits.maxRewards && (
        <button
          type="button"
          onClick={() =>
            setDrafts((ds) => [
              ...ds,
              { description: "", expiryHours: 48, maxRedemptions: 1 },
            ])
          }
          className="mt-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
        >
          + Add reward
        </button>
      )}

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Building…" : hasActiveGrid ? "Archive & create new grid" : "Create grid"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function UnlocksList({ unlocks }: { unlocks: UnlockRow[] }) {
  if (unlocks.length === 0) return null;
  return (
    <section className="mt-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Recent unlocks
      </h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2 pr-4">Reward</th>
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Expires</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {unlocks.map((u) => (
              <tr key={u.id} className="border-t border-zinc-800">
                <td className="py-2 pr-4">
                  {u.reward_type === "loyalty_discount"
                    ? `${u.discount_percent}% loyalty discount`
                    : (u.rewards?.description ?? "Tile reward")}
                </td>
                <td className="py-2 pr-4">{u.customers?.email ?? "—"}</td>
                {/* Codes are masked: staff must get the full code from the
                    customer, which is the whole anti-fraud point. */}
                <td className="py-2 pr-4 font-mono">
                  ••••{u.redemption_code.slice(-2)}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      u.status === "redeemed"
                        ? "text-emerald-400"
                        : u.status === "expired" || u.isExpired
                          ? "text-zinc-500"
                          : "text-amber-300"
                    }
                  >
                    {u.status === "unredeemed" && u.isExpired
                      ? "expired"
                      : u.status}
                  </span>
                </td>
                <td className="py-2">{new Date(u.expires_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
