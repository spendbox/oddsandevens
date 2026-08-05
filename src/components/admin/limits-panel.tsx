"use client";

// One number, and the evidence for choosing it.
//
// The number is how many accounts a single address may create in a day, and
// zero — the default — means no limit. It exists because a fresh account is
// seven free lives, which makes a big safe brute-forceable with a few hundred
// throwaway inboxes and no money at all.
//
// It ships off rather than at some plausible-sounding default because the cost
// of guessing low is severe and invisible: carrier NAT can put a very large
// number of real players behind one address, and they would simply be unable
// to sign up, with no error anybody would ever see. So the panel leads with
// what the clusters actually look like over the past week. A number chosen
// from that table is worth enforcing; a number chosen from intuition is not.

import { useCallback, useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";

interface Cluster {
  id: string;
  accounts: number;
  firstAt: string;
  lastAt: string;
}

export function LimitsPanel() {
  const [cap, setCap] = useState("");
  const [stored, setStored] = useState(0);
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/limits", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as {
      limits: { newAccountsPerIpPerDay: number };
      clusters: Cluster[];
    };
    setStored(body.limits.newAccountsPerIpPerDay);
    setCap(body.limits.newAccountsPerIpPerDay > 0 ? String(body.limits.newAccountsPerIpPerDay) : "");
    setClusters(body.clusters);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function save() {
    setBusy(true);
    setSaved(false);
    const res = await fetch("/api/admin/limits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newAccountsPerIpPerDay: Number(cap || 0) }),
    });
    setBusy(false);
    if (!res.ok) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
    await load();
  }

  const asked = Number(cap || 0);
  const changed = asked !== stored;
  const biggest = clusters?.[0]?.accounts ?? 0;

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Fingerprint className="size-4" aria-hidden />
        New accounts per internet connection
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        <strong className="text-zinc-300">What this counts.</strong> Every
        device on the internet reaches us through an IP address — the number
        the connection itself has, not the person. A home, an office or a café
        is usually one address shared by everyone on it; a phone on mobile data
        shares one with a large part of the network. So this is “how many new
        accounts may be created from one connection in a day”, and it exists
        because a fresh account comes with free lives, and the cheapest way to
        attack a big safe is a few hundred throwaway inboxes from one laptop.
      </p>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        Only a hash of the address is stored — salted and one-way, so it can
        say “these two accounts came from the same place” and nothing else.
        Leave the cap blank or at zero for no limit, which is the default: a
        Nigerian mobile network can put thousands of real players behind one
        address, and a cap set too low locks every one of them out of signing
        up with no error anybody would ever see. Existing accounts are never
        affected, wherever they sign in from.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          value={cap}
          onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="0 — no limit"
          aria-label="New accounts per address per day"
          className="field w-40 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky rounded-xl bg-brass px-5 py-2.5 text-sm text-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
        <span className="text-xs text-zinc-500">
          {stored > 0 ? `Enforcing ${stored} a day.` : "Recording only — nothing is refused."}
        </span>
      </div>

      {asked > 0 && biggest >= asked && (
        <p className="mt-3 rounded-xl border-2 border-berry/40 bg-berry/10 px-3 py-2.5 text-xs font-bold text-berry">
          A cap of {asked} would already have turned away the busiest address
          below, which has made {biggest}. If that is a shared network rather
          than one person, this will read to them as signing up being broken.
        </p>
      )}

      <h3 className="mb-2 mt-5 text-xs font-black uppercase tracking-wide text-zinc-500">
        Addresses with more than one account · last 7 days
      </h3>

      {clusters === null ? (
        <p className="py-3 text-sm text-zinc-500">Loading…</p>
      ) : clusters.length === 0 ? (
        <p className="rounded-xl bg-white/5 px-3 py-2.5 text-sm text-zinc-500">
          Nothing to show. Either no address has made two accounts this week, or
          none of them were created since this started recording.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {clusters.map((cluster) => (
            <li
              key={cluster.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2"
            >
              <span className="font-mono text-xs text-zinc-500">{cluster.id}…</span>
              <span className="text-sm font-bold text-zinc-200">
                {cluster.accounts} accounts
              </span>
              <span className="text-xs text-zinc-500">
                {new Date(cluster.firstAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
                {" – "}
                {new Date(cluster.lastAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
