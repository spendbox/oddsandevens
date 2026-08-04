"use client";

// Who has been having a go.
//
// Addresses arrive from the server already starred out, and there is nothing
// on this screen that would let a contributor work one out — no full domain,
// no consistent length. A contributor is a stranger to these players; what
// they need to know is that people are actually turning up, and how close
// those people are getting.
//
// "Closest" is the column that matters. An attempt count says somebody is
// trying; a best score says whether they are idly poking at the safe or three
// characters from taking the money out of it. It is safe here and nowhere else
// — the person reading it wrote the password.

import { ScorePill } from "@/components/safe/score-pill";
import { Boxy } from "@/components/art/boxy";
import { Panel } from "./shared";
import type { HuntRow } from "@/lib/types";

export function AttemptsPanel({ attempts }: { attempts: HuntRow[] }) {
  if (attempts.length === 0) {
    return (
      <Panel>
        <div className="py-4 text-center">
          <Boxy mood="sad" className="mx-auto size-24" />
          <p className="mt-1 font-black tracking-tight">Nobody hunting yet.</p>
          <p className="mt-1 text-sm text-zinc-400">
            Share a box’s link and they’ll show up here.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={`${attempts.length} ${attempts.length === 1 ? "hunter" : "hunters"}`}>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Player</th>
              <th className="pb-2 font-medium">Box</th>
              <th className="pb-2 font-medium">Attempts</th>
              <th className="pb-2 font-medium">Closest</th>
              <th className="pb-2 font-medium">Power-ups</th>
              <th className="pb-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt, i) => (
              <tr key={i} className="border-t border-white/5">
                <td className="py-2 pr-3 font-mono text-xs text-zinc-400">
                  {attempt.player}
                </td>
                <td className="max-w-[10rem] truncate py-2 pr-3 text-zinc-300">
                  {attempt.boxTitle}
                </td>
                <td className="py-2 pr-3 tabular-nums text-zinc-400">
                  {attempt.attempts}
                  {attempt.won && (
                    <span className="ml-1.5 text-mark-green">cracked it</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <ScorePill percent={attempt.bestPercent} />
                </td>
                <td className="py-2 pr-3 tabular-nums text-zinc-400">
                  {attempt.powerUpsBought || "—"}
                </td>
                <td className="py-2 text-xs text-zinc-500">
                  {new Date(attempt.lastAttemptAt ?? attempt.startedAt).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" }
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
