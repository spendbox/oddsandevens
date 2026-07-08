"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgePercent,
  ExternalLink,
  Hourglass,
  Puzzle,
  Star,
  Target,
  Ticket,
} from "lucide-react";
import { EMAIL_REGEX } from "@/lib/constants";
import type { LoyaltyAccount } from "@/lib/types";

const EMAIL_STORAGE_KEY = "tilehunt_email";

// "in 2d 4h" / "in 3h 20m" — code expiries and cooldowns.
function formatEta(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const totalMinutes = Math.ceil(ms / 60_000);
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

// Customer portal: every business this email plays with — points, rewards,
// and when they expire. Same email-only identity as the play page.
export default function CustomerPortalPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [accounts, setAccounts] = useState<LoyaltyAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // While we check localStorage for a remembered email, hold back the email
  // form so logged-in customers never see it flash.
  const [booting, setBooting] = useState(true);

  // Pure fetcher (no setState) so the mount effect can apply the result in an
  // async callback — required by the react-hooks/set-state-in-effect rule.
  const fetchAccounts = useCallback(
    async (
      addr: string
    ): Promise<{ accounts: LoyaltyAccount[]; error: string | null }> => {
      const res = await fetch(
        `/api/customer/summary?email=${encodeURIComponent(addr)}`
      );
      if (!res.ok) {
        return {
          accounts: [],
          error: "Couldn't load your rewards. Try again shortly.",
        };
      }
      const body = await res.json();
      return {
        accounts: (body?.accounts as LoyaltyAccount[]) ?? [],
        error: null,
      };
    },
    []
  );

  const load = useCallback(
    async (addr: string) => {
      setAccounts(null);
      const result = await fetchAccounts(addr);
      setAccounts(result.accounts);
      setError(result.error);
    },
    [fetchAccounts]
  );

  useEffect(() => {
    let ignore = false;
    const stored = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    const valid = !!stored && EMAIL_REGEX.test(stored);
    // Always resolve through a promise so state is only set in the callback
    // (never synchronously inside the effect body).
    const run = valid
      ? fetchAccounts(stored)
      : Promise.resolve(null as null | { accounts: LoyaltyAccount[]; error: string | null });
    run.then((result) => {
      if (ignore) return;
      if (result && stored) {
        setEmail(stored);
        setAccounts(result.accounts);
        setError(result.error);
      }
      setBooting(false);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAccounts]);

  if (booting) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <span className="animate-pulse">Loading your rewards…</span>
      </main>
    );
  }

  if (!email) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <form
          className="card animate-fade-up w-full max-w-sm p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            const value = emailInput.trim().toLowerCase();
            if (!EMAIL_REGEX.test(value)) {
              setError("Enter a valid email address.");
              return;
            }
            window.localStorage.setItem(EMAIL_STORAGE_KEY, value);
            setError(null);
            setEmail(value);
            load(value);
          }}
        >
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900">
            <Puzzle className="size-5 text-emerald-600" aria-hidden />
            My rewards
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Enter the email you play with to see your loyalty points and
            reward codes across every business.
          </p>
          <label className="mt-5 block">
            <span className="field-label">Email</span>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="input-field"
            />
          </label>
          {error && <p className="alert-error mt-3">{error}</p>}
          <button type="submit" className="btn-primary mt-5 w-full">
            Show my rewards
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8">
      <div className="animate-fade-up mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900">
            <Ticket className="size-6 text-emerald-600" aria-hidden />
            My rewards
          </h1>
          <p className="text-xs text-zinc-400">
            {email} ·{" "}
            <button
              className="cursor-pointer underline hover:text-zinc-600"
              onClick={() => {
                window.localStorage.removeItem(EMAIL_STORAGE_KEY);
                setEmail(null);
                setAccounts(null);
              }}
            >
              switch email
            </button>
          </p>
        </header>

        {error && <p className="alert-error mt-4">{error}</p>}

        {accounts === null ? (
          <p className="mt-8 animate-pulse text-center text-zinc-400">
            Loading your rewards…
          </p>
        ) : accounts.length === 0 ? (
          <div className="card mt-8 p-8 text-center">
            <Star className="mx-auto size-8 text-zinc-300" aria-hidden />
            <p className="mt-3 text-zinc-500">
              Nothing here yet — play a TileHunt board and your points and
              rewards will show up.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {accounts.map((a) => (
              <li
                key={a.slug}
                className="card p-4 sm:p-5"
                style={{ "--brand": a.brandColor } as React.CSSProperties}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {a.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- merchant-uploaded, host not known at build time
                      <img
                        src={a.logoUrl}
                        alt=""
                        className="size-11 rounded-xl border border-zinc-200 object-cover"
                      />
                    ) : (
                      <div
                        className="flex size-11 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        <Target className="size-5" aria-hidden />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {a.businessName}
                      </p>
                      <p className="text-xs text-zinc-500">
                        <Star
                          className="mr-0.5 inline size-3.5 fill-amber-400 text-amber-400"
                          aria-hidden
                        />
                        {a.loyaltyPoints} point{a.loyaltyPoints === 1 ? "" : "s"} ·{" "}
                        {a.pointsPerDiscount} pts = {a.discountPercent}% off
                        {a.pointsExpireAt && a.loyaltyPoints > 0 && (
                          <> · points expire {formatEta(a.pointsExpireAt)}</>
                        )}
                        {a.cooldownUntil && (
                          <>
                            {" "}
                            ·{" "}
                            <Hourglass
                              className="inline size-3 text-amber-500"
                              aria-hidden
                            />{" "}
                            play again {formatEta(a.cooldownUntil)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/g/${a.slug}`}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Play <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                </div>

                {/* Progress toward the next discount */}
                {(() => {
                  const eligible = a.loyaltyPoints >= a.pointsPerDiscount;
                  const inCycle = eligible
                    ? a.pointsPerDiscount
                    : a.loyaltyPoints % a.pointsPerDiscount;
                  const toGo = a.pointsPerDiscount - inCycle;
                  return (
                    <>
                      <div className="mt-3 flex items-center gap-1.5">
                        {Array.from({ length: a.pointsPerDiscount }, (_, i) => (
                          <span
                            key={i}
                            className="h-2 grow rounded-full"
                            style={{
                              backgroundColor:
                                i < inCycle
                                  ? "var(--brand)"
                                  : "color-mix(in oklab, var(--brand), transparent 88%)",
                            }}
                            aria-hidden
                          />
                        ))}
                      </div>
                      <p
                        className={
                          "mt-1.5 text-xs " +
                          (eligible
                            ? "font-medium text-[var(--brand)]"
                            : "text-zinc-500")
                        }
                      >
                        {eligible
                          ? `Reward unlocked! Show your loyalty code below for ${a.discountPercent}% off.`
                          : `${toGo} more point${toGo === 1 ? "" : "s"} to unlock ${a.discountPercent}% off. You can only redeem once the bar is full.`}
                      </p>
                    </>
                  );
                })()}

                {a.loyaltyCode && (
                  <div
                    className={
                      "mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 " +
                      (a.loyaltyPoints >= a.pointsPerDiscount
                        ? "border-[color-mix(in_oklab,var(--brand),transparent_70%)] bg-[color-mix(in_oklab,var(--brand),transparent_94%)]"
                        : "border-zinc-100 bg-zinc-50")
                    }
                  >
                    <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                      <BadgePercent
                        className="size-3.5 text-[var(--brand)]"
                        aria-hidden
                      />
                      {a.loyaltyPoints >= a.pointsPerDiscount
                        ? "Loyalty code · ready to redeem at the counter"
                        : "Loyalty code · fill the bar above, then redeem this"}
                    </p>
                    <span className="shrink-0 rounded-lg border border-[color-mix(in_oklab,var(--brand),transparent_60%)] bg-white px-2.5 py-1 font-mono tracking-widest text-[var(--brand)]">
                      {a.loyaltyCode}
                    </span>
                  </div>
                )}

                {a.codes.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {a.codes.map((c) => (
                      <li
                        key={c.code}
                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-800">
                            {c.description}
                          </p>
                          <p className="text-xs text-zinc-400">
                            Expires {formatEta(c.expiresAt)} ·{" "}
                            {new Date(c.expiresAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-lg border border-[color-mix(in_oklab,var(--brand),transparent_60%)] bg-white px-2.5 py-1 font-mono tracking-widest text-[var(--brand)]">
                          {c.code}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
