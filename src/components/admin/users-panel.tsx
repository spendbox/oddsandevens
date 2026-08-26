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
import { stamp, timeAgo } from "@/lib/when";
import { plural } from "@/lib/plural";

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
  spent30dKobo: number;
  createdAt: string;

  // Nullable on purpose: a null is "not since we started counting", which is a
  // different fact from zero and is printed differently.
  lastSeen: string | null;
  lastLoginAt: string | null;
  lastPlayedAt: string | null;
  firstPlayedAt: string | null;
  loginCount: number;
  visits: number;
  daysActive: number;
  daysActive30: number;
  attempts7d: number;
  attempts30d: number;
}

type Sort = "recent" | "played" | "active" | "spent" | "attempts" | "login" | "joined";

const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Recently seen" },
  { id: "played", label: "Recently played" },
  { id: "active", label: "Most days active" },
  { id: "spent", label: "Biggest spenders" },
  { id: "attempts", label: "Most attempts" },
  { id: "login", label: "Recent logins" },
  { id: "joined", label: "Newest" },
];

const INPUT = "field px-4 py-2.5";

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unmigrated, setUnmigrated] = useState(false);
  /*
   * The instant the list was fetched, which every "seen 4m ago" on the screen
   * is measured from. Read once per load rather than once per row: a clock
   * read during render is a different answer on every re-render, and thirty
   * rows measured from thirty instants can disagree with each other.
   */
  const [readAt, setReadAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
    setUnmigrated(res.status === 503);
    if (res.ok) {
      setUsers(((await res.json()) as { users: AdminUser[] }).users);
      setReadAt(Date.now());
    }
    setLoading(false);
  }, [query, sort]);

  // Debounced: typing an address shouldn't fire a query per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const totalSpent = users.reduce((sum, u) => sum + u.spentKobo, 0);
  // Counted here rather than asked for: this is "of the people on screen",
  // which is what somebody who has just typed a search wants to know. The
  // platform-wide version of the same question is the Activity panel above.
  const dayAgo = readAt - 24 * 60 * 60 * 1000;
  const weekAgo = readAt - 7 * 24 * 60 * 60 * 1000;
  const seenSince = (at: number) =>
    users.filter((u) => u.lastSeen && new Date(u.lastSeen).getTime() > at).length;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Players listed" value={String(users.length)} />
        <Figure label="They've spent" value={formatNaira(totalSpent)} />
        <Figure
          label="Here today"
          value={String(seenSince(dayAgo))}
          hint={`${seenSince(weekAgo)} in the last week`}
        />
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

      {unmigrated ? (
        // The one failure worth naming, because the fix is a command and not a
        // bug report: the view exists in a migration the database hasn't run.
        <div className="panel rounded-2xl px-4 py-8 text-center">
          <p className="font-black tracking-tight">This list needs a migration.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
            The database is missing <code className="font-mono">admin_players</code>, or
            has it and the API hasn’t noticed. Run{" "}
            <code className="font-mono">npx supabase db push</code>, then{" "}
            {/* A string, not prose — the quotes have to be the ones you type. */}
            <code className="font-mono">{"notify pgrst, 'reload schema';"}</code>.
          </p>
        </div>
      ) : loading && users.length === 0 ? (
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
                    {plural(user.attempts, "attempt")} · {plural(user.hunts, "safe")}
                    {user.wins > 0 && (
                      <span className="text-mint"> · {user.wins} cracked</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono font-black text-brass">
                    {formatNaira(user.spentKobo)}
                  </span>
                  {/* The one figure worth a column of its own. Everything else
                      on this screen says how much; this says whether they are
                      still here, which is the first thing anybody asks. */}
                  <span className="block text-[11px] text-zinc-500">
                    seen {timeAgo(user.lastSeen, readAt)}
                  </span>
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
                  <Detail label="Spent in 30 days" value={formatNaira(user.spent30dKobo)} />

                  <p className="col-span-full mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                    When
                  </p>
                  <Detail label="Last seen" value={stamp(user.lastSeen)} />
                  <Detail label="Last played" value={stamp(user.lastPlayedAt)} />
                  <Detail
                    label="Last logged in"
                    value={
                      user.lastLoginAt
                        ? `${stamp(user.lastLoginAt)} · ${user.loginCount}×`
                        : "not recorded yet"
                    }
                  />
                  <Detail label="First played" value={stamp(user.firstPlayedAt)} />
                  <Detail label="Joined" value={stamp(user.createdAt)} />
                  <Detail
                    label="Days active"
                    value={`${user.daysActive} · ${user.daysActive30} in 30`}
                  />
                  <Detail
                    label="Guesses lately"
                    value={`${user.attempts7d} in 7d · ${user.attempts30d} in 30d`}
                  />
                  <Detail label="Visits" value={user.visits > 0 ? String(user.visits) : "—"} />
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
