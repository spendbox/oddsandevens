"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Grid3x3, Hammer, Home, Palette, Users, Wallet, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { TIER_LIMITS } from "@/lib/constants";
import type {
  CustomerSummary,
  GridStats,
  MerchantPlan,
  MerchantStats,
} from "@/lib/types";
import {
  effectiveTierNow,
  type Merchant,
  type Snapshot,
  type UnlockRow,
} from "@/components/dashboard/shared";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatsSummary } from "@/components/dashboard/stats-summary";
import { GettingStarted } from "@/components/dashboard/getting-started";
import { ShareLink } from "@/components/dashboard/share-link";
import { PlaysWidget, PlansPanel } from "@/components/dashboard/plan";
import { RedeemBox } from "@/components/dashboard/redeem-box";
import { GridsManager } from "@/components/dashboard/grids-manager";
import { GridWizard } from "@/components/dashboard/grid-wizard";
import { RewardsManager } from "@/components/dashboard/rewards-manager";
import { BrandSettings } from "@/components/dashboard/brand-settings";
import { CustomersList } from "@/components/dashboard/customers-list";
import { UnlocksList } from "@/components/dashboard/unlocks-list";
import { OnboardingForm } from "@/components/dashboard/onboarding-form";

type Tab = "home" | "build" | "customers" | "plans" | "settings";
type BuildSub = "grids" | "rewards";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "build", label: "Build", icon: Hammer },
  { key: "customers", label: "Customers", icon: Users },
  { key: "plans", label: "Plans", icon: Wallet },
  { key: "settings", label: "Settings", icon: Palette },
];

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [grids, setGrids] = useState<GridStats[]>([]);
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [plan, setPlan] = useState<MerchantPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [buildSub, setBuildSub] = useState<BuildSub>("grids");
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
      stats: null,
      plan: null,
      loadError: null,
    };

    const { data: m, error: merchantError } = await supabase
      .from("merchants")
      .select(
        "id, business_name, slug, subscription_tier, premium_expires_at, logo_url, tagline, brand_color, points_per_discount, discount_percent, whatsapp, contact_email"
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

    const [{ data: u }, customersRes, gridsRes, statsRes, planRes] =
      await Promise.all([
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
        fetch("/api/merchant/stats").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/merchant/plan").then((res) => (res.ok ? res.json() : null)),
      ]);
    const now = Date.now();
    snap.unlocks = ((u as unknown as Omit<UnlockRow, "isExpired">[]) ?? []).map(
      (row) => ({ ...row, isExpired: new Date(row.expires_at).getTime() < now })
    );
    snap.customers = (customersRes?.customers as CustomerSummary[]) ?? [];
    snap.grids = (gridsRes?.grids as GridStats[]) ?? [];
    snap.stats = (statsRes as MerchantStats | null) ?? null;
    snap.plan = (planRes as MerchantPlan | null) ?? null;
    return snap;
  }, []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    setMerchant(snap.merchant);
    setGrids(snap.grids);
    setUnlocks(snap.unlocks);
    setCustomers(snap.customers);
    setStats(snap.stats);
    setPlan(snap.plan);
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

    // Returning from Paystack: verify the payment before the first load so the
    // tier / plays balance is already up to date when the snapshot arrives.
    const verifyThenLoad = async () => {
      const ref = new URLSearchParams(window.location.search).get(
        "payment_ref"
      );
      let outcome: string | null = null;
      if (ref) {
        const res = await fetch("/api/merchant/upgrade/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref }),
        });
        const body = await res.json().catch(() => null);
        outcome = res.ok ? (body?.result as string) : null;
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
          outcome === "upgraded"
            ? "Payment confirmed — your Premium year is active! 🎉"
            : outcome === "topped_up"
              ? "Payment confirmed — your extra plays are ready! 🎉"
              : "We couldn't confirm that payment. If you were charged, contact support."
        );
        if (outcome) setTab("plans");
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
  const tier = merchant ? effectiveTierNow(merchant) : "free";
  const limits = TIER_LIMITS[tier];

  const openWizard = () => {
    setTab("build");
    setBuildSub("grids");
    setShowWizard(true);
  };

  // The whole dashboard picks up the merchant's brand color.
  const brandStyle = {
    "--brand": merchant?.brand_color ?? "#059669",
  } as React.CSSProperties;

  return (
    <main className="min-h-screen p-4 pb-16 sm:p-6 lg:p-8" style={brandStyle}>
      <div className="animate-fade-up mx-auto max-w-6xl">
        <DashboardHeader
          merchant={merchant}
          onSignOut={async () => {
            await supabaseBrowser().auth.signOut();
            router.push("/login");
          }}
        />

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
            tier={tier}
            willReplaceActive={tier === "free" && activeGrids.length > 0}
            onDone={async () => {
              setShowWizard(false);
              setTab("build");
              setBuildSub("grids");
              await load();
            }}
            onCancel={() => setShowWizard(false)}
            onManageRewards={() => {
              setShowWizard(false);
              setTab("build");
              setBuildSub("rewards");
            }}
          />
        ) : (
          <>
            {/* Tab bar: full-width segments on phones, inline pills upward. */}
            <nav className="mt-6 grid grid-cols-5 gap-1 rounded-2xl border border-zinc-200 bg-white p-1 sm:inline-grid sm:auto-cols-max sm:grid-flow-col">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={
                    "flex cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition sm:flex-row sm:justify-center sm:gap-1.5 sm:px-4 sm:text-sm " +
                    (tab === key
                      ? "text-white shadow-sm"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800")
                  }
                  style={tab === key ? { backgroundColor: "var(--brand)" } : undefined}
                  aria-current={tab === key ? "page" : undefined}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </nav>

            {tab === "home" && (
              <div className="mt-6 space-y-6">
                <GettingStarted
                  merchant={merchant}
                  hasGrid={grids.length > 0}
                  onCreateGrid={openWizard}
                  onOpenSettings={() => setTab("settings")}
                />
                <ShareLink slug={merchant.slug} tier={tier} />
                <PlaysWidget plan={plan} onManage={() => setTab("plans")} />
                <StatsSummary stats={stats} />
                <RedeemBox onRedeemed={load} />
                <UnlocksList unlocks={unlocks} />
              </div>
            )}

            {tab === "build" && (
              <div className="mt-6 space-y-6">
                <div className="inline-flex gap-1 rounded-xl border border-zinc-200 bg-white p-1">
                  {(
                    [
                      { key: "grids", label: "Grids", icon: Grid3x3 },
                      { key: "rewards", label: "Rewards", icon: Gift },
                    ] as const
                  ).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setBuildSub(key)}
                      className={
                        "flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition " +
                        (buildSub === key
                          ? "text-white"
                          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800")
                      }
                      style={
                        buildSub === key
                          ? { backgroundColor: "var(--brand)" }
                          : undefined
                      }
                    >
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>

                {buildSub === "grids" ? (
                  <GridsManager
                    grids={grids}
                    tier={tier}
                    activeCount={activeGrids.length}
                    maxActive={limits.maxActiveGrids}
                    onNewGrid={() => setShowWizard(true)}
                    onChanged={load}
                  />
                ) : (
                  <RewardsManager />
                )}
              </div>
            )}

            {tab === "customers" && (
              <div className="mt-6 space-y-6">
                <CustomersList
                  customers={customers}
                  pointsPerDiscount={merchant.points_per_discount}
                  discountPercent={merchant.discount_percent}
                />
              </div>
            )}

            {tab === "plans" && (
              <div className="mt-6">
                <PlansPanel
                  plan={plan}
                  tier={tier}
                  premiumExpiresAt={merchant.premium_expires_at}
                />
              </div>
            )}

            {tab === "settings" && (
              <div className="mt-6 space-y-6">
                <BrandSettings merchant={merchant} onSaved={load} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
