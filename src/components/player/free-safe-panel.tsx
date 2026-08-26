"use client";

// Your own safe: put one up, watch it, and get people at it.
//
// The whole point is the last of those. A free safe with nobody hunting it is
// ₦100,000 sitting still and earning its creator nothing, so this screen is
// built around the share button rather than around the statistics — the
// figures are here to give somebody a reason to press it, not the other way
// round.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Share2, Sparkles, Check } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";
import { plural } from "@/lib/plural";

interface Safe {
  id: string;
  slug: string;
  title: string;
  status: string;
  rewardKobo: number;
  length: number;
  attempts: number;
  hunters: number;
  bestPercent: number;
  publishedAt: string | null;
  unlockedAt: string | null;
  earnedKobo: number;
  paidKobo: number;
  owedKobo: number;
}

interface State {
  canGenerate: boolean;
  reason: string | null;
  potKobo: number;
  safe: Safe | null;
  past: Safe[];
}

const REFUSALS: Record<string, string> = {
  disabled: "Free safes are paused just now. Check back.",
  already_have_one: "You already have one open. One at a time.",
  at_capacity: "Every free safe slot is taken right now. One frees up each time somebody cracks one.",
  too_many_attempts: "Too many tries. Give it an hour.",
  not_verified: "Verify your email first.",
};

export function FreeSafePanel() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [unmigrated, setUnmigrated] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/player/free-safe", { cache: "no-store" });
    setUnmigrated(res.status === 503);
    if (res.ok) setState((await res.json()) as State);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/player/free-safe", { cache: "no-store" });
      if (!live) return;
      setUnmigrated(res.status === 503);
      if (res.ok) setState((await res.json()) as State);
    })();
    return () => {
      live = false;
    };
  }, []);

  const generate = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/player/free-safe", { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setSaid(REFUSALS[body.error ?? ""] ?? "That didn’t work. Try again.");
      else await load();
    } finally {
      setBusy(false);
    }
  };

  const share = async (safe: Safe) => {
    const link = `${window.location.origin}/b/${safe.slug}`;
    const text = `I put up a safe with ${formatNaira(safe.rewardKobo)} behind it. Nobody knows the password — not even me. Crack it and it's yours.`;
    // The native sheet is the point on a phone: it opens WhatsApp, which is
    // where these actually travel. Desktop falls through to the clipboard.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: safe.title, text, url: link });
        return;
      } catch {
        // Dismissed, or no sheet.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaid(link);
    }
  };

  if (unmigrated) {
    return (
      <Shell>
        <p className="text-sm text-zinc-400">
          Free safes need a migration. Run{" "}
          <code className="font-mono">npx supabase db push</code>.
        </p>
      </Shell>
    );
  }

  if (!state) return null;

  if (state.safe) {
    const safe = state.safe;
    return (
      <Shell>
        <div className="rounded-2xl bg-black/25 p-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            {safe.title}
          </p>
          <p className="mt-1 font-mono text-3xl font-black text-brass">
            {formatNaira(safe.rewardKobo)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {safe.length} characters · nobody has ever seen this password
          </p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Hunters" value={String(safe.hunters)} />
          <Stat label="Attempts" value={safe.attempts.toLocaleString()} />
          <Stat label="Best" value={`${Math.round(safe.bestPercent)}%`} />
        </div>

        <div className="mt-2 rounded-2xl bg-black/25 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-zinc-500">You’ve earned</span>
            <span className="font-mono font-black text-mint">
              {formatNaira(safe.earnedKobo)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            70% of every power-up and life bought while somebody is hunting your
            safe.{" "}
            {safe.owedKobo > 0
              ? `${formatNaira(safe.owedKobo)} is waiting to be sent — add a bank account below.`
              : "Nothing owed yet."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void share(safe)}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
          {copied ? "Link copied" : "Share your safe"}
        </button>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Nobody hunting it means nobody spending on it. Sharing is the whole job.
        </p>

        {said && <p className="mt-2 break-all text-center text-xs text-zinc-400">{said}</p>}
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-zinc-300">
        Put up a safe with{" "}
        <strong className="text-brass">{formatNaira(state.potKobo)}</strong> behind
        it. We fund the prize; you bring the crowd and keep 70% of everything
        they spend on it.
      </p>
      <ul className="mt-2 space-y-1 text-xs text-zinc-500">
        <li>· The password is drawn by the database. You never see it, and neither do we.</li>
        <li>· It’s a Brutal one — hundreds of attempts. That’s what makes it worth watching.</li>
        <li>· One at a time, and you can’t win your own.</li>
      </ul>

      {state.canGenerate ? (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
          className="btn-chunky mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-grape px-4 py-3.5 text-white disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          Generate my safe
        </button>
      ) : (
        <p className="mt-3 rounded-xl bg-white/6 px-3 py-2.5 text-sm text-zinc-400">
          {REFUSALS[state.reason ?? ""] ?? "Not available just now."}
        </p>
      )}

      {said && <p className="mt-2 text-sm text-berry">{said}</p>}

      {state.past.length > 0 && (
        <div className="mt-3 border-t border-white/8 pt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
            Before
          </p>
          <ul className="space-y-1">
            {state.past.map((safe) => (
              <li key={safe.id} className="flex items-baseline justify-between text-xs">
                <span className="text-zinc-400">{safe.title}</span>
                <span className="text-zinc-500">
                  {safe.status === "unlocked" ? "cracked" : safe.status} ·{" "}
                  {plural(safe.attempts, "attempt")} · earned{" "}
                  <span className="text-mint">{formatNaira(safe.earnedKobo)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="panel rounded-2xl p-4">
      <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        Your own safe
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 p-2.5">
      <p className="font-mono text-lg font-black">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
    </div>
  );
}
