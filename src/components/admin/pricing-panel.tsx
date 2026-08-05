"use client";

// Every price on the platform, editable.
//
// They were constants in TypeScript, which is the right default and the wrong
// only answer: a shelf whose prices need a code review and a deploy is a shelf
// nobody experiments with, and the numbers were guesses to begin with.
//
// Two rules the screen follows. **Blank means default**, and the default is
// printed next to every field so that is a usable answer rather than a
// mystery — clearing a box is how a price goes back. And **the share is shown
// as a percentage**, because nobody thinks in `0.0125`; it is converted at the
// edge, in one place, and stored as the fraction the code uses.

import { useCallback, useEffect, useState } from "react";
import { Coins, RotateCcw } from "lucide-react";
import { KOBO } from "@/lib/constants";
import { formatNaira } from "@/lib/game/rewards";

interface Defaults {
  platformSharePercent: number;
  lifePriceKobo: number;
  lifeBankKobo: number;
  powerUps: Record<string, { name: string; share: number; floorKobo: number }>;
}

interface Overrides {
  platformSharePercent?: number;
  lifePriceKobo?: number;
  lifeBankKobo?: number;
  powerUps?: Record<string, { share?: number; floorKobo?: number }>;
}

/** What the fields hold: strings, because a half-typed number is a string. */
type Draft = Record<string, string>;

export function PricingPanel() {
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/pricing", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { defaults: Defaults; overrides: Overrides };
    setDefaults(body.defaults);
    setDraft(toDraft(body.overrides));
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
    const res = await fetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fromDraft(draft)),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      await load();
    }
  }

  if (!defaults) {
    return (
      <section className="panel rounded-2xl p-5">
        <p className="py-4 text-center text-sm text-zinc-500">Loading prices…</p>
      </section>
    );
  }

  const set = (key: string) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value.replace(/[^\d.]/g, "") }));

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Coins className="size-4" aria-hidden />
        Prices
      </h2>
      <p className="mb-4 text-xs text-zinc-500">
        Leave a field empty to use the built-in default, which is printed beside
        it. Changes apply to every checkout from the moment they are saved —
        orders already created keep the price they were quoted.
      </p>

      <div className="space-y-2">
        <Field
          label="Platform share"
          hint={`${defaults.platformSharePercent}%`}
          suffix="%"
          value={draft.platformSharePercent ?? ""}
          onChange={set("platformSharePercent")}
        />
        <Field
          label="One life"
          hint={formatNaira(defaults.lifePriceKobo)}
          prefix="₦"
          value={draft.lifePriceKobo ?? ""}
          onChange={set("lifePriceKobo")}
        />
        <Field
          label="Life Bank, a week"
          hint={formatNaira(defaults.lifeBankKobo)}
          prefix="₦"
          value={draft.lifeBankKobo ?? ""}
          onChange={set("lifeBankKobo")}
        />
      </div>

      <h3 className="mb-2 mt-5 text-xs font-black uppercase tracking-wide text-zinc-500">
        Power-ups
      </h3>
      <p className="mb-3 text-xs text-zinc-500">
        Each is a share of the box&apos;s reward, with a floor so a small box still
        has a shelf. Nothing is ever charged below {formatNaira(100 * KOBO)} —
        Paystack refuses it.
      </p>

      <div className="space-y-2">
        {Object.entries(defaults.powerUps).map(([kind, spec]) => (
          <div key={kind} className="rounded-xl bg-white/5 px-3 py-2.5">
            <p className="mb-2 text-sm font-semibold text-zinc-200">{spec.name}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="Share"
                hint={`${round(spec.share * 100)}%`}
                suffix="%"
                value={draft[`${kind}.share`] ?? ""}
                onChange={set(`${kind}.share`)}
              />
              <Field
                label="Floor"
                hint={formatNaira(spec.floorKobo)}
                prefix="₦"
                value={draft[`${kind}.floorKobo`] ?? ""}
                onChange={set(`${kind}.floorKobo`)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky rounded-2xl bg-brass px-5 py-3 text-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : saved ? "Saved" : "Save prices"}
        </button>
        <button
          type="button"
          onClick={() => setDraft({})}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-brass/40"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Clear all — back to defaults
        </button>
      </div>
    </section>
  );
}

/** One number, with what it would be if left alone. */
function Field({
  label,
  hint,
  prefix,
  suffix,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2 text-xs text-zinc-500">
        {label}
        <span className="shrink-0 font-mono text-zinc-600">default {hint}</span>
      </span>
      <span className="relative mt-1 block">
        {prefix && (
          <span className="absolute inset-y-0 left-2.5 flex items-center text-xs text-zinc-500">
            {prefix}
          </span>
        )}
        <input
          inputMode="decimal"
          value={value}
          placeholder={hint.replace(/[₦,%]/g, "")}
          onChange={(e) => onChange(e.target.value)}
          className={
            "w-full rounded-lg border border-white/10 bg-black/30 py-2 font-mono text-sm " +
            (prefix ? "pl-6 pr-2 " : "px-2 ") +
            (suffix ? "pr-6" : "")
          }
        />
        {suffix && (
          <span className="absolute inset-y-0 right-2.5 flex items-center text-xs text-zinc-500">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

/** Overrides → the flat string map the fields edit. */
function toDraft(overrides: Overrides): Draft {
  const draft: Draft = {};
  if (overrides.platformSharePercent !== undefined) {
    draft.platformSharePercent = String(overrides.platformSharePercent);
  }
  if (overrides.lifePriceKobo !== undefined) {
    draft.lifePriceKobo = String(overrides.lifePriceKobo / KOBO);
  }
  if (overrides.lifeBankKobo !== undefined) {
    draft.lifeBankKobo = String(overrides.lifeBankKobo / KOBO);
  }
  for (const [kind, spec] of Object.entries(overrides.powerUps ?? {})) {
    if (spec.share !== undefined) draft[`${kind}.share`] = String(round(spec.share * 100));
    if (spec.floorKobo !== undefined) {
      draft[`${kind}.floorKobo`] = String(spec.floorKobo / KOBO);
    }
  }
  return draft;
}

/**
 * The string map → the shape the server stores.
 *
 * An empty field is *omitted*, not sent as zero: omitted means "use the
 * default" and zero means "free", and confusing the two would hand the whole
 * shelf away.
 */
function fromDraft(draft: Draft): Overrides {
  const out: Overrides = {};
  const powerUps: Record<string, { share?: number; floorKobo?: number }> = {};

  for (const [key, raw] of Object.entries(draft)) {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) continue;

    if (key === "platformSharePercent") out.platformSharePercent = value;
    else if (key === "lifePriceKobo") out.lifePriceKobo = Math.round(value * KOBO);
    else if (key === "lifeBankKobo") out.lifeBankKobo = Math.round(value * KOBO);
    else if (key.endsWith(".share")) {
      const kind = key.slice(0, -".share".length);
      powerUps[kind] = { ...powerUps[kind], share: value / 100 };
    } else if (key.endsWith(".floorKobo")) {
      const kind = key.slice(0, -".floorKobo".length);
      powerUps[kind] = { ...powerUps[kind], floorKobo: Math.round(value * KOBO) };
    }
  }

  if (Object.keys(powerUps).length > 0) out.powerUps = powerUps;
  return out;
}

/** Three decimals is enough for a share and loses nothing anybody typed. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
