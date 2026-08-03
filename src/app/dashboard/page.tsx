"use client";

// The contributor dashboard.
//
// Four tabs, and that's the whole product: what you've got up, build another,
// who's attacking them, and what you've made. There is no plan to upgrade, no
// catalogue to curate, and no customers to manage — a contributor stakes a
// prize and shares a link.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hammer, Lock, LogOut, Swords, Vault, Wallet } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  AttemptRow,
  ContributorEarnings,
  ContributorProfile,
  OwnedBox,
  WinnerRow,
} from "@/lib/types";
import { ProfileSetup } from "@/components/dashboard/profile-setup";
import { BoxesPanel } from "@/components/dashboard/boxes-panel";
import { BuildPanel } from "@/components/dashboard/build-panel";
import { AttemptsPanel } from "@/components/dashboard/attempts-panel";
import { EarningsPanel } from "@/components/dashboard/earnings-panel";
import { PayoutPanel } from "@/components/dashboard/payout-panel";

type Tab = "boxes" | "build" | "attempts" | "money";

const TABS: { id: Tab; label: string; icon: typeof Vault }[] = [
  { id: "boxes", label: "Boxes", icon: Vault },
  { id: "build", label: "Build", icon: Hammer },
  { id: "attempts", label: "Attempts", icon: Swords },
  { id: "money", label: "Money", icon: Wallet },
];

const NO_EARNINGS: ContributorEarnings = {
  totalKobo: 0,
  last30dKobo: 0,
  powerUpsSold: 0,
  platformKobo: 0,
  sharePercent: 70,
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<"checking" | "in" | "out">("checking");
  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("boxes");

  const [boxes, setBoxes] = useState<OwnedBox[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [earnings, setEarnings] = useState<ContributorEarnings>(NO_EARNINGS);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => setSession(data.session ? "in" : "out"));
  }, []);

  useEffect(() => {
    if (session === "out") router.replace("/signup");
  }, [session, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/contributor", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { profile: ContributorProfile | null };
    setProfile(body.profile);
    setLoaded(true);
    if (!body.profile) return;

    const [boxRes, attemptRes, moneyRes] = await Promise.all([
      fetch("/api/contributor/boxes", { cache: "no-store" }),
      fetch("/api/contributor/attempts", { cache: "no-store" }),
      fetch("/api/contributor/earnings", { cache: "no-store" }),
    ]);
    if (boxRes.ok) setBoxes(((await boxRes.json()) as { boxes: OwnedBox[] }).boxes);
    if (attemptRes.ok)
      setAttempts(((await attemptRes.json()) as { attempts: AttemptRow[] }).attempts);
    if (moneyRes.ok) {
      const money = (await moneyRes.json()) as {
        earnings: ContributorEarnings;
        winners: WinnerRow[];
      };
      setEarnings(money.earnings);
      setWinners(money.winners);
    }
  }, []);

  useEffect(() => {
    if (session !== "in") return;
    async function run() {
      await load();
    }
    void run();
  }, [session, load]);

  /**
   * Coming back from funding a box. The webhook will settle it too, but the
   * contributor is standing right here waiting to see the box go live.
   */
  useEffect(() => {
    if (session !== "in") return;
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) return;
    (async () => {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const body = (await res.json().catch(() => ({}))) as { result?: string };
      setNotice(
        body.result === "paid"
          ? "Paid. Your box is live — share the link."
          : "That payment hasn't cleared yet. It'll go live the moment it does."
      );
      await load();
      window.history.replaceState({}, "", "/dashboard");
    })();
  }, [session, load]);

  if (session === "checking" || !loaded) {
    return <p className="p-10 text-center text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
      <header className="flex items-center gap-3 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Lock className="size-5 text-brass" aria-hidden />
          Spendbox
        </Link>
        {profile && (
          <span className="truncate text-sm text-zinc-500">{profile.displayName}</span>
        )}
        <button
          type="button"
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            router.replace("/");
          }}
          className="ml-auto flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </header>

      {!profile ? (
        <ProfileSetup onDone={() => void load()} />
      ) : (
        <>
          <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition " +
                  (tab === id
                    ? "bg-brass text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200")
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          {notice && (
            <p className="mb-4 rounded-xl border border-brass/30 bg-brass/10 px-4 py-3 text-sm text-brass">
              {notice}
            </p>
          )}

          {tab === "boxes" && (
            <BoxesPanel
              boxes={boxes}
              onBuild={() => setTab("build")}
              onChanged={() => void load()}
            />
          )}

          {tab === "build" && (
            <BuildPanel
              onBuilt={() => {
                void load();
                setTab("boxes");
              }}
            />
          )}

          {tab === "attempts" && <AttemptsPanel attempts={attempts} />}

          {tab === "money" && (
            <div className="space-y-4">
              <EarningsPanel
                earnings={earnings}
                winners={winners}
                connected={profile.payout.connected}
                onConnect={() => {
                  document
                    .getElementById("payout")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              />
              <div id="payout">
                <PayoutPanel profile={profile} onSaved={() => void load()} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
