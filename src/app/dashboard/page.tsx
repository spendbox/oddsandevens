"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Check,
  Copy,
  Crown,
  Gift,
  Hourglass,
  ImagePlus,
  Layers,
  Link2,
  LogOut,
  Mail,
  MessageCircle,
  Palette,
  Play,
  Plus,
  Puzzle,
  Shapes,
  Star,
  Store,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  SLUG_REGEX,
  TIER_LIMITS,
  TILE_SHAPES,
  type SubscriptionTier,
  type TileShape,
} from "@/lib/constants";
import type {
  CustomerSummary,
  GridStats,
  LibraryImage,
  RedeemResult,
} from "@/lib/types";

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
  whatsapp: string | null;
  contact_email: string | null;
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
  grids: GridStats[];
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
  const [grids, setGrids] = useState<GridStats[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const fetchAll = useCallback(async (): Promise<Snapshot | "unauthenticated"> => {
    // Created lazily (not during render) so the page can prerender without env vars.
    const supabase = supabaseBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "unauthenticated";

    const snap: Snapshot = {
      merchant: null,
      grids: [],
      unlocks: [],
      customers: [],
      loadError: null,
    };

    const { data: m, error: merchantError } = await supabase
      .from("merchants")
      .select(
        "id, business_name, slug, subscription_tier, logo_url, tagline, brand_color, points_per_discount, discount_percent, whatsapp, contact_email"
      )
      .maybeSingle();
    if (merchantError) {
      console.error("[dashboard] merchants query failed:", merchantError);
      snap.loadError =
        merchantError.code === "42703"
          ? "Your database schema is out of date — apply the latest migrations (supabase/migrations) and reload."
          : "Couldn't load your business profile. Reload to try again.";
      return snap;
    }
    snap.merchant = m as Merchant | null;
    if (!m) return snap;

    const [{ data: u }, customersRes, gridsRes] = await Promise.all([
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
      fetch("/api/merchant/grids").then((res) =>
        res.ok ? res.json() : { grids: [] }
      ),
    ]);
    const now = Date.now();
    snap.unlocks = ((u as unknown as Omit<UnlockRow, "isExpired">[]) ?? []).map(
      (row) => ({ ...row, isExpired: new Date(row.expires_at).getTime() < now })
    );
    snap.customers = (customersRes?.customers as CustomerSummary[]) ?? [];
    snap.grids = (gridsRes?.grids as GridStats[]) ?? [];
    return snap;
  }, []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    setMerchant(snap.merchant);
    setGrids(snap.grids);
    setUnlocks(snap.unlocks);
    setCustomers(snap.customers);
    setLoadError(snap.loadError);
    setLoading(false);
  }, []);

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

    // Returning from Paystack: verify the payment before the first load so
    // the tier is already premium when the snapshot arrives.
    const verifyThenLoad = async () => {
      const ref = new URLSearchParams(window.location.search).get(
        "payment_ref"
      );
      let upgraded = false;
      if (ref) {
        const res = await fetch("/api/merchant/upgrade/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref }),
        });
        upgraded = res.ok;
        window.history.replaceState(null, "", "/dashboard");
      }
      const snap = await fetchAll();
      if (ignore) return;
      if (snap === "unauthenticated") {
        router.push("/login");
        return;
      }
      applySnapshot(snap);
      if (ref) {
        setBanner(
          upgraded
            ? "Payment confirmed — welcome to Premium! 🎉"
            : "We couldn't confirm that payment. If you were charged, contact support."
        );
      }
    };
    verifyThenLoad();
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

  const activeGrids = grids.filter((g) => g.status === "active");
  const limits = merchant ? TIER_LIMITS[merchant.subscription_tier] : null;

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
            {merchant?.subscription_tier === "premium" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                <Crown className="size-3.5" aria-hidden /> Premium
              </span>
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

        {banner && (
          <div className="alert-success mt-4 flex items-center justify-between gap-3">
            {banner}
            <button onClick={() => setBanner(null)} aria-label="Dismiss">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {loadError ? (
          <div className="alert-error mt-6 max-w-xl px-4 py-3">{loadError}</div>
        ) : !merchant ? (
          <OnboardingForm onCreated={load} />
        ) : showWizard ? (
          <GridWizard
            tier={merchant.subscription_tier}
            willReplaceActive={
              merchant.subscription_tier === "free" && activeGrids.length > 0
            }
            onDone={async () => {
              setShowWizard(false);
              await load();
            }}
            onCancel={() => setShowWizard(false)}
          />
        ) : (
          <>
            <ShareLink slug={merchant.slug} tier={merchant.subscription_tier} />
            {merchant.subscription_tier === "free" && (
              <PremiumUpsell onUpgraded={load} />
            )}
            <RedeemBox onRedeemed={load} />
            <GridsManager
              grids={grids}
              tier={merchant.subscription_tier}
              activeCount={activeGrids.length}
              maxActive={limits!.maxActiveGrids}
              onNewGrid={() => setShowWizard(true)}
              onChanged={load}
            />
            <BrandSettings merchant={merchant} onSaved={load} />
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

function PremiumUpsell({ onUpgraded }: { onUpgraded: () => Promise<void> }) {
  const [priceKobo, setPriceKobo] = useState<number | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  void onUpgraded; // upgrade completes via the ?payment_ref= redirect flow

  useEffect(() => {
    let ignore = false;
    fetch("/api/merchant/upgrade")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (ignore || !body) return;
        setPriceKobo(body.premiumPriceKobo);
        setPaymentsEnabled(body.paymentsEnabled);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function upgrade() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant/upgrade", { method: "POST" });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.authorizationUrl) {
      window.location.href = body.authorizationUrl;
      return;
    }
    setBusy(false);
    setError(
      body?.error === "payments_not_configured"
        ? "Payments aren't configured yet — set PAYSTACK_SECRET_KEY on the server."
        : "Couldn't start the payment. Try again."
    );
  }

  return (
    <div className="card mt-4 flex flex-wrap items-center justify-between gap-4 border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 sm:p-5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
          <Crown className="size-4" aria-hidden />
          Go Premium
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          Up to 20×20 grids, 10 rewards, 5 grids running at once, custom puzzle
          images, and premium tile shapes.
        </p>
        {error && <p className="alert-error mt-2">{error}</p>}
      </div>
      <button
        onClick={upgrade}
        disabled={busy || !paymentsEnabled}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        title={paymentsEnabled ? undefined : "Payments not configured"}
      >
        <Crown className="size-4" aria-hidden />
        {busy
          ? "Redirecting…"
          : priceKobo !== null
            ? `Upgrade — ₦${(priceKobo / 100).toLocaleString()}`
            : "Upgrade"}
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
  const [whatsapp, setWhatsapp] = useState(merchant.whatsapp ?? "");
  const [contactEmail, setContactEmail] = useState(merchant.contact_email ?? "");
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
    form.set("whatsapp", whatsapp);
    form.set("contactEmail", contactEmail);
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
          invalid_whatsapp:
            "WhatsApp number should be digits (with optional +), e.g. +2348012345678.",
          invalid_contact_email: "Contact email doesn't look valid.",
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
            PNG, JPEG, or WebP, up to 1 MB. Shown on your board&apos;s splash
            screen.
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

      <div className="mt-5 grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label flex items-center gap-1.5">
            <MessageCircle className="size-3.5" aria-hidden />
            WhatsApp number
          </span>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+234 801 234 5678"
            className="input-field"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Customers reach you via the board&apos;s contact button.
          </p>
        </label>
        <label className="block">
          <span className="field-label flex items-center gap-1.5">
            <Mail className="size-3.5" aria-hidden />
            Contact email
          </span>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@yourbusiness.com"
            className="input-field"
          />
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

// ---------------------------------------------------------------------------
// Grids manager: every grid ever created, with stats and status controls.
// ---------------------------------------------------------------------------

function GridsManager({
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

  return (
    <section className="card mt-4 p-4 sm:p-5">
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
      {tier === "premium" && (
        <p className="mt-1.5 text-xs text-zinc-500">
          Active grids all appear on your customer page — players scroll
          between them.
        </p>
      )}
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
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GridCard({
  grid,
  busy,
  onSetStatus,
}: {
  grid: GridStats;
  busy: boolean;
  onSetStatus: (id: string, status: "active" | "archived") => Promise<void>;
}) {
  const [showMap, setShowMap] = useState(false);
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
                (grid.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-zinc-100 text-zinc-500")
              }
            >
              {grid.status}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {grid.rows}×{grid.cols} · {grid.tileShape} tiles ·{" "}
            {grid.revealedCount}/{grid.tileCount} revealed ·{" "}
            <span className="font-medium text-zinc-700">
              {grid.redeemedCount} redeemed
            </span>{" "}
            of {grid.unlockedCount} won
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMap((s) => !s)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {showMap ? "Hide map" : "Reward map"}
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
        </div>
      </div>
      {showMap && <RewardMap gridId={grid.id} rows={grid.rows} cols={grid.cols} />}
    </li>
  );
}

// Lazily loads the merchant-only reward map for one grid (RLS lets owners
// read their own tiles).
function RewardMap({
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
        shuffle every time a code is redeemed.
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

// ---------------------------------------------------------------------------
// Grid creation wizard: Basics → Look → Rewards → Review.
// ---------------------------------------------------------------------------

const WIZARD_STEPS = ["Basics", "Look", "Rewards", "Review"] as const;

function GridWizard({
  tier,
  willReplaceActive,
  onDone,
  onCancel,
}: {
  tier: SubscriptionTier;
  willReplaceActive: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const limits = TIER_LIMITS[tier];
  const isPremium = tier === "premium";

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [tileShape, setTileShape] = useState<TileShape>("square");
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const customImageRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<RewardDraft[]>([
    { description: "", expiryHours: 48, maxRedemptions: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/images")
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then((body) => {
        if (!ignore) setLibrary((body?.images as LibraryImage[]) ?? []);
      });
    return () => {
      ignore = true;
    };
  }, []);

  function setDraft(i: number, patch: Partial<RewardDraft>) {
    setDrafts((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (
        !Number.isInteger(rows) ||
        !Number.isInteger(cols) ||
        rows < limits.minGrid ||
        rows > limits.maxGrid ||
        cols < limits.minGrid ||
        cols > limits.maxGrid
      ) {
        return `Grid size must be between ${limits.minGrid}×${limits.minGrid} and ${limits.maxGrid}×${limits.maxGrid}.`;
      }
    }
    if (step === 2) {
      if (drafts.some((d) => !d.description.trim())) {
        return "Every reward needs a description.";
      }
      const total = drafts.reduce((s, d) => s + d.maxRedemptions, 0);
      if (total > rows * cols) {
        return "More reward redemptions than tiles — shrink the rewards or grow the grid.";
      }
    }
    return null;
  }

  function next() {
    const v = validateStep();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("rows", String(rows));
    form.set("cols", String(cols));
    form.set("title", title);
    form.set("tileShape", tileShape);
    form.set("rewards", JSON.stringify(drafts));
    const custom = customImageRef.current?.files?.[0];
    if (custom) form.set("image", custom);
    else if (imageUrl) form.set("imageUrl", imageUrl);

    const res = await fetch("/api/merchant/grid", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        {
          grid_size_not_allowed: `Your ${tier} tier allows ${limits.minGrid}×${limits.minGrid}${limits.maxGrid > limits.minGrid ? ` up to ${limits.maxGrid}×${limits.maxGrid}` : ""} grids.`,
          too_many_rewards: `Your ${tier} tier allows up to ${limits.maxRewards} rewards.`,
          too_many_active_grids: `You already have the maximum number of active grids — archive one first.`,
          invalid_reward: "Each reward needs a description and sensible numbers.",
          rewards_exceed_tiles:
            "More reward redemptions than tiles — shrink the rewards or grow the grid.",
          no_rewards: "Add at least one reward.",
          shape_requires_premium: "Puzzle tile shapes are a Premium feature.",
          custom_image_requires_premium: "Custom images are a Premium feature.",
          invalid_image: "Pick an image from the library.",
          invalid_image_type: "Image must be PNG, JPEG, or WebP.",
          image_too_large: "Image must be under 3 MB.",
        }[String(body?.error)] ?? "Couldn't create the grid."
      );
      return;
    }
    await onDone();
  }

  const totalRewardTiles = drafts.reduce((s, d) => s + d.maxRedemptions, 0);

  return (
    <section className="card mt-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
          <Gift className="size-5 text-emerald-600" aria-hidden />
          New grid
        </h2>
        <button onClick={onCancel} className="btn-ghost" aria-label="Cancel">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Step indicator */}
      <ol className="mt-4 flex items-center gap-2">
        {WIZARD_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold " +
                (i < step
                  ? "bg-emerald-600 text-white"
                  : i === step
                    ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-600"
                    : "bg-zinc-100 text-zinc-400")
              }
            >
              {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={
                "text-xs font-medium " +
                (i === step ? "text-zinc-900" : "text-zinc-400")
              }
            >
              {label}
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <span className="h-px w-4 bg-zinc-200 sm:w-8" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      {willReplaceActive && step === 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          On the free tier a new grid replaces your current one (already-issued
          codes stay valid). Go Premium to run up to 5 grids at once.
        </p>
      )}

      {/* Step 1: basics */}
      {step === 0 && (
        <div className="mt-5 max-w-md space-y-4">
          <label className="block">
            <span className="field-label">Grid name (customers see this)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="July jollof hunt"
              className="input-field"
            />
          </label>
          <div className="flex gap-3">
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
                ? "Free: fixed 5×5. Premium: up to 20×20."
                : "5×5 up to 20×20."}
            </p>
          </div>
        </div>
      )}

      {/* Step 2: look */}
      {step === 1 && (
        <div className="mt-5 space-y-5">
          <div>
            <span className="field-label">Puzzle image (optional)</span>
            <p className="text-xs text-zinc-500">
              Each revealed tile uncovers a piece of this image.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setImageUrl(null);
                  setCustomPreview(null);
                  if (customImageRef.current) customImageRef.current.value = "";
                }}
                className={
                  "flex size-20 items-center justify-center rounded-lg border-2 text-xs " +
                  (!imageUrl && !customPreview
                    ? "border-emerald-600 text-emerald-700"
                    : "border-zinc-200 text-zinc-400 hover:border-zinc-300")
                }
              >
                None
              </button>
              {library.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  title={img.title}
                  onClick={() => {
                    setImageUrl(img.url);
                    setCustomPreview(null);
                    if (customImageRef.current) customImageRef.current.value = "";
                  }}
                  className={
                    "size-20 overflow-hidden rounded-lg border-2 " +
                    (imageUrl === img.url
                      ? "border-emerald-600"
                      : "border-zinc-200 hover:border-zinc-300")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- library image host not known at build time */}
                  <img src={img.url} alt={img.title} className="size-full object-cover" />
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  isPremium ? customImageRef.current?.click() : undefined
                }
                disabled={!isPremium}
                title={
                  isPremium ? "Upload your own image" : "Custom images are Premium"
                }
                className={
                  "relative flex size-20 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed " +
                  (customPreview
                    ? "border-emerald-600"
                    : isPremium
                      ? "border-zinc-300 text-zinc-400 hover:border-emerald-500 hover:text-emerald-600"
                      : "cursor-not-allowed border-zinc-200 text-zinc-300")
                }
              >
                {customPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img src={customPreview} alt="Custom" className="size-full object-cover" />
                ) : (
                  <ImagePlus className="size-6" aria-hidden />
                )}
                {!isPremium && (
                  <Crown className="absolute right-1 top-1 size-3.5 text-amber-500" aria-hidden />
                )}
              </button>
              <input
                ref={customImageRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCustomPreview(URL.createObjectURL(f));
                    setImageUrl(null);
                  }
                }}
              />
            </div>
            {library.length === 0 && (
              <p className="mt-2 text-xs text-zinc-400">
                No free images in the library yet
                {isPremium ? " — upload your own." : "."}
              </p>
            )}
          </div>

          <div>
            <span className="field-label flex items-center gap-1.5">
              <Shapes className="size-3.5" aria-hidden />
              Tile shape {!isPremium && "(Premium)"}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {TILE_SHAPES.map((shape) => {
                const locked = shape !== "square" && !isPremium;
                return (
                  <button
                    key={shape}
                    type="button"
                    disabled={locked}
                    onClick={() => setTileShape(shape)}
                    className={
                      "relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs capitalize " +
                      (tileShape === shape
                        ? "border-emerald-600 text-emerald-700"
                        : locked
                          ? "cursor-not-allowed border-zinc-200 text-zinc-300"
                          : "border-zinc-200 text-zinc-500 hover:border-zinc-300")
                    }
                  >
                    <span
                      className={`block size-8 bg-emerald-500 ${
                        shape === "square" ? "rounded-md" : `tile-shape-${shape}`
                      }`}
                      aria-hidden
                    />
                    {shape}
                    {locked && (
                      <Crown className="absolute right-1 top-1 size-3.5 text-amber-500" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: rewards */}
      {step === 2 && (
        <div className="mt-5">
          <span className="field-label">
            Rewards ({drafts.length}/{limits.maxRewards})
          </span>
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
                  onChange={(e) =>
                    setDraft(i, { expiryHours: Number(e.target.value) })
                  }
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
        </div>
      )}

      {/* Step 4: review */}
      {step === 3 && (
        <div className="mt-5 max-w-md">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Name</dt>
              <dd className="font-medium text-zinc-900">
                {title || `${rows}×${cols} grid`}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Size</dt>
              <dd className="font-medium text-zinc-900">
                {rows}×{cols} ({rows * cols} tiles)
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Tile shape</dt>
              <dd className="font-medium capitalize text-zinc-900">{tileShape}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Puzzle image</dt>
              <dd className="font-medium text-zinc-900">
                {customPreview ? "Custom upload" : imageUrl ? "From library" : "None"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Rewards</dt>
              <dd className="text-right font-medium text-zinc-900">
                {drafts.map((d, i) => (
                  <span key={i} className="block">
                    {d.description} ({d.maxRedemptions}x, {d.expiryHours}h)
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Winning tiles</dt>
              <dd className="font-medium text-zinc-900">
                {totalRewardTiles} of {rows * cols}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-zinc-400">
            Rewards are hidden on random tiles server-side — nobody (including
            you) can predict them, and they reshuffle after every redemption.
          </p>
        </div>
      )}

      {error && <p className="alert-error mt-4">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
          className="btn-secondary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < WIZARD_STEPS.length - 1 ? (
          <button type="button" onClick={next} className="btn-primary">
            Next
            <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? "Building…" : "Create grid"}
          </button>
        )}
      </div>
    </section>
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
