"use client";

// Everybody who has played, and what they've spent.
//
// The one screen in the product that shows a full email address, because it is
// the one screen whose job is answering a support email — and you cannot answer
// "where did my money go" about `a**@g***.com`. Everything else in Spendbox
// masks addresses before they leave the server; this deliberately doesn't, and
// it is behind the admin session that guards the payout tools.

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";

interface AdminUser {
  id: string;
  email: string;
  lives: number;
  hasPassword: boolean;
  wasInvited: boolean;
  bankName: string | null;
  accountName: string | null;
  livesBought: number;
  lifeKobo: number;
  powerUpsBought: number;
  powerUpKobo: number;
  spentKobo: number;
  hunts: number;
  attempts: number;
  wins: number;
  wonKobo: number;
  createdAt: string;
  lastSeen: string;
}

type Sort = "spent" | "attempts" | "recent";

const SORTS: { id: Sort; label: string }[] = [
  { id: "spent", label: "Biggest spenders" },
  { id: "attempts", label: "Most attempts" },
  { id: "recent", label: "Recently seen" },
];

const INPUT =
  "w-full rounded-xl border-2 border-white/10 bg-black/25 px-4 py-2.5 text-foreground outline-none transition placeholder:text-zinc-500 focus:border-brass";

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("spent");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
    if (res.ok) setUsers(((await res.json()) as { users: AdminUser[] }).users);
    setLoading(false);
  }, [query, sort]);

  // Debounced: typing an address shouldn't fire a query per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const totalSpent = users.reduce((sum, u) => sum + u.spentKobo, 0);

  return (
    <section className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Figure label="Players listed" value={String(users.length)} />
        <Figure label="They've spent" value={formatNaira(totalSpent)} />
        <Figure
          label="With an account"
          value={`${users.filter((u) => u.hasPassword).length}`}
          hint="the rest are code-only"
        />
      </div>

      <div className="panel rounded-2xl p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an email address…"
            className={`${INPUT} pl-11`}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-bold transition active:translate-y-px " +
                (sort === s.id
                  ? "bg-brass text-ink"
                  : "bg-white/6 text-zinc-400 hover:bg-white/10 hover:text-zinc-100")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading && users.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : users.length === 0 ? (
        <p className="panel rounded-2xl py-8 text-center text-sm text-zinc-500">
          Nobody matches that.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => setOpen(open === user.id ? null : user.id)}
                className="panel panel-lift flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm">{user.email}</span>
                  <span className="block text-xs text-zinc-500">
                    {user.attempts} attempts · {user.hunts} safes
                    {user.wins > 0 && (
                      <span className="text-mint"> · {user.wins} cracked</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono font-black text-brass">
                    {formatNaira(user.spentKobo)}
                  </span>
                  <span className="block text-[11px] text-zinc-500">spent</span>
                </span>
              </button>

              {open === user.id && (
                <div className="animate-fade-up mt-1 grid gap-2 rounded-2xl bg-black/25 p-3 text-xs sm:grid-cols-2">
                  <Detail label="Lives bought" value={`${user.livesBought} · ${formatNaira(user.lifeKobo)}`} />
                  <Detail label="Power-ups" value={`${user.powerUpsBought} · ${formatNaira(user.powerUpKobo)}`} />
                  <Detail label="Lives now" value={String(user.lives)} />
                  <Detail label="Won" value={user.wins ? formatNaira(user.wonKobo) : "—"} />
                  <Detail
                    label="Bank"
                    value={user.accountName ? `${user.accountName} · ${user.bankName ?? ""}` : "none saved"}
                  />
                  <Detail label="Password set" value={user.hasPassword ? "yes" : "no"} />
                  <Detail label="Invited by someone" value={user.wasInvited ? "yes" : "no"} />
                  <Detail label="Joined" value={new Date(user.createdAt).toLocaleDateString()} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-2xl p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-black">{value}</p>
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="truncate font-mono text-zinc-200">{value}</span>
    </div>
  );
}
