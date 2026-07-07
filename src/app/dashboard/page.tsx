"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent,
  Check,
  Copy,
  Gift,
  Hourglass,
  ImagePlus,
  Link2,
  LogOut,
  Palette,
  Plus,
  Puzzle,
  RefreshCw,
  Star,
  Store,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SLUG_REGEX, TIER_LIMITS, type SubscriptionTier } from "@/lib/constants";
import type { CustomerSummary, RedeemResult } from "@/lib/types";

interface Merchant {
  id: string;
  business_name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  logo_url: string | null;
  tagline: string | null;
  brand_color: string;
  points_per_discount: number;
  discount_percent: number;
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
  customers: CustomerSummary[];
  // Set when the merchant query itself failed (e.g. schema out of date) —
  // never show onboarding in that case, the merchant may well exist.
  loadError: string | null;
}

interface RewardDraft {
  description: string;
  expiryHours: number;
  maxRedemptions: number;
}

// "in 2d 4h" / "in 3h 20m" / "now" — for cooldowns and redemption ETAs.
function formatEta(iso: string | null): string {
  if (!iso) return "now";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMinutes = Math.ceil(ms / 60_000);
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [grid, setGrid] = useState<GridRow | null>(null);
  const [tiles, setTiles] = useState<TileRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      customers: [],
      loadError: null,
    };

    const { data: m, error: merchantError } = await supabase
      .from("merchants")
      .select(
        "id, business_name, slug, subscription_tier, logo_url, tagline, brand_color, points_per_discount, discount_percent"
      )
      .maybeSingle();
    if (merchantError) {
      console.error("[dashboard] merchants query failed:", merchantError);
      snap.loadError =
        merchantError.code === "42703"
          ? "Your database schema is out of date — apply the latest migration (supabase/migrations/0003) and reload."
          : "Couldn't load your business profile. Reload to try again.";
      return snap;
    }
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

    const [{ data: u }, customersRes] = await Promise.all([
      supabase
        .from("unlocked_rewards")
        .select(
          "id, redemption_code, reward_type, discount_percent, status, unlocked_at, expires_at, rewards(description), customers(email)"
        )
        .eq("merchant_id", m.id)
        .order("unlocked_at", { ascending: false })
        .limit(25),
      fetch("/api/merchant/customers").then((res) =>
        res.ok ? res.json() : { customers: [] }
      ),
    ]);
    const now = Date.now();
    snap.unlocks = ((u as unknown as Omit<UnlockRow, "isExpired">[]) ?? []).map(
      (row) => ({ ...row, isExpired: new Date(row.expires_at).getTime() < now })
    );
    snap.customers = (customersRes?.customers as CustomerSummary[]) ?? [];
    return snap;
  }, []);

  const applySnapshot = useCallback(
    (snap: Snapshot) => {
      setMerchant(snap.merchant);
      setGrid(snap.grid);
      setTiles(snap.tiles);
      setRewards(snap.rewards);
      setUnlocks(snap.unlocks);
      setCustomers(snap.customers);
      setLoadError(snap.loadError);
      setLoading(false);
    },
    []
  );

  const load = useCallback(async () => {
    const snap = await fetchAll();
    if (snap === "unauthenticated") {
      router.push("/login");
      return;
    }
    applySnapshot(snap);
  }, [fetchAll, router, applySnapshot]);

  useEffect(() => {
    let ignore = false;
    fetchAll().then((snap) => {
      if (ignore) return;
      if (snap === "unauthenticated") {
        router.push("/login");
        return;
      }
      applySnapshot(snap);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAll, router, applySnapshot]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <span className="animate-pulse">Loading dashboard…</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8">
      <div className="animate-fade-up mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900">
            {merchant?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote host not known at build time
              <img
                src={merchant.logo_url}
                alt=""
                className="size-9 rounded-lg border border-zinc-200 object-cover"
              />
            ) : (
              <Puzzle className="size-7 text-emerald-600" aria-hidden />
            )}
            {merchant ? (
              merchant.business_name
            ) : (
              <>
                Tile<span className="-ml-2 text-emerald-600">Hunt</span>
              </>
            )}
          </h1>
          <button
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              router.push("/login");
            }}
            className="btn-ghost"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </header>

        {loadError ? (
          <div className="alert-error mt-6 max-w-xl px-4 py-3">{loadError}</div>
        ) : !merchant ? (
          <OnboardingForm onCreated={load} />
        ) : (
          <>
            <ShareLink slug={merchant.slug} tier={merchant.subscription_tier} />
            <BrandSettings merchant={merchant} onSaved={load} />
            <RedeemBox onRedeemed={load} />
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
            <CustomersList
              customers={customers}
              pointsPerDiscount={merchant.points_per_discount}
              discountPercent={merchant.discount_percent}
            />
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
    <form onSubmit={submit} className="card mt-6 max-w-md p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
        <Store className="size-5 text-emerald-600" aria-hidden />
        Set up your business
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Pick a name and the link your customers will visit.
      </p>
      <label className="mt-5 block">
        <span className="field-label">Business name</span>
        <input
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Mama Put Kitchen"
          className="input-field"
        />
      </label>
      <label className="mt-4 block">
        <span className="field-label">Shareable link name</span>
        <div className="flex items-center rounded-xl border border-zinc-300 bg-white transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
          <span className="pl-3.5 text-zinc-400">/g/</span>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="mama-put-kitchen"
            className="w-full bg-transparent px-1 py-2.5 text-zinc-900 placeholder-zinc-400 outline-none"
          />
        </div>
      </label>
      {error && <p className="alert-error mt-4">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-5">
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
    <div className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="section-title">
          <Link2 className="size-3.5" aria-hidden />
          Your customer link ·{" "}
          <span className="text-emerald-600">{tier} tier</span>
        </p>
        <p className="mt-1 truncate font-mono text-sm text-emerald-700 sm:text-base">
          {url}
        </p>
      </div>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="btn-secondary px-4 py-2 text-sm"
      >
        {copied ? (
          <>
            <Check className="size-4 text-emerald-600" aria-hidden /> Copied!
          </>
        ) : (
          <>
            <Copy className="size-4" aria-hidden /> Copy link
          </>
        )}
      </button>
    </div>
  );
}

function BrandSettings({
  merchant,
  onSaved,
}: {
  merchant: Merchant;
  onSaved: () => Promise<void>;
}) {
  const [businessName, setBusinessName] = useState(merchant.business_name);
  const [tagline, setTagline] = useState(merchant.tagline ?? "");
  const [brandColor, setBrandColor] = useState(merchant.brand_color);
  const [pointsPerDiscount, setPointsPerDiscount] = useState(
    merchant.points_per_discount
  );
  const [discountPercent, setDiscountPercent] = useState(
    merchant.discount_percent
  );
  const [logoPreview, setLogoPreview] = useState<string | null>(
    merchant.logo_url
  );
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const form = new FormData();
    form.set("businessName", businessName);
    form.set("tagline", tagline);
    form.set("brandColor", brandColor);
    form.set("pointsPerDiscount", String(pointsPerDiscount));
    form.set("discountPercent", String(discountPercent));
    const file = logoInputRef.current?.files?.[0];
    if (file) form.set("logo", file);

    const res = await fetch("/api/merchant/profile", {
      method: "POST",
      body: form,
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        {
          invalid_logo_type: "Logo must be a PNG, JPEG, or WebP image.",
          logo_too_large: "Logo must be under 1 MB.",
          invalid_brand_color: "Brand color must be a hex value like #059669.",
          invalid_loyalty_settings:
            "Points and discount must be whole numbers between 1 and 100.",
        }[String(body?.error)] ?? "Couldn't save your settings. Try again."
      );
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await onSaved();
  }

  return (
    <form onSubmit={submit} className="card mt-4 p-4 sm:p-5">
      <h2 className="section-title">
        <Palette className="size-3.5" aria-hidden />
        Brand & loyalty settings
      </h2>

      <div className="mt-4 flex flex-wrap items-start gap-5">
        <div>
          <span className="field-label">Logo</span>
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition hover:border-emerald-500 hover:text-emerald-600"
          >
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL / remote host not known at build time
              <img src={logoPreview} alt="Logo preview" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-6" aria-hidden />
            )}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setLogoPreview(URL.createObjectURL(f));
            }}
          />
          <p className="mt-1.5 max-w-24 text-[11px] leading-tight text-zinc-400">
            PNG, JPEG, or WebP, up to 1 MB
          </p>
        </div>

        <div className="min-w-56 grow space-y-4">
          <label className="block">
            <span className="field-label">Business name</span>
            <input
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input-field"
            />
          </label>
          <label className="block">
            <span className="field-label">Tagline</span>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={140}
              placeholder="The best jollof in town — find the golden tile!"
              className="input-field"
            />
          </label>
        </div>

        <label className="block">
          <span className="field-label">Brand color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value.toLowerCase())}
              className="size-11 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
              aria-label="Brand color"
            />
            <input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value.toLowerCase())}
              className="input-field w-28 font-mono text-sm"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Colors your customers&apos; board
          </p>
        </label>
      </div>

      <div className="mt-5 border-t border-zinc-100 pt-4">
        <span className="field-label flex items-center gap-1.5">
          <BadgePercent className="size-3.5" aria-hidden />
          Loyalty exchange rate
        </span>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <input
            type="number"
            min={1}
            max={100}
            value={pointsPerDiscount}
            onChange={(e) => setPointsPerDiscount(Number(e.target.value))}
            className="input-field w-20"
            aria-label="Points required"
          />
          <span>points =</span>
          <input
            type="number"
            min={1}
            max={100}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
            className="input-field w-20"
            aria-label="Discount percent"
          />
          <span>% discount code</span>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Customers earn 1 point per play that doesn&apos;t hit a reward.
        </p>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-4">
        {busy ? (
          "Saving…"
        ) : saved ? (
          <>
            <Check className="size-4" aria-hidden /> Saved
          </>
        ) : (
          "Save settings"
        )}
      </button>
    </form>
  );
}

function RedeemBox({ onRedeemed }: { onRedeemed: () => Promise<void> }) {
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
        `Redeemed: ${body.description} (customer: ${body.customer_email})`
      );
      setCode("");
      // Tile rewards get reshuffled server-side on redemption; refresh the map.
      await onRedeemed();
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
      setResult(reason ?? "Couldn't redeem that code.");
    }
  }

  return (
    <form onSubmit={redeem} className="card mt-4 p-4 sm:p-5">
      <h2 className="section-title">
        <Ticket className="size-3.5" aria-hidden />
        Redeem a customer code
      </h2>
      <div className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7M2XQ"
          maxLength={6}
          className="input-field w-40 text-center font-mono text-lg tracking-[0.25em]"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="btn-primary px-4 py-2"
        >
          {busy ? "Checking…" : "Redeem"}
        </button>
      </div>
      {result && (
        <p className={`mt-3 ${ok ? "alert-success" : "alert-error"}`}>{result}</p>
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
    <section className="card mt-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">
          <Gift className="size-3.5" aria-hidden />
          Active grid · {grid.rows}×{grid.cols} · {revealedCount}/{tiles.length}{" "}
          tiles revealed
        </h2>
        <button onClick={onReset} className="btn-secondary px-3 py-1.5 text-sm">
          <RefreshCw className="size-4" aria-hidden />
          Reset grid
        </button>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        Highlighted tiles hide your rewards — only you can see this map. Reward
        positions shuffle every time a code is redeemed.
      </p>
      <div
        className="mt-4 grid max-w-xl gap-1"
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
                "flex aspect-square items-center justify-center rounded-md " +
                (t?.is_revealed
                  ? "bg-zinc-100 text-zinc-300 ring-1 ring-zinc-200"
                  : t?.reward_id
                    ? "bg-amber-100 text-amber-600 shadow-[0_0_10px_rgb(245_158_11/0.2)] ring-1 ring-amber-300"
                    : "bg-zinc-50 ring-1 ring-zinc-200")
              }
            >
              {t?.is_revealed ? (
                <X className="size-3.5" aria-hidden />
              ) : t?.reward_id ? (
                <Gift className="size-3.5" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-zinc-700">
        {rewards.map((r) => (
          <li key={r.id} className="flex items-center gap-1.5">
            <Gift className="size-4 shrink-0 text-amber-500" aria-hidden />
            {r.description}{" "}
            <span className="text-zinc-400">
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
          too_many_rewards: `Your ${tier} tier allows up to ${limits.maxRewards} rewards.`,
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
    <form onSubmit={submit} className="card mt-4 p-4 sm:p-5">
      <h2 className="section-title">
        <Gift className="size-3.5" aria-hidden />
        {hasActiveGrid ? "Reset grid" : "Create your grid"}
      </h2>
      {hasActiveGrid && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Resetting archives the current grid; already-issued codes stay valid.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {(["rows", "cols"] as const).map((dim) => (
          <label key={dim} className="block">
            <span className="field-label">
              {dim === "rows" ? "Rows" : "Columns"}
            </span>
            <input
              type="number"
              min={limits.minGrid}
              max={limits.maxGrid}
              value={dim === "rows" ? rows : cols}
              disabled={limits.minGrid === limits.maxGrid}
              onChange={(e) =>
                (dim === "rows" ? setRows : setCols)(Number(e.target.value))
              }
              className="input-field w-24"
            />
          </label>
        ))}
        <p className="self-end pb-2 text-xs text-zinc-400">
          {tier === "free"
            ? "Free tier: fixed 5×5, up to 2 rewards. Upgrade for up to 20×20."
            : "Premium: 5×5 up to 20×20."}
        </p>
      </div>

      <h3 className="field-label mt-5">
        Rewards ({drafts.length}/{limits.maxRewards})
      </h3>
      {drafts.map((d, i) => (
        <div key={i} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block grow">
            <span className="field-label">Description</span>
            <input
              required
              value={d.description}
              onChange={(e) => setDraft(i, { description: e.target.value })}
              placeholder="Free plate of jollof rice"
              className="input-field"
            />
          </label>
          <label className="block">
            <span className="field-label">Expires (hours)</span>
            <input
              type="number"
              min={1}
              max={720}
              value={d.expiryHours}
              onChange={(e) => setDraft(i, { expiryHours: Number(e.target.value) })}
              className="input-field w-24"
            />
          </label>
          <label className="block">
            <span className="field-label">Winners</span>
            <input
              type="number"
              min={1}
              max={400}
              value={d.maxRedemptions}
              onChange={(e) =>
                setDraft(i, { maxRedemptions: Number(e.target.value) })
              }
              className="input-field w-20"
            />
          </label>
          {drafts.length > 1 && (
            <button
              type="button"
              onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
              className="btn-secondary px-3 py-2.5 text-sm text-rose-500"
              aria-label="Remove reward"
            >
              <X className="size-4" aria-hidden />
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
          className="btn-secondary mt-3 px-3 py-1.5 text-sm"
        >
          <Plus className="size-4" aria-hidden />
          Add reward
        </button>
      )}

      {error && <p className="alert-error mt-4">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Building…" : hasActiveGrid ? "Archive & create new grid" : "Create grid"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function CustomersList({
  customers,
  pointsPerDiscount,
  discountPercent,
}: {
  customers: CustomerSummary[];
  pointsPerDiscount: number;
  discountPercent: number;
}) {
  return (
    <section className="card mt-4 p-4 sm:p-5">
      <h2 className="section-title">
        <Users className="size-3.5" aria-hidden />
        Customers ({customers.length})
      </h2>
      <p className="mt-1.5 text-xs text-zinc-500">
        Everyone who has played your grid, with their points and what they can
        redeem. Your rate: {pointsPerDiscount} points = {discountPercent}% off.
      </p>
      {customers.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          No players yet — share your link to get the hunt going.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Points</th>
                <th className="py-2 pr-4 font-medium">Discount ready</th>
                <th className="py-2 pr-4 font-medium">Active rewards</th>
                <th className="py-2 font-medium">Next play</th>
              </tr>
            </thead>
            <tbody className="text-zinc-700">
              {customers.map((c) => (
                <tr
                  key={c.email}
                  className="border-t border-zinc-100 transition hover:bg-zinc-50"
                >
                  <td className="py-2.5 pr-4">{c.email}</td>
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                      <Star className="size-3.5 fill-current" aria-hidden />
                      {c.loyaltyPoints}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    {c.pointsToDiscount === 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        ready now
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                        <Hourglass className="size-3.5" aria-hidden />
                        {c.pointsToDiscount} pts · ~{formatEta(c.discountReadyAt)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    {c.activeCodes.length === 0 ? (
                      <span className="text-zinc-300">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {c.activeCodes.map((code, i) => (
                          <li key={i} className="text-xs">
                            {code.description}{" "}
                            <span className="text-zinc-400">
                              · expires {formatEta(code.expiresAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-2.5 text-xs text-zinc-500">
                    {c.nextPlayAt ? formatEta(c.nextPlayAt) : "now"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UnlocksList({ unlocks }: { unlocks: UnlockRow[] }) {
  if (unlocks.length === 0) return null;
  return (
    <section className="card mt-4 p-4 sm:p-5">
      <h2 className="section-title">
        <Ticket className="size-3.5" aria-hidden />
        Recent unlocks
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="py-2 pr-4 font-medium">Reward</th>
              <th className="py-2 pr-4 font-medium">Customer</th>
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody className="text-zinc-700">
            {unlocks.map((u) => (
              <tr
                key={u.id}
                className="border-t border-zinc-100 transition hover:bg-zinc-50"
              >
                <td className="py-2.5 pr-4">
                  {u.reward_type === "loyalty_discount"
                    ? `${u.discount_percent}% loyalty discount`
                    : (u.rewards?.description ?? "Tile reward")}
                </td>
                <td className="py-2.5 pr-4">{u.customers?.email ?? "—"}</td>
                {/* Codes are masked: staff must get the full code from the
                    customer, which is the whole anti-fraud point. */}
                <td className="py-2.5 pr-4 font-mono text-zinc-400">
                  ••••{u.redemption_code.slice(-2)}
                </td>
                <td className="py-2.5 pr-4">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (u.status === "redeemed"
                        ? "bg-emerald-100 text-emerald-700"
                        : u.status === "expired" || u.isExpired
                          ? "bg-zinc-100 text-zinc-500"
                          : "bg-amber-100 text-amber-700")
                    }
                  >
                    {u.status === "unredeemed" && u.isExpired
                      ? "expired"
                      : u.status}
                  </span>
                </td>
                <td className="py-2.5 text-zinc-500">
                  {new Date(u.expires_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
