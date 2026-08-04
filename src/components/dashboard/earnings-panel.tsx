"use client";

// Money in, and the people who took money out.
//
// The two belong on one screen because they are the same story: players buy
// power-ups because a box is hard, and a hard box eventually gets cracked.

import { Trophy } from "lucide-react";
import { formatNaira, rewardLabel } from "@/lib/game/rewards";
import type { ContributorEarnings, WinnerRow } from "@/lib/types";
import { Boxy } from "@/components/art/boxy";
import { Panel, Stat } from "./shared";

export function EarningsPanel({
  earnings,
  winners,
  connected,
  onConnect,
}: {
  earnings: ContributorEarnings;
  winners: WinnerRow[];
  connected: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="Earned" value={formatNaira(earnings.totalKobo)} hint="All time" />
        <Stat label="Last 30 days" value={formatNaira(earnings.last30dKobo)} />
        <Stat
          label="Sold to hunters"
          value={`${earnings.powerUpsSold} + ${earnings.livesSold}`}
          hint={`Power-ups + lives · you keep ${earnings.sharePercent}%`}
        />
      </div>

      {!connected && earnings.totalKobo > 0 && (
        <p className="rounded-xl border border-brass/30 bg-brass/10 px-4 py-3 text-sm text-brass">
          You’ve earned {formatNaira(earnings.totalKobo)} with nowhere to send
          it.{" "}
          <button type="button" onClick={onConnect} className="font-semibold underline">
            Add a bank account
          </button>{" "}
          and future sales settle straight to you.
        </p>
      )}

      <Panel title="Where the money went">
        <dl className="space-y-2 text-sm">
          <Row label="Players spent on your boxes">
            {formatNaira(earnings.totalKobo + earnings.platformKobo)}
          </Row>
          <Row label="— of that, power-ups">{formatNaira(earnings.powerUpKobo)}</Row>
          <Row label="— of that, lives">{formatNaira(earnings.lifeKobo)}</Row>
          <Row label={`Your share (${earnings.sharePercent}%)`} accent>
            {formatNaira(earnings.totalKobo)}
          </Row>
          <Row label={`Spendbox (${100 - earnings.sharePercent}%)`}>
            {formatNaira(earnings.platformKobo)}
          </Row>
        </dl>
      </Panel>

      <Panel title="Winners">
        {winners.length === 0 ? (
          <div className="py-2 text-center">
            <Boxy mood="sly" className="mx-auto size-20" />
            <p className="mt-1 text-sm text-zinc-400">
              Nobody has cracked one of your boxes yet.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {winners.map((winner, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5"
              >
                <Trophy className="size-4 shrink-0 text-brass" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">
                    <span className="font-mono text-xs text-zinc-400">
                      {winner.player}
                    </span>{" "}
                    opened {winner.boxTitle}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(winner.unlockedAt).toLocaleDateString()} ·{" "}
                    {winner.claimStatus === "paid"
                      ? "prize sent"
                      : winner.claimStatus === "submitted"
                        ? "prize on its way"
                        : "waiting on their bank details"}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm text-brass">
                  {rewardLabel(winner.rewardKobo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Row({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 last:border-0">
      <dt className="text-zinc-400">{label}</dt>
      <dd className={"font-mono " + (accent ? "font-bold text-brass" : "text-zinc-300")}>
        {children}
      </dd>
    </div>
  );
}
