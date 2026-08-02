"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Gamepad2,
  Gift,
  Hammer,
  Home,
  Palette,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import type {
  CustomerSummary,
  MerchantPlan,
  MerchantStats,
  RewardTemplate,
} from "@/lib/types";
import type { GameSummary } from "@/lib/games/types";
import {
  completionItems,
  completionPercent,
  type BusinessProfile,
} from "@/lib/business/profile";
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
import {
  GamesHighlight,
  GamesManager,
} from "@/components/dashboard/games-manager";
import { GameWizard } from "@/components/dashboard/game-wizard";
import { GameEditor } from "@/components/dashboard/game-editor";
import { BusinessProfileCard } from "@/components/dashboard/business-profile";
import { RewardsManager } from "@/components/dashboard/rewards-manager";
import { BrandSettings } from "@/components/dashboard/brand-settings";
import { CustomersList } from "@/components/dashboard/customers-list";
import { UnlocksList } from "@/components/dashboard/unlocks-list";
import { OnboardingForm } from "@/components/dashboard/onboarding-form";

type Tab = "home" | "build" | "customers" | "plans" | "settings";
type BuildSub = "games" | "rewards";

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
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [plan, setPlan] = useState<MerchantPlan | null>(null);
  const [hasReward, setHasReward] = useState(false);
  const [rewardTemplates, setRewardTemplates] = useState<RewardTemplate[]>([]);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [profile, setProfile] = useState<BusinessProfile>({});
  const [editingGame, setEditingGame] = useState<GameSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [buildSub, setBuildSub] = useState<BuildSub>("games");
  const [showGameWizard, setShowGameWizard] = useState(false);
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
      unlocks: [],
      customers: [],
      stats: null,
      plan: null,
      hasReward: false,
      rewardTemplates: [],
      games: [],
      profile: {},
      loadError: null,
    };

    const { data: m, error: merchantError } = await supabase
      .from("merchants")
      .select(
        "id, business_name, slug, subscription_tier, premium_expires_at, logo_url, tagline, brand_color, points_per_discount, discount_percent, whatsapp, contact_email, profile"
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

    const [{ data: u }, customersRes, statsRes, planRes, rewardsRes, gamesRes] =
      await Promise.all([
        supabase
          .from("unlocked_rewards")
          .select(
            "id, redemption_code, reward_type, discount_percent, status, unlocked_at, expires_at, rewards(description), game_prizes(description), customers(email)"
          )
          .eq("merchant_id", m.id)
          .order("unlocked_at", { ascending: false })
          .limit(25),
        fetch("/api/merchant/customers").then((res) =>
          res.ok ? res.json() : { customers: [] }
        ),
        fetch("/api/merchant/stats").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/merchant/plan").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/merchant/reward-templates").then((res) =>
          res.ok ? res.json() : { rewards: [] }
        ),
        fetch("/api/merchant/games").then((res) =>
          res.ok ? res.json() : { games: [] }
        ),
      ]);
    const now = Date.now();
    snap.unlocks = ((u as unknown as Omit<UnlockRow, "isExpired">[]) ?? []).map(
      (row) => ({ ...row, isExpired: new Date(row.expires_at).getTime() < now })
    );
    snap.customers = (customersRes?.customers as CustomerSummary[]) ?? [];
    snap.stats = (statsRes as MerchantStats | null) ?? null;
    snap.plan = (planRes as MerchantPlan | null) ?? null;
    snap.rewardTemplates = (rewardsRes?.rewards as RewardTemplate[]) ?? [];
    snap.hasReward = snap.rewardTemplates.length > 0;
    snap.games = (gamesRes?.games as GameSummary[]) ?? [];
    snap.profile = ((m as { profile?: BusinessProfile }).profile ?? {}) as BusinessProfile;
    return snap;
  }, []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    setMerchant(snap.merchant);
    setUnlocks(snap.unlocks);
    setCustomers(snap.customers);
    setStats(snap.stats);
    setPlan(snap.plan);
    setHasReward(snap.hasReward);
    setRewardTemplates(snap.rewardTemplates);
    setGames(snap.games);
    setProfile(snap.profile);
    setLoadError(snap.loadError);
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    const snap = await fetchAll();
    if (snap === "unauthenticated") {
      router.push("/signup");
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
      let payError: string | null = null;
      if (ref) {
        const res = await fetch("/api/merchant/upgrade/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref }),
        });
        const body = await res.json().catch(() => null);
        outcome = (body?.result as string) ?? null;
        payError = (body?.error as string) ?? null;
        window.history.replaceState(null, "", "/dashboard");
      }
      const snap = await fetchAll();
      if (ignore) return;
      if (snap === "unauthenticated") {
        router.push("/signup");
        return;
      }
      applySnapshot(snap);
      if (ref) {
        setBanner(
          outcome === "upgraded"
            ? "Payment confirmed — your Premium year is active! 🎉"
            : outcome === "topped_up"
              ? "Payment confirmed — your extra plays are ready! 🎉"
              : payError === "payment_pending"
                ? "Payment received — we're confirming it now. Your account updates automatically the moment it clears."
                : "We couldn't confirm that payment yet. If you were charged, it's applied automatically once it clears."
        );
        setTab("plans");
      }
    };
    verifyThenLoad();
    return () => {
      ignore = true;
    };
  }, [fetchAll, router, applySnapshot]);

  // Keep the dashboard live: new customers, plays, redemptions, and deletions
  // show up on their own. Unlike load(), a background poll never redirects to
  // login on a transient auth blip — that would log the merchant out for no
  // reason — it just skips the update.
  const refreshSilently = useCallback(async () => {
    const snap = await fetchAll();
    if (snap === "unauthenticated") return;
    applySnapshot(snap);
  }, [fetchAll, applySnapshot]);
  useAutoRefresh(
    useCallback(() => {
      if (!loading) void refreshSilently();
    }, [loading, refreshSilently])
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <span className="animate-pulse">Loading dashboard…</span>
      </main>
    );
  }

  const tier = merchant ? effectiveTierNow(merchant) : "free";

  const openGameWizard = () => {
    setTab("build");
    setBuildSub("games");
    setShowGameWizard(true);
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
            router.push("/signup");
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
        ) : editingGame ? (
          <GameEditor
            game={editingGame}
            brandColor={merchant.brand_color}
            onSaved={load}
            onCancel={() => setEditingGame(null)}
          />
        ) : showGameWizard ? (
          <GameWizard
            tier={tier}
            brandColor={merchant.brand_color}
            businessName={merchant.business_name}
            profile={profile}
            rewardTemplates={rewardTemplates}
            onDone={async () => {
              setShowGameWizard(false);
              setTab("build");
              setBuildSub("games");
              await load();
            }}
            onCancel={() => setShowGameWizard(false)}
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
                  hasReward={hasReward}
                  hasGame={games.length > 0}
                  hasProfile={Boolean(profile.industry)}
                  profilePercent={completionPercent(
                    completionItems(profile, merchant, {
                      hasReward,
                      hasGame: games.length > 0,
                    })
                  )}
                  onCreateReward={() => {
                    setTab("build");
                    setBuildSub("rewards");
                  }}
                  onCreateGame={openGameWizard}
                  onOpenSettings={() => setTab("settings")}
                />
                <GamesHighlight
                  games={games}
                  onNewGame={openGameWizard}
                  onManage={() => {
                    setTab("build");
                    setBuildSub("games");
                  }}
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
                      { key: "games", label: "Games", icon: Gamepad2 },
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

                {buildSub === "games" ? (
                  <GamesManager
                    games={games}
                    tier={tier}
                    merchantSlug={merchant.slug}
                    brandColor={merchant.brand_color}
                    onNewGame={() => setShowGameWizard(true)}
                    onEditGame={setEditingGame}
                    onChanged={load}
                  />
                ) : (
                  <RewardsManager onChanged={load} />
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
                <BusinessProfileCard
                  merchant={merchant}
                  profile={profile}
                  hasReward={hasReward}
                  hasGame={games.length > 0}
                  onSaved={async (created) => {
                    await load();
                    if (created > 0) {
                      setBanner(
                        `We built ${created} game${created === 1 ? "" : "s"} from your answers — have a look under Build → Games.`
                      );
                      setTab("build");
                      setBuildSub("games");
                    }
                  }}
                />
                <BrandSettings merchant={merchant} onSaved={load} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
