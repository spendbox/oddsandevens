"use client";

import { Hourglass, Star, Users } from "lucide-react";
import type { CustomerSummary } from "@/lib/types";
import { formatEta } from "./shared";

function PointsBadge({ customer }: { customer: CustomerSummary }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-amber-600">
      <Star className="size-3.5 fill-current" aria-hidden />
      {customer.loyaltyPoints}
      {customer.pointsExpireAt && customer.loyaltyPoints > 0 && (
        <span className="font-normal text-zinc-400">
          · expire {formatEta(customer.pointsExpireAt)}
        </span>
      )}
    </span>
  );
}

function DiscountStatus({ customer }: { customer: CustomerSummary }) {
  if (customer.pointsToDiscount === 0) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        ready now
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      <Hourglass className="size-3.5" aria-hidden />
      {customer.pointsToDiscount} pts · ~{formatEta(customer.discountReadyAt)}
    </span>
  );
}

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

export function CustomersList({
  customers,
  pointsPerDiscount,
  discountPercent,
}: {
  customers: CustomerSummary[];
  pointsPerDiscount: number;
  discountPercent: number;
}) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="section-title">
        <Users className="size-3.5" aria-hidden />
        Customers ({customers.length})
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
        Everyone who has played your grid, with their points and what they can
        redeem. Your rate: {pointsPerDiscount} points = {discountPercent}% off.
        Points expire 7 days after a customer&apos;s last play.
      </p>

      {customers.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          No players yet — share your link to get the hunt going.
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
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  <PointsBadge customer={c} />
                  <DiscountStatus customer={c} />
                </div>
                <div className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-700">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Active rewards
                  </p>
                  <ActiveRewards customer={c} />
                </div>
                <p className="mt-3 flex flex-wrap gap-x-4 text-xs text-zinc-500">
                  <span>{c.totalPlays} taps</span>
                  <span>
                    next play {c.nextPlayAt ? formatEta(c.nextPlayAt) : "now"}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          {/* md+: the full table. */}
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Customer</th>
                  <th className="py-2.5 pr-4 font-medium">Points</th>
                  <th className="py-2.5 pr-4 font-medium">Discount ready</th>
                  <th className="py-2.5 pr-4 font-medium">Active rewards</th>
                  <th className="py-2.5 pr-4 font-medium">Taps</th>
                  <th className="py-2.5 font-medium">Next play</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700">
                {customers.map((c) => (
                  <tr
                    key={c.email}
                    className="border-t border-zinc-100 transition hover:bg-zinc-50"
                  >
                    <td className="py-3 pr-4">{c.email}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <PointsBadge customer={c} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <DiscountStatus customer={c} />
                    </td>
                    <td className="py-3 pr-4">
                      <ActiveRewards customer={c} />
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-500">
                      {c.totalPlays}
                    </td>
                    <td className="py-3 text-xs text-zinc-500">
                      {c.nextPlayAt ? formatEta(c.nextPlayAt) : "now"}
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
