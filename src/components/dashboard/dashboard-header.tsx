"use client";

import { Crown, LogOut, Puzzle } from "lucide-react";
import { formatDate, isPremiumNow, type Merchant } from "./shared";

export function DashboardHeader({
  merchant,
  onSignOut,
}: {
  merchant: Merchant | null;
  onSignOut: () => void;
}) {
  const premium = merchant ? isPremiumNow(merchant) : false;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {merchant?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote host not known at build time
          <img
            src={merchant.logo_url}
            alt=""
            className="size-10 shrink-0 rounded-xl border border-zinc-200 object-cover"
          />
        ) : (
          <Puzzle className="size-8 shrink-0 text-emerald-600" aria-hidden />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            {merchant ? (
              merchant.business_name
            ) : (
              <>
                Tile<span className="text-emerald-600">Hunt</span>
              </>
            )}
          </h1>
          {premium && merchant?.premium_expires_at && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                <Crown className="size-3" aria-hidden /> Premium
              </span>
              until {formatDate(merchant.premium_expires_at)}
            </p>
          )}
        </div>
      </div>
      <button onClick={onSignOut} className="btn-ghost">
        <LogOut className="size-4" aria-hidden />
        Sign out
      </button>
    </header>
  );
}
