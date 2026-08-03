"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Trophy } from "lucide-react";
import { LIVES_MAX } from "@/lib/constants";
import { formatNaira } from "@/lib/game/stakes";
import type { Bank } from "@/lib/types";
import { usePlayer } from "./player-context";
import { countdown, useNow } from "./lives-badge";
import { BuyLivesDialog } from "./buy-lives-dialog";
import { VerifyDialog } from "./verify-dialog";
import { PrizeClaimForm, type Prize } from "./prize-claim-form";

interface HistoryRun {
  id: string;
  status: "active" | "won" | "lost";
  guessesUsed: number;
  guessesAllowed: number;
  startedAt: string;
  title: string;
  slug: string | null;
  prizeKobo: number;
}

export function PlayerPortal({ pendingReference }: { pendingReference: string | null }) {
  const { player, verified, ready, refresh } = usePlayer();
  const now = useNow(player.nextLifeAt);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [runs, setRuns] = useState<HistoryRun[]>([]);
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
      setRuns(((await historyRes.json()) as { runs: HistoryRun[] }).runs);
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
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-zinc-400">
          Verify your email and this page will show your lives, your attempts,
          and any prize you&apos;ve won.
        </p>
        <button
          type="button"
          onClick={() => setDialog("verify")}
          className="mt-4 rounded-xl bg-brass px-5 py-2.5 font-semibold text-zinc-950 transition hover:bg-brass-bright"
        >
          Verify my email
        </button>
        {dialog === "verify" && <VerifyDialog onClose={() => setDialog("none")} />}
      </div>
    );
  }

  const unclaimed = prizes.filter((p) => p.status === "unclaimed");
  const settled = prizes.filter((p) => p.status !== "unclaimed");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Your safe house</h1>
        <p className="mt-1 text-sm text-zinc-500">{player.email}</p>
      </header>

      {notice && (
        <p className="rounded-xl border border-brass/30 bg-brass/10 px-3 py-2 text-sm text-brass">
          {notice}
        </p>
      )}

      <section className="panel flex items-center gap-4 rounded-2xl p-5">
        <Heart className="size-8 shrink-0 fill-brass text-brass" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold tabular-nums">
            {player.lives}
            <span className="text-base font-normal text-zinc-500"> / {LIVES_MAX}</span>
          </p>
          <p className="text-sm text-zinc-500">
            {player.nextLifeAt
              ? `Next life in ${countdown(player.nextLifeAt, now)}`
              : "Full — nothing to wait for"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog("lives")}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:border-brass/40"
        >
          Buy more
        </button>
      </section>

      {unclaimed.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brass">
            <Trophy className="size-4" aria-hidden />
            Waiting on you
          </h2>
          {unclaimed.map((prize) => (
            <PrizeClaimForm
              key={prize.id}
              prize={prize}
              banks={banks}
              onDone={() => void load()}
            />
          ))}
        </section>
      )}

      {settled.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Prizes
          </h2>
          {settled.map((prize) => (
            <div
              key={prize.id}
              className="panel flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{prize.title}</p>
                <p className="text-xs text-zinc-500">
                  {prize.status === "paid"
                    ? `Sent to ${prize.accountName ?? "your account"}`
                    : `On its way to ${prize.accountName ?? "your account"}`}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm text-brass">
                {formatNaira(prize.amountKobo)}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Your attempts
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing yet.{" "}
            <Link href="/" className="text-brass underline">
              Find a safe
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="panel flex items-center justify-between gap-3 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  {run.slug ? (
                    <Link
                      href={`/b/${run.slug}`}
                      className="truncate text-sm font-medium hover:text-brass"
                    >
                      {run.title}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">{run.title}</p>
                  )}
                  <p className="text-xs text-zinc-500">
                    {run.guessesUsed} of {run.guessesAllowed} guesses ·{" "}
                    {new Date(run.startedAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold " +
                    (run.status === "won"
                      ? "bg-mark-green/20 text-mark-green"
                      : run.status === "active"
                        ? "bg-brass/20 text-brass"
                        : "bg-white/5 text-zinc-500")
                  }
                >
                  {run.status === "won" ? "Opened" : run.status === "active" ? "Live" : "Spent"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog === "lives" && <BuyLivesDialog onClose={() => setDialog("none")} />}
      {dialog === "verify" && <VerifyDialog onClose={() => setDialog("none")} />}
    </div>
  );
}
