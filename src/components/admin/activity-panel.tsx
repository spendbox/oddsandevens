"use client";

// The shape of the player base, day by day.
//
// Everything else in /admin answers "how much" — this answers "how many, and
// are there more of them than last week". It is the first screen in the
// product that can tell a player who opened the app and read the board from a
// player who left in March, because until 0056 nothing wrote down a visit.
//
// One metric at a time, on one axis. Two measures of different scale on one
// chart is the mistake that makes every number on it unreadable, so the metric
// is a choice rather than an overlay — and the only chart with two series is
// the one where they stack into a whole.

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNaira } from "@/lib/game/rewards";
import { plural } from "@/lib/plural";

interface Day {
  day: string;
  activePlayers: number;
  playingPlayers: number;
  attempts: number;
  visits: number;
  loggedIn: number;
  newPlayers: number;
  revenueKobo: number;
  orders: number;
}

interface Summary {
  dau: number;
  dauYesterday: number;
  wau: number;
  mau: number;
  attemptsToday: number;
  attempts7d: number;
  attemptsTotal: number;
  playersTotal: number;
  newToday: number;
  new7d: number;
  onlineNow: number;
  everLoggedIn: number;
}

type Metric = "active" | "attempts" | "new" | "revenue";

/*
 * Every step is in the mode's lightness band and clears 3:1 against the panel,
 * checked rather than chosen by eye. They are the product's own accents pulled
 * down to that band — the bright `--mint` a button wears is far too light to
 * sit as a filled area on this surface.
 *
 * `looked` is deliberately the recessive one: it is the remainder of a whole,
 * not a category of its own, and it should read as "the rest of the bar".
 */
const INK = {
  played: "#26ab74",
  looked: "#7c66bd",
  attempts: "#2a9fd4",
  revenue: "#c9840f",
  new: "#a26be0",
} as const;

const METRICS: { id: Metric; label: string }[] = [
  { id: "active", label: "Active players" },
  { id: "attempts", label: "Guesses" },
  { id: "new", label: "New players" },
  { id: "revenue", label: "Revenue" },
];

const WINDOWS = [7, 30, 90, 180];

const CHIP =
  "rounded-lg px-3 py-1.5 text-xs font-bold transition active:translate-y-px";
const CHIP_ON = "bg-brass text-ink";
const CHIP_OFF = "bg-white/6 text-zinc-400 hover:bg-white/10 hover:text-zinc-100";

export function ActivityPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<Day[]>([]);
  const [metric, setMetric] = useState<Metric>("active");
  const [days, setDays] = useState(30);
  const [hover, setHover] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [unmigrated, setUnmigrated] = useState(false);

  /*
   * The whole fetch lives in the effect, and the `live` flag is not ceremony:
   * switching 180d → 7d starts two requests and the wide one can land second,
   * which would repaint the short window with six months of bars.
   *
   * Nothing sets `loading` back to true on a window change either. The chart
   * already has bars on it, and blanking them for the length of a round trip
   * is a flash of "no data" on a screen that has data.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch(`/api/admin/activity?days=${days}`, { cache: "no-store" });
      if (!live) return;
      setUnmigrated(res.status === 503);
      if (res.ok) {
        const body = (await res.json()) as { summary: Summary; daily: Day[] };
        if (!live) return;
        setSummary(body.summary);
        setDaily(body.daily);
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [days]);

  const value = useCallback(
    (d: Day) =>
      metric === "active"
        ? d.activePlayers
        : metric === "attempts"
          ? d.attempts
          : metric === "new"
            ? d.newPlayers
            : d.revenueKobo,
    [metric]
  );

  const peak = useMemo(() => Math.max(1, ...daily.map(value)), [daily, value]);

  /*
   * The scale the bars are drawn against, which is deliberately not the peak.
   *
   * With no headroom the tallest bar fills the plot exactly and the label that
   * says what the top of the scale *is* has nowhere to go but on top of it —
   * "₦18,900" written across the ₦18,900 bar. 8% is enough of a strip to put
   * it in and too little to read as a chart that never reaches its ceiling.
   */
  const ceiling = peak * 1.08;

  // Nothing hovered reads out the latest day — an empty readout above a chart
  // is a row of dashes that has to be explained.
  const shown = hover != null ? daily[hover] : daily[daily.length - 1];

  if (unmigrated) {
    return (
      <div className="panel rounded-2xl px-4 py-8 text-center">
        <p className="font-black tracking-tight">Activity needs a migration.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
          The database is missing <code className="font-mono">player_days</code>, or
          has it and the API hasn’t noticed. Run{" "}
          <code className="font-mono">npx supabase db push</code>, then{" "}
          <code className="font-mono">{"notify pgrst, 'reload schema';"}</code>.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Stat
          label="Active today"
          value={summary ? String(summary.dau) : "—"}
          hint={summary ? trend(summary.dau, summary.dauYesterday) : undefined}
        />
        <Stat label="This week" value={summary ? String(summary.wau) : "—"} hint="7 days" />
        <Stat label="This month" value={summary ? String(summary.mau) : "—"} hint="30 days" />
        <Stat
          label="Sticky"
          value={summary && summary.mau > 0 ? `${Math.round((summary.dau / summary.mau) * 100)}%` : "—"}
          hint="today ÷ month"
        />
      </div>

      <div className="panel rounded-2xl p-3">
        <div className="flex flex-wrap gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMetric(m.id);
                // A hover index into the old series points at a different day
                // once the measure or the window changes underneath it.
                setHover(null);
              }}
              className={`${CHIP} ${metric === m.id ? CHIP_ON : CHIP_OFF}`}
            >
              {m.label}
            </button>
          ))}
          <span className="grow" />
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                setDays(w);
                setHover(null);
              }}
              className={`${CHIP} ${days === w ? CHIP_ON : CHIP_OFF}`}
            >
              {w}d
            </button>
          ))}
        </div>

        {/* The readout. A tooltip that follows the cursor has to dodge the
            edges of its own container; a fixed line above the chart never
            does, and it is legible without a steady hand. */}
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/8 pt-3">
          <p className="font-mono text-xs text-zinc-500">
            {shown ? longDay(shown.day) : "—"}
            {hover == null && daily.length > 0 && (
              <span className="ml-2 text-zinc-600">latest</span>
            )}
          </p>
          <p className="text-sm">
            {shown ? <Readout day={shown} metric={metric} /> : <span className="text-zinc-600">No data yet.</span>}
          </p>
        </div>

        {loading && daily.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
        ) : (
          <Chart
            daily={daily}
            metric={metric}
            peak={peak}
            ceiling={ceiling}
            value={value}
            hover={hover}
            onHover={setHover}
          />
        )}

        {metric === "active" && (
          // Two series, so a legend is not optional — and the identity has to
          // survive somebody who cannot tell the two fills apart.
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
            <Key colour={INK.played} label="Played" />
            <Key colour={INK.looked} label="Looked only" />
          </div>
        )}

        <p className="mt-3 border-t border-white/8 pt-3 text-[11px] leading-relaxed text-zinc-500">
          A day runs midnight to midnight in Lagos.{" "}
          {metric === "active" && (
            <>
              <strong className="text-zinc-400">Active</strong> is anybody who opened a
              page or made a guess; <strong className="text-zinc-400">played</strong> is
              the ones who spent a life.{" "}
            </>
          )}
          {metric === "revenue"
            ? "Counted when the payment cleared, not when the checkout opened."
            : "Guesses before this went in are counted from the attempts themselves — visits are not, because nothing recorded them."}
        </p>
      </div>

      {summary && (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <Stat label="On right now" value={String(summary.onlineNow)} hint="seen in 15 min" />
          <Stat label="New today" value={String(summary.newToday)} hint={`${summary.new7d} this week`} />
          <Stat
            label="Guesses today"
            value={String(summary.attemptsToday)}
            hint={`${summary.attempts7d.toLocaleString()} this week`}
          />
          <Stat
            label="Players ever"
            value={summary.playersTotal.toLocaleString()}
            hint={plural(summary.attemptsTotal, "guess", "guesses")}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The bars.
 *
 * HTML columns rather than an SVG plot, and that is a considered choice: this
 * panel is as wide as whatever is holding it, and an SVG that stretches to fit
 * stretches its rounded corners with it. A flex row of columns is responsive
 * for free, keeps a 4px radius a 4px radius at any width, and gives every day
 * a hit target the full height of the chart rather than the height of its bar.
 */
function Chart({
  daily,
  metric,
  peak,
  ceiling,
  value,
  hover,
  onHover,
}: {
  daily: Day[];
  metric: Metric;
  peak: number;
  ceiling: number;
  value: (d: Day) => number;
  hover: number | null;
  onHover: (i: number | null) => void;
}) {
  const colour =
    metric === "attempts" ? INK.attempts : metric === "new" ? INK.new : metric === "revenue" ? INK.revenue : INK.played;
  const quiet = daily.every((d) => value(d) === 0);

  return (
    <div className="mt-3">
      <div className="relative h-40" onMouseLeave={() => onHover(null)}>
        {/* Grid: recessive, and only where a reading is actually taken. */}
        {[peak / ceiling, peak / ceiling / 2, 0].map((at, i) => (
          <div
            key={i}
            className="pointer-events-none absolute inset-x-0 border-t border-white/8"
            style={{ bottom: `${at * 100}%` }}
          />
        ))}
        <span className="pointer-events-none absolute right-0 top-0 font-mono text-[10px] text-zinc-600">
          {metric === "revenue" ? formatNaira(peak) : peak.toLocaleString()}
        </span>

        {/* Capped and centred rather than stretched. Seven days across the
            full width draws seven slabs — the 4px corner disappears, and a bar
            that wide reads as a block of colour rather than a measurement. */}
        <div
          className="flex h-full items-end justify-center"
          style={{ gap: daily.length > 90 ? 1 : 2 }}
        >
          {daily.map((d, i) => {
            const total = value(d);
            const on = hover === i;
            const played = metric === "active" ? d.playingPlayers : 0;
            const rest = metric === "active" ? Math.max(0, d.activePlayers - played) : total;
            return (
              <button
                key={d.day}
                type="button"
                aria-label={`${longDay(d.day)}: ${total}`}
                onMouseEnter={() => onHover(i)}
                onFocus={() => onHover(i)}
                className="group flex h-full flex-1 cursor-default flex-col justify-end"
                style={{ maxWidth: 46 }}
              >
                {/* A day with nothing in it still draws a hairline: an empty
                    column and a missing column look identical otherwise. */}
                {total === 0 ? (
                  <span
                    className="w-full rounded-[2px] bg-white/10 transition-colors group-hover:bg-white/20"
                    style={{ height: 2 }}
                  />
                ) : (
                  <>
                    {rest > 0 && (
                      <span
                        className="w-full rounded-t-[4px] transition-opacity"
                        style={{
                          height: `${(rest / ceiling) * 100}%`,
                          background: metric === "active" ? INK.looked : colour,
                          opacity: on || hover == null ? 1 : 0.45,
                        }}
                      />
                    )}
                    {played > 0 && (
                      <span
                        className="w-full transition-opacity"
                        style={{
                          // A 2px gap in the surface colour, so two stacked
                          // segments never bleed into one another.
                          marginTop: rest > 0 ? 2 : 0,
                          height: `${(played / ceiling) * 100}%`,
                          background: INK.played,
                          borderTopLeftRadius: rest > 0 ? 0 : 4,
                          borderTopRightRadius: rest > 0 ? 0 : 4,
                          opacity: on || hover == null ? 1 : 0.45,
                        }}
                      />
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {quiet && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-zinc-600">
            Nothing on this measure yet.
          </p>
        )}
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-600">
        <span>{daily[0] ? shortDay(daily[0].day) : ""}</span>
        <span>{daily[daily.length - 1] ? shortDay(daily[daily.length - 1].day) : ""}</span>
      </div>
    </div>
  );
}

/** Every figure for one day, in the units that day's metric is measured in. */
function Readout({ day, metric }: { day: Day; metric: Metric }) {
  if (metric === "revenue") {
    return (
      <>
        <b className="font-mono font-black text-brass">{formatNaira(day.revenueKobo)}</b>
        <span className="text-zinc-500">
          {" "}
          from {plural(day.orders, "order", "orders")}
        </span>
      </>
    );
  }
  if (metric === "new") {
    return (
      <>
        <b className="font-mono font-black">{day.newPlayers}</b>
        <span className="text-zinc-500"> joined</span>
      </>
    );
  }
  if (metric === "attempts") {
    return (
      <>
        <b className="font-mono font-black">{day.attempts.toLocaleString()}</b>
        <span className="text-zinc-500">
          {" "}
          {day.attempts === 1 ? "guess" : "guesses"} from{" "}
          {plural(day.playingPlayers, "player", "players")}
        </span>
      </>
    );
  }
  return (
    <>
      <b className="font-mono font-black">{day.activePlayers}</b>
      <span className="text-zinc-500">
        {" "}
        active · {day.playingPlayers} played · {day.attempts.toLocaleString()}{" "}
        {day.attempts === 1 ? "guess" : "guesses"}
        {day.loggedIn > 0 && ` · ${day.loggedIn} signed in`}
      </span>
    </>
  );
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={{ background: colour }} aria-hidden />
      {label}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-2xl p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-black">{value}</p>
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}

/** "up 4 on yesterday" beats "+4" for something read once a morning. */
function trend(today: number, yesterday: number): string {
  const delta = today - yesterday;
  if (delta === 0) return "same as yesterday";
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} on yesterday`;
}

// The day is a plain `YYYY-MM-DD` from Postgres, already bucketed in Lagos.
// Parsing it with `new Date()` would drag it back through the reader's own
// timezone and land some of them on the day before.
function longDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
