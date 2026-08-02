"use client";

import { Users } from "lucide-react";
import type { CustomerSummary } from "@/lib/types";
import { formatEta } from "./shared";

function ActiveRewards({ customer }: { customer: CustomerSummary }) {
  if (customer.activeCodes.length === 0) {
    return <span className="text-zinc-300">—</span>;
  }
  return (
    <ul className="space-y-1">
      {customer.activeCodes.map((code, i) => (
        <li key={i} className="text-xs leading-relaxed">
          {code.description}{" "}
          <span className="text-zinc-400">
            · expires {formatEta(code.expiresAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CustomersList({ customers }: { customers: CustomerSummary[] }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="section-title">
        <Users className="size-3.5" aria-hidden />
        Customers ({customers.length})
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
        Everyone who has played your games, and the prizes they have won but
        not yet collected.
      </p>

      {customers.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          No players yet — share your link and the board starts filling up.
        </p>
      ) : (
        <>
          {/* Phones: roomy stacked cards — nothing squeezes. */}
          <ul className="mt-4 space-y-3 md:hidden">
            {customers.map((c) => (
              <li
                key={c.email}
                className="rounded-xl border border-zinc-200 p-4"
              >
                <p className="break-all text-sm font-medium text-zinc-900">
                  {c.email}
                </p>
                <div className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-700">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Waiting to be collected
                  </p>
                  <ActiveRewards customer={c} />
                </div>
                <p className="mt-3 flex flex-wrap gap-x-4 text-xs text-zinc-500">
                  <span>{c.totalPlays} plays</span>
                  <span>{c.totalUnlocks} won all time</span>
                  <span>
                    last played{" "}
                    {c.lastPlayedAt ? formatEta(c.lastPlayedAt) : "—"}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          {/* md+: the full table. */}
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Customer</th>
                  <th className="py-2.5 pr-4 font-medium">
                    Waiting to be collected
                  </th>
                  <th className="py-2.5 pr-4 font-medium">Plays</th>
                  <th className="py-2.5 pr-4 font-medium">Prizes won</th>
                  <th className="py-2.5 font-medium">Last played</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700">
                {customers.map((c) => (
                  <tr
                    key={c.email}
                    className="border-t border-zinc-100 transition hover:bg-zinc-50"
                  >
                    <td className="py-3 pr-4">{c.email}</td>
                    <td className="py-3 pr-4">
                      <ActiveRewards customer={c} />
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-500">
                      {c.totalPlays}
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-500">
                      {c.totalUnlocks}
                    </td>
                    <td className="py-3 text-xs text-zinc-500">
                      {c.lastPlayedAt ? formatEta(c.lastPlayedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
