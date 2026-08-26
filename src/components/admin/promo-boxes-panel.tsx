"use client";

// Promo safes, and what they are costing.
//
// Every live one is a real prize Spendbox has promised against a small fee the
// maker paid, so the first thing on this panel is the exposure rather than the
// list. The settings under it are the only brakes there are: the size of the
// pot, what one costs, how many exist in the whole promotion, and whether it
// is running at all.

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";

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
  creatorName: string | null;
  winnerEmail: string | null;
  fundingKobo: number;
}

interface Body {
  exposure: {
    live: number;
    cracked: number;
    total: number;
    atRiskKobo: number;
    paidOutKobo: number;
    awaitingPayment: number;
    collectedKobo: number;
    attempts: number;
  };
  config: {
    enabled: boolean;
    potKobo: number;
    priceKobo: number;
    maxTotal: number;
    creatorSharePercent: number;
  };
  safes: Safe[];
}

export function PromoBoxesPanel() {
  const [body, setBody] = useState<Body | null>(null);
  const [unmigrated, setUnmigrated] = useState(false);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Body["config"] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/admin/promo", { cache: "no-store" });
      if (!live) return;
      setUnmigrated(res.status === 503);
      if (res.ok) {
        const next = (await res.json()) as Body;
        if (!live) return;
        setBody(next);
        setDraft(next.config);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const reveal = async (id: string) => {
    if (secrets[id]) {
      setSecrets((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      return;
    }
    setRevealing(id);
    try {
      const res = await fetch(`/api/admin/promo?reveal=${id}`, { cache: "no-store" });
      if (res.ok) {
        const { secret } = (await res.json()) as { secret: string };
        setSecrets((s) => ({ ...s, [id]: secret }));
      }
    } finally {
      setRevealing(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await fetch("/api/admin/promo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", ...draft }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (unmigrated) {
    return (
      <div className="panel rounded-2xl px-4 py-8 text-center">
        <p className="font-black tracking-tight">Promo safes need a migration.</p>
        <p className="mt-1 text-sm text-zinc-400">
          Run <code className="font-mono">npx supabase db push</code>.
        </p>
      </div>
    );
  }
  if (!body || !draft) return null;

  const { exposure } = body;

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 text-sm font-black uppercase tracking-wide text-zinc-300">
        Promo safes
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        We fund the prize on every one of these; the maker pays a fixed price to put one up. “At risk” is what it would cost if every live one were cracked tomorrow.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Live" value={String(exposure.live)} hint={`${exposure.awaitingPayment} awaiting payment`} />
        <Figure label="At risk" value={formatNaira(exposure.atRiskKobo)} hint="if all are cracked" tone="text-berry" />
        <Figure label="Paid out" value={formatNaira(exposure.paidOutKobo)} hint={`${exposure.cracked} cracked`} />
        <Figure label="Collected" value={formatNaira(exposure.collectedKobo)} hint="promo fees taken" tone="text-mint" />
      </div>

      <div className="mt-3 grid gap-2 rounded-2xl bg-black/25 p-3 sm:grid-cols-5">
        <Field
          label="Pot (₦)"
          value={String(Math.round(draft.potKobo / 100))}
          onChange={(v) => setDraft({ ...draft, potKobo: Number(v || 0) * 100 })}
        />
        <Field
          label="Total allocation"
          value={String(draft.maxTotal)}
          onChange={(v) => setDraft({ ...draft, maxTotal: Number(v || 0) })}
        />
        <Field
          label="Price (₦)"
          value={String(Math.round(draft.priceKobo / 100))}
          onChange={(v) => setDraft({ ...draft, priceKobo: Number(v || 0) * 100 })}
        />
        <Field
          label="Creator %"
          value={String(draft.creatorSharePercent)}
          onChange={(v) => setDraft({ ...draft, creatorSharePercent: Number(v || 0) })}
        />
        <label className="flex items-end gap-2 pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            className="size-4 accent-[var(--brass)]"
          />
          <span className={draft.enabled ? "text-zinc-200" : "text-zinc-500"}>
            {draft.enabled ? "Generation on" : "Generation off"}
          </span>
        </label>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-2 rounded-xl bg-white/8 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/12 active:translate-y-px disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save limits"}
      </button>

      {body.safes.length === 0 ? (
        <p className="mt-4 text-center text-sm text-zinc-500">Nobody has put one up yet.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {body.safes.map((safe) => (
            <li key={safe.id} className="rounded-2xl bg-black/25 p-3">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {safe.title}{" "}
                    <span className="font-mono text-xs font-normal text-zinc-500">
                      /{safe.slug}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {safe.creatorName ?? "unknown maker"} · {safe.length} chars ·{" "}
                    {safe.attempts.toLocaleString()} attempts · best{" "}
                    {Math.round(safe.bestPercent)}%
                    {safe.winnerEmail && (
                      <span className="text-mint"> · won by {safe.winnerEmail}</span>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void reveal(safe.id)}
                  aria-label={secrets[safe.id] ? "Hide password" : "Show password"}
                  className="shrink-0 rounded-lg bg-white/8 p-2 text-zinc-400 transition hover:bg-white/12 hover:text-zinc-100"
                >
                  {revealing === safe.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : secrets[safe.id] ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
              {secrets[safe.id] && (
                // Every reveal is written to the server log — who, which box,
                // when. It is the one privileged read here that leaves no
                // trace in the data.
                <p className="animate-fade-up mt-2 break-all rounded-xl bg-berry/12 px-3 py-2 font-mono text-sm text-berry">
                  {secrets[safe.id]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-black/25 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-black ${tone ?? ""}`}>{value}</p>
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className="field w-full px-3 py-2"
      />
    </label>
  );
}
