"use client";

// The safe house.
//
// One page with four tabs rather than one page with eight stacked sections.
// The sections were all real and all wanted, and together they were a scroll
// nobody reached the bottom of — the bank details, which matter exactly once
// and matter enormously then, were below three screens of hunt history.
//
//   Hunts     lives, and every safe you've been at
//   Rewards   what you've won and where it got to
//   Invites   your link, and what it's earned
//   Account   bank details and your password

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Landmark, Swords, Trophy } from "lucide-react";
import { LIVES_MAX } from "@/lib/constants";
import { formatNaira, rewardLabel } from "@/lib/game/rewards";
import type { Design } from "@/lib/game/designs";
import { SafeArt } from "@/components/safe/safe-art";
import { plural } from "@/lib/plural";
import type { Bank } from "@/lib/types";
import { Boxy } from "@/components/art/boxy";
import { usePlayer } from "./player-context";
import { countdown, HeartArt, useNow } from "./lives-badge";
import { BuyLivesDialog } from "./buy-lives-dialog";
import { VerifyDialog } from "./account-dialog";
import { PrizeClaimForm, type Prize } from "./prize-claim-form";
import { InvitePanel } from "./invite-panel";
import { BankPanel } from "./bank-panel";
import { SecurityPanel } from "./security-panel";

interface HistoryHunt {
  id: string;
  attempts: number;
  won: boolean;
  startedAt: string;
  lastAttemptAt: string | null;
  title: string;
  slug: string | null;
  rewardKobo: number;
  design: Design;
  boxStatus: string;
  /** The platform's own box. Worth marking — it's where most people start. */
  isPublicBox: boolean;
}

type Tab = "hunts" | "rewards" | "invites" | "account";

const TABS: { id: Tab; label: string; icon: typeof Swords }[] = [
  { id: "hunts", label: "Hunts", icon: Swords },
  { id: "rewards", label: "Rewards", icon: Trophy },
  { id: "invites", label: "Invites", icon: Gift },
  { id: "account", label: "Account", icon: Landmark },
];

export function PlayerPortal({ pendingReference }: { pendingReference: string | null }) {
  const { player, verified, ready, refresh } = usePlayer();
  const now = useNow(player.nextLifeAt);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [hunts, setHunts] = useState<HistoryHunt[]>([]);
  const [tab, setTab] = useState<Tab>("hunts");
  const [dialog, setDialog] = useState<"none" | "verify" | "lives">("none");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [prizeRes, historyRes] = await Promise.all([
      fetch("/api/player/prizes", { cache: "no-store" }),
      fetch("/api/player/history", { cache: "no-store" }),
    ]);
    if (prizeRes.ok) {
      const body = (await prizeRes.json()) as { prizes: Prize[]; banks: Bank[] };
      setPrizes(body.prizes);
      setBanks(body.banks);
    }
    if (historyRes.ok) {
      setHunts(((await historyRes.json()) as { hunts: HistoryHunt[] }).hunts);
    }
  }, []);

  useEffect(() => {
    if (!verified) return;
    async function run() {
      await load();
    }
    void run();
  }, [verified, load]);

  // Coming back from a lives checkout: credit it now rather than waiting on
  // the webhook, then drop the reference so a refresh doesn't replay it.
  useEffect(() => {
    if (!pendingReference) return;
    (async () => {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: pendingReference }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        result?: string;
        quantity?: number;
      };
      if (body.result === "paid" && body.quantity) {
        setNotice(`${body.quantity} ${body.quantity === 1 ? "life" : "lives"} added.`);
      }
      await refresh();
      window.history.replaceState({}, "", "/me");
    })();
  }, [pendingReference, refresh]);

  if (!ready) {
    return <p className="p-8 text-center text-sm text-zinc-500">Loading…</p>;
  }

  if (!verified) {
    return (
      <div className="mx-auto max-w-md px-4 py-14 text-center">
        <Boxy mood="happy" className="mx-auto size-32" />
        <p className="mt-2 text-2xl font-black tracking-tight">Your safe house</p>
        <p className="mt-1 text-zinc-400">
          Sign in and this page shows your lives, every safe you’ve hunted,
          and any reward you’ve won.
        </p>
        <button
          type="button"
          onClick={() => setDialog("verify")}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky mt-5 rounded-2xl bg-brass px-6 py-3.5 text-ink"
        >
          Sign in
        </button>
        {dialog === "verify" && <VerifyDialog onClose={() => setDialog("none")} />}
      </div>
    );
  }

  const unclaimed = prizes.filter((p) => p.status === "unclaimed");
  const settled = prizes.filter((p) => p.status !== "unclaimed");
  const wonKobo = prizes.reduce((total, p) => total + p.amountKobo, 0);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Your safe house</h1>
        <p className="mt-1 break-all text-sm text-zinc-400">{player.email}</p>
      </header>

      {notice && (
        <p className="animate-fade-up rounded-2xl border-2 border-brass/50 bg-brass/15 px-3 py-2.5 text-sm font-bold text-brass">
          {notice}
        </p>
      )}

      {/* Lives sit above the tabs: it is the one number that matters on every
          one of them. */}
      <section className="panel flex items-center gap-4 rounded-3xl p-5">
        <HeartArt className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-3xl font-black tabular-nums">
            {player.lives}
            <span className="text-base font-bold text-zinc-500"> / {LIVES_MAX}</span>
          </p>
          {player.nextLifeAt && (
            <p className="text-sm text-zinc-400">
              Next life in {countdown(player.nextLifeAt, now)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDialog("lives")}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky shrink-0 rounded-2xl bg-brass px-4 py-2.5 text-sm text-ink"
        >
          Buy more
        </button>
      </section>

      <div role="tablist" className="panel flex gap-1 rounded-2xl p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-bold transition active:translate-y-px " +
              (tab === id
                ? "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_3px_0_var(--brass-deep)]"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100")
            }
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
            {id === "rewards" && unclaimed.length > 0 && (
              <span className="rounded-md bg-berry px-1.5 py-0.5 text-[10px] font-black text-ink">
                {unclaimed.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "hunts" && <Hunts hunts={hunts} />}

      {tab === "rewards" && (
        <div className="space-y-4">
          {prizes.length === 0 ? (
            <div className="panel rounded-3xl px-4 py-10 text-center">
              <Boxy mood="sly" className="mx-auto size-24" />
              <p className="mt-1 font-black tracking-tight">Nothing won yet.</p>
              <p className="mt-1 text-sm text-zinc-400">
                Crack a safe and the reward lands here.
              </p>
            </div>
          ) : (
            <div className="panel rounded-3xl p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                Won on Spendbox
              </p>
              <p className="brass-text mt-1 text-4xl font-black">
                {formatNaira(wonKobo)}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                across {plural(prizes.length, "safe")}
              </p>
            </div>
          )}

          {unclaimed.map((prize) => (
            <PrizeClaimForm
              key={prize.id}
              prize={prize}
              banks={banks}
              onDone={() => void load()}
            />
          ))}

          {settled.map((prize) => (
            <div
              key={prize.id}
              className="panel flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-bold">{prize.title}</p>
                <p className="text-xs text-zinc-400">
                  {prize.status === "paid"
                    ? `Sent to ${prize.accountName ?? "your account"}`
                    : `On its way to ${prize.accountName ?? "your account"}`}
                </p>
              </div>
              <span className="shrink-0 font-mono font-black text-brass">
                {formatNaira(prize.amountKobo)}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "invites" && <InvitePanel />}

      {tab === "account" && (
        <div className="space-y-4">
          <BankPanel />
          <SecurityPanel />
        </div>
      )}

      {dialog === "lives" && <BuyLivesDialog onClose={() => setDialog("none")} />}
    </div>
  );
}

function Hunts({ hunts }: { hunts: HistoryHunt[] }) {
  if (hunts.length === 0) {
    return (
      <div className="panel rounded-3xl px-4 py-10 text-center">
        <Boxy mood="happy" className="mx-auto size-24" />
        <p className="mt-1 font-black tracking-tight">No safes yet.</p>
        <Link
          href="/"
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky mt-4 inline-block rounded-2xl bg-brass px-5 py-3 text-ink"
        >
          Find one
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {hunts.map((hunt) => {
        // The whole row is the link, not the title inside it. A card with one
        // destination should have one target the size of the card.
        // Which safe this is, said twice over: the design on the left so a
        // regular recognises a row before reading it, and the money, which is
        // the reason any of these rows exist.
        const live = !hunt.won && hunt.boxStatus === "live";
        const body = (
          <>
            <SafeArt
              design={hunt.design}
              mood={hunt.boxStatus === "unlocked" || hunt.won ? "open" : "idle"}
              className="size-10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">
                {hunt.title}
                {hunt.isPublicBox && (
                  <span className="ml-2 text-[11px] font-semibold text-zinc-500">
                    by Spendbox
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-400">
                {plural(hunt.attempts, "attempt")} ·{" "}
                {new Date(hunt.lastAttemptAt ?? hunt.startedAt).toLocaleDateString()}
              </p>
            </div>
            <span className="shrink-0 text-right">
              <span
                className={
                  "block font-mono text-sm font-black tabular-nums " +
                  (live ? "text-brass" : "text-zinc-500")
                }
              >
                {rewardLabel(hunt.rewardKobo)}
              </span>
              <span
                className={
                  "mt-0.5 block rounded-lg px-2 py-0.5 text-[11px] font-black " +
                  (hunt.won
                    ? "bg-mint text-ink"
                    : live
                      ? "bg-brass text-ink"
                      : "bg-white/10 text-zinc-400")
                }
              >
                {hunt.won
                  ? "Cracked"
                  : live
                    ? "Still locked"
                    : hunt.boxStatus === "unlocked"
                      ? "Cracked"
                      : "Withdrawn"}
              </span>
            </span>
          </>
        );
        const shell =
          "panel flex items-center gap-3 rounded-2xl px-3 py-3";

        return (
          <li key={hunt.id}>
            {hunt.slug ? (
              <Link href={`/b/${hunt.slug}`} className={`${shell} panel-lift`}>
                {body}
              </Link>
            ) : (
              <div className={shell}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
