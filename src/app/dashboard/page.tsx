"use client";

// The contributor dashboard.
//
// Four tabs, and that's the whole product: what you've got up, build another,
// who's attacking them, and what you've made. There is no plan to upgrade, no
// catalogue to curate, and no customers to manage — a contributor puts a
// reward behind a password and shares a link.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Hammer, Swords, Vault, Wallet } from "lucide-react";
import { Boxy } from "@/components/art/boxy";
import { usePlayer } from "@/components/player/player-context";
import { VerifyDialog } from "@/components/player/account-dialog";
import type {
  HuntRow,
  ContributorEarnings,
  ContributorPayout,
  ContributorProfile,
  OwnedBox,
  WinnerRow,
} from "@/lib/types";
import { ProfileSetup } from "@/components/dashboard/profile-setup";
import { BoxesPanel } from "@/components/dashboard/boxes-panel";
import { BuildChooser } from "@/components/dashboard/build-chooser";
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
  powerUpKobo: 0,
  lifeKobo: 0,
  livesSold: 0,
  platformKobo: 0,
  sharePercent: 70,
  paidKobo: 0,
  owedKobo: 0,
};

export default function DashboardPage() {
  const { player, ready, verified } = usePlayer();
  const [signIn, setSignIn] = useState(false);
  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("boxes");

  const [boxes, setBoxes] = useState<OwnedBox[]>([]);
  const [attempts, setAttempts] = useState<HuntRow[]>([]);
  const [earnings, setEarnings] = useState<ContributorEarnings>(NO_EARNINGS);
  const [payouts, setPayouts] = useState<ContributorPayout[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

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
      setAttempts(((await attemptRes.json()) as { attempts: HuntRow[] }).attempts);
    if (moneyRes.ok) {
      const money = (await moneyRes.json()) as {
        earnings: ContributorEarnings;
        winners: WinnerRow[];
        payouts: ContributorPayout[];
      };
      setEarnings(money.earnings);
      setWinners(money.winners);
      setPayouts(money.payouts ?? []);
    }
  }, []);

  useEffect(() => {
    if (!verified) return;
    async function run() {
      await load();
    }
    void run();
  }, [verified, load]);

  /**
   * Coming back from funding a box. The webhook will settle it too, but the
   * contributor is standing right here waiting to see the box go live.
   */
  useEffect(() => {
    if (!verified) return;
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
  }, [verified, load]);

  if (!ready) {
    return <p className="p-10 text-center text-sm text-zinc-500">Loading…</p>;
  }

  // One account for both halves of the product, so this is the same sign-in a
  // player meets on a box — not a second one with its own password.
  if (!verified) {
    return (
      <div className="mx-auto max-w-md px-4 py-14 text-center">
        <Boxy mood="cheer" className="mx-auto size-32" />
        <h1 className="mt-2 text-2xl font-black tracking-tight">Build a Spendbox</h1>
        <p className="mt-1 text-zinc-400">
          Same account you play with. Sign in and put a reward behind a password
          of your own.
        </p>
        <button
          type="button"
          onClick={() => setSignIn(true)}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky mt-5 rounded-2xl bg-brass px-6 py-3.5 text-ink"
        >
          Sign in
        </button>
        {signIn && <VerifyDialog onClose={() => setSignIn(false)} />}
      </div>
    );
  }

  if (!loaded) {
    return <p className="p-10 text-center text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
      <header className="flex items-center gap-3 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Boxy mood="happy" still className="size-8" />
          <span className="font-black tracking-tight">Spendbox</span>
        </Link>
        {profile && (
          <span className="hidden min-w-0 truncate text-sm text-zinc-400 sm:block">{profile.displayName}</span>
        )}
        <Link
          href="/me"
          className="ml-auto min-w-0 max-w-[45%] truncate rounded-xl border-2 border-white/12 bg-white/6 px-3 py-1.5 text-xs font-bold text-zinc-300 transition hover:border-brass/50"
        >
          {player.email}
        </Link>
      </header>

      {!profile ? (
        <ProfileSetup onDone={() => void load()} />
      ) : (
        <>
          <nav className="panel mb-4 flex gap-1 overflow-x-auto rounded-2xl p-1.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={
                  "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-bold transition active:translate-y-px " +
                  (tab === id
                    ? "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_3px_0_var(--brass-deep)]"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100")
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
            <BuildChooser
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
                payouts={payouts}
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
