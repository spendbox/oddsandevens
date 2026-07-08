"use client";

import { Ticket } from "lucide-react";
import { formatDate, type UnlockRow } from "./shared";

function description(u: UnlockRow): string {
  return u.reward_type === "loyalty_discount"
    ? `${u.discount_percent}% loyalty discount`
    : (u.rewards?.description ?? "Tile reward");
}

function StatusBadge({ unlock }: { unlock: UnlockRow }) {
  const label =
    unlock.status === "unredeemed" && unlock.isExpired
      ? "expired"
      : unlock.status;
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-xs font-medium " +
        (unlock.status === "redeemed"
          ? "bg-emerald-100 text-emerald-700"
          : label === "expired"
            ? "bg-zinc-100 text-zinc-500"
            : "bg-amber-100 text-amber-700")
      }
    >
      {label}
    </span>
  );
}

export function UnlocksList({ unlocks }: { unlocks: UnlockRow[] }) {
  if (unlocks.length === 0) return null;
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="section-title">
        <Ticket className="size-3.5" aria-hidden />
        Recent unlocks
      </h2>
      <p className="mt-1.5 text-xs text-zinc-500">
        The latest rewards won and loyalty discounts redeemed.
      </p>

      {/* Phones: roomy stacked cards. */}
      <ul className="mt-4 space-y-3 md:hidden">
        {unlocks.map((u) => (
          <li key={u.id} className="rounded-xl border border-zinc-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-900">
                {description(u)}
              </p>
              <StatusBadge unlock={u} />
            </div>
            <p className="mt-1.5 break-all text-xs text-zinc-500">
              {u.customers?.email ?? "—"}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-zinc-400">
              {/* Codes are masked: staff must get the full code from the
                  customer, which is the whole anti-fraud point. */}
              <span className="font-mono">
                ••••{u.redemption_code.slice(-2)}
              </span>
              <span>expires {formatDate(u.expires_at)}</span>
            </p>
          </li>
        ))}
      </ul>

      {/* md+: the full table. */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="py-2.5 pr-4 font-medium">Reward</th>
              <th className="py-2.5 pr-4 font-medium">Customer</th>
              <th className="py-2.5 pr-4 font-medium">Code</th>
              <th className="py-2.5 pr-4 font-medium">Status</th>
              <th className="py-2.5 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody className="text-zinc-700">
            {unlocks.map((u) => (
              <tr
                key={u.id}
                className="border-t border-zinc-100 transition hover:bg-zinc-50"
              >
                <td className="py-3 pr-4">{description(u)}</td>
                <td className="py-3 pr-4">{u.customers?.email ?? "—"}</td>
                {/* Codes are masked: staff must get the full code from the
                    customer, which is the whole anti-fraud point. */}
                <td className="py-3 pr-4 font-mono text-zinc-400">
                  ••••{u.redemption_code.slice(-2)}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge unlock={u} />
                </td>
                <td className="py-3 whitespace-nowrap text-zinc-500">
                  {formatDate(u.expires_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
