"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Puzzle,
  Star,
  Target,
  Ticket,
} from "lucide-react";
import { EMAIL_REGEX } from "@/lib/constants";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import type { PlayerAccount } from "@/lib/types";

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

// Customer portal: every business this email plays with — prizes won,
// and when they expire. Same email-only identity as the play page.
export default function CustomerPortalPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [accounts, setAccounts] = useState<PlayerAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // While we check localStorage for a remembered email, hold back the email
  // form so logged-in customers never see it flash.
  const [booting, setBooting] = useState(true);

  // Pure fetcher (no setState) so the mount effect can apply the result in an
  // async callback — required by the react-hooks/set-state-in-effect rule.
  const fetchAccounts = useCallback(
    async (
      addr: string | null
    ): Promise<{
      accounts: PlayerAccount[];
      email: string | null;
      error: string | null;
    }> => {
      // With no address at all we still ask: a browser that has verified an
      // email carries a cookie, and the server answers as that person.
      const query = addr ? `?email=${encodeURIComponent(addr)}` : "";
      const res = await fetch(`/api/customer/summary${query}`);
      if (!res.ok) {
        return {
          accounts: [],
          email: null,
          error: addr ? "Couldn't load your rewards. Try again shortly." : null,
        };
      }
      const body = await res.json();
      return {
        accounts: (body?.accounts as PlayerAccount[]) ?? [],
        email: (body?.email as string | null) ?? null,
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

  // Silent background refresh (no loading flash) so newly-earned points and
  // codes appear on their own.
  useAutoRefresh(
    useCallback(() => {
      if (!email) return;
      fetchAccounts(email).then((result) => {
        setAccounts(result.accounts);
        setError(result.error);
      });
    }, [email, fetchAccounts])
  );

  useEffect(() => {
    let ignore = false;
    const stored = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    const valid = !!stored && EMAIL_REGEX.test(stored);
    // Always resolve through a promise so state is only set in the callback
    // (never synchronously inside the effect body).
    fetchAccounts(valid ? stored : null).then((result) => {
      if (ignore) return;
      const who = result.email ?? (valid ? stored : null);
      if (who) {
        setEmail(who);
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
            Enter the email you play with to see your prizes and
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
              Nothing here yet — play a Spendbox game and anything you win
              shows up here.
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
                      {a.cooldownUntil && (
                        <p className="text-xs text-zinc-500">
                          Play again {formatEta(a.cooldownUntil)}
                        </p>
                      )}
                      <p className="text-xs text-zinc-500">
                        {a.codes.length > 0
                          ? `${a.codes.length} prize${a.codes.length === 1 ? "" : "s"} to collect`
                          : "No prizes waiting"}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/p/${a.slug}`}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Play <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                </div>

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
