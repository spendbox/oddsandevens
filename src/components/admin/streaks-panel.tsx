"use client";

// The streak ladder, and who is climbing it.
//
// Thirty days, each one a list of grants, editable in place. The editor is the
// same shape as the data — a day is a row, a grant is a line in it — because
// the alternative is a form that can express less than the ladder can, and the
// first time somebody wants "a week of Life Bank *and* twenty-five lives" it
// would have to be edited in SQL instead.
//
// Nothing here is clamped in the browser. What can be stored is decided by the
// route, and the panel re-reads after every save so the numbers on screen are
// the ones that survived it.

import { useEffect, useState } from "react";
import { Flame, Plus, RotateCcw, Trash2 } from "lucide-react";
import { POWER_UPS, POWER_UP_KINDS } from "@/lib/game/power-ups";
import { grantLabel, STREAK_DAYS, type Grant, type GrantKind, type StreakDay } from "@/lib/game/streaks";

interface Climber {
  email: string;
  day: number;
  cycle: number;
  bestDay: number;
  claims: number;
  lastClaimDay: string | null;
  sameIp: number;
}

interface Body {
  enabled: boolean;
  ladder: StreakDay[];
  summary: {
    players: number;
    pastWeekOne: number;
    completed: number;
    longest: number;
    claimsAllTime: number;
    claimsToday: number;
  };
  players: Climber[];
}

/** What each kind needs filled in. */
const KINDS: { kind: GrantKind; label: string; amount: string | null; powerUp: boolean }[] = [
  { kind: "free_lives", label: "Free lives", amount: "Lives", powerUp: false },
  { kind: "life_bank", label: "Life Bank", amount: "Days", powerUp: false },
  { kind: "life_discount", label: "% off lives", amount: "Percent", powerUp: false },
  { kind: "power_up_discount", label: "% off a power-up", amount: "Percent", powerUp: true },
  { kind: "free_second_wind", label: "Second Wind", amount: null, powerUp: false },
  { kind: "free_power_up", label: "A free power-up", amount: null, powerUp: true },
];

export function StreaksPanel() {
  const [body, setBody] = useState<Body | null>(null);
  const [unmigrated, setUnmigrated] = useState(false);
  const [draft, setDraft] = useState<StreakDay[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(null);

  const take = (next: Body) => {
    setBody(next);
    setEnabled(next.enabled);
    // Every day present, in order, whether the stored ladder mentions it or
    // not: a day with no entry gives nothing, and that has to be visible.
    setDraft(
      Array.from({ length: STREAK_DAYS }, (_, i) => {
        const day = i + 1;
        return next.ladder.find((d) => d.day === day) ?? { day, grants: [] };
      })
    );
  };

  const load = async () => {
    const res = await fetch("/api/admin/streaks", { cache: "no-store" });
    setUnmigrated(res.status === 503);
    if (res.ok) take((await res.json()) as Body);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/admin/streaks", { cache: "no-store" });
      if (!live) return;
      setUnmigrated(res.status === 503);
      if (!res.ok) return;
      const next = (await res.json()) as Body;
      if (!live) return;
      take(next);
    })();
    return () => {
      live = false;
    };
  }, []);

  /*
   * Save, then read back what was actually stored.
   *
   * The route drops a grant it can't make sense of rather than refusing the
   * whole ladder, so what comes back is not always what went up — and a day
   * that quietly lost its power-up is worth seeing immediately rather than
   * when a player fails to receive it.
   */
  const save = async (days?: StreakDay[]) => {
    setSaving(true);
    setSaid(null);
    try {
      const res = await fetch("/api/admin/streaks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, days: days ?? draft ?? [] }),
      });
      if (!res.ok) {
        setSaid("That didn't save.");
        return;
      }
      await load();
      setSaid("Saved.");
    } finally {
      setSaving(false);
    }
  };

  const editDay = (day: number, grants: Grant[]) => {
    setDraft((d) => (d ?? []).map((row) => (row.day === day ? { ...row, grants } : row)));
    setSaid(null);
  };

  if (unmigrated) {
    return (
      <div className="panel rounded-2xl px-4 py-8 text-center">
        <p className="font-black tracking-tight">Streaks need a migration.</p>
        <p className="mt-1 text-sm text-zinc-400">
          Run <code className="font-mono">npx supabase db push</code>.
        </p>
      </div>
    );
  }
  if (!body || !draft) return null;

  const { summary } = body;

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Flame className="size-4 text-brass" aria-hidden />
        Daily streaks
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Thirty days. Opening the app is what counts as a day; missing one starts
        the ladder again, and day thirty loops back to day one. Everything a day
        gives is granted the moment it is claimed — free lives land above the
        ceiling, exactly as bought ones do.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="On a streak" value={String(summary.players)} hint={`${summary.claimsToday} claimed today`} />
        <Figure label="Past day seven" value={String(summary.pastWeekOne)} tone="text-mint" />
        <Figure label="Finished thirty" value={String(summary.completed)} hint={`longest ${summary.longest}`} />
        <Figure label="Claims all time" value={summary.claimsAllTime.toLocaleString()} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-black/25 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaid(null);
            }}
            className="size-4 accent-[var(--brass)]"
          />
          <span className={enabled ? "text-zinc-200" : "text-zinc-500"}>
            {enabled ? "Streaks running" : "Streaks off"}
          </span>
        </label>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-xl bg-white/8 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/12 active:translate-y-px disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save the ladder"}
        </button>

        <button
          type="button"
          onClick={() => {
            // An empty ladder is how the built-in one comes back.
            if (confirm("Throw away every change and restore the built-in thirty days?")) {
              void save([]);
            }
          }}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-zinc-400 transition hover:text-zinc-100 disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Restore the defaults
        </button>

        {said && (
          <span className={"text-sm " + (said === "Saved." ? "text-mint" : "text-berry")}>
            {said}
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-1">
        {draft.map((row) => (
          <li key={row.day} className="rounded-xl bg-black/20">
            <button
              type="button"
              onClick={() => setOpenDay(openDay === row.day ? null : row.day)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
            >
              <span className="w-8 shrink-0 font-mono text-sm font-black text-brass">
                {row.day}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                {row.grants.length === 0 ? (
                  <em className="text-zinc-600">Nothing</em>
                ) : (
                  row.grants.map(grantLabel).join(" + ")
                )}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                {openDay === row.day ? "Close" : "Edit"}
              </span>
            </button>

            {openDay === row.day && (
              <div className="space-y-2 border-t border-white/5 px-3 py-2.5">
                {row.grants.map((grant, i) => (
                  <GrantRow
                    key={i}
                    grant={grant}
                    onChange={(next) =>
                      editDay(
                        row.day,
                        row.grants.map((g, j) => (j === i ? next : g))
                      )
                    }
                    onRemove={() =>
                      editDay(
                        row.day,
                        row.grants.filter((_, j) => j !== i)
                      )
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={() =>
                    editDay(row.day, [...row.grants, { kind: "free_lives", amount: 5 }])
                  }
                  className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:bg-white/12"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add a reward to day {row.day}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h3 className="mb-2 mt-5 text-sm font-black uppercase tracking-wide text-zinc-300">
        Who is climbing
      </h3>
      {body.players.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">Nobody has claimed a day yet.</p>
      ) : (
        <ul className="space-y-1">
          {body.players.map((climber) => (
            <li
              key={climber.email}
              className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-zinc-300">{climber.email}</span>
              <span className="shrink-0 font-mono text-xs text-zinc-500">
                best {climber.bestDay} · {climber.claims} claims
              </span>
              {/* One machine running ten accounts is what thirty days of free
                  lives invites. Two or more sharing an IP hash is worth a look;
                  a household is a perfectly ordinary explanation for two. */}
              {climber.sameIp > 1 && (
                <span
                  title={`${climber.sameIp} accounts have claimed from the same network`}
                  className="shrink-0 rounded-md bg-berry/20 px-1.5 py-0.5 text-[10px] font-black text-berry"
                >
                  {climber.sameIp} on one IP
                </span>
              )}
              <span className="w-14 shrink-0 text-right font-mono font-black text-brass">
                day {climber.day}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GrantRow({
  grant,
  onChange,
  onRemove,
}: {
  grant: Grant;
  onChange: (next: Grant) => void;
  onRemove: () => void;
}) {
  const spec = KINDS.find((k) => k.kind === grant.kind) ?? KINDS[0];

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          Reward
        </span>
        <select
          value={grant.kind}
          onChange={(e) => {
            const kind = e.target.value as GrantKind;
            const next = KINDS.find((k) => k.kind === kind) ?? KINDS[0];
            // Only what the new kind uses survives the change: a Second Wind
            // carrying a leftover percentage would be stored and never read.
            onChange({
              kind,
              ...(next.amount ? { amount: grant.amount ?? 1 } : {}),
              ...(next.powerUp ? { powerUp: grant.powerUp ?? POWER_UP_KINDS[0] } : {}),
            });
          }}
          className="field w-full px-2 py-2 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      {spec.amount && (
        <label className="w-24">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            {spec.amount}
          </span>
          <input
            value={String(grant.amount ?? "")}
            inputMode="numeric"
            onChange={(e) =>
              onChange({ ...grant, amount: Number(e.target.value.replace(/[^\d]/g, "") || 0) })
            }
            className="field w-full px-2 py-2 text-sm"
          />
        </label>
      )}

      {spec.powerUp && (
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            Power-up
          </span>
          <select
            value={grant.powerUp ?? POWER_UP_KINDS[0]}
            onChange={(e) => onChange({ ...grant, powerUp: e.target.value })}
            className="field w-full px-2 py-2 text-sm"
          >
            {POWER_UP_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {POWER_UPS[kind].name}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this reward"
        className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-berry/15 hover:text-berry"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
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
