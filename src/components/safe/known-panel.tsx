"use client";

// Everything the player has paid for, in one place.
//
// This used to sit in the middle of the play screen as a standing panel, and
// the moment anybody bought anything the game screen grew a stack of prose
// boxes over the top of the chase — the old, pre-scene layout, arriving as a
// reward for spending money. It is a sheet now, opened from the dock, and the
// scene stays the scene.
//
// Two things live in it, and the split matters. **What you know** is permanent:
// facts about the password that were bought once and are true forever. **What's
// running** is a clock: Second Wind and Colour Read are rented, and the only
// urgent thing about them is how long is left.
//
// Nothing arrives here that wasn't bought: the server builds `revealed` and
// this only lays it out.

import { Clock, Lightbulb, Zap } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  POWER_UPS,
  SECOND_WIND_HOURS,
  type Revealed,
  type ScanField,
} from "@/lib/game/power-ups";
import { countdown } from "@/components/player/lives-badge";
import { plural } from "@/lib/plural";

/** The scans, in the order they read best as a sentence about a password. */
const SCAN_ROWS: { field: ScanField; noun: string }[] = [
  { field: "vowels", noun: "vowel" },
  { field: "consonants", noun: "consonant" },
  { field: "numbers", noun: "digit" },
  { field: "symbols", noun: "symbol" },
];

/** A power-up that is running right now, and when it stops. */
export interface Running {
  kind: "second_wind" | "breakdown";
  until: string;
}

/** Which rented power-ups are in force. Empty when none are. */
export function runningNow(revealed: Revealed, now: number): Running[] {
  const out: Running[] = [];
  if (revealed.secondWindUntil && new Date(revealed.secondWindUntil).getTime() > now) {
    out.push({ kind: "second_wind", until: revealed.secondWindUntil });
  }
  if (revealed.breakdownUntil && new Date(revealed.breakdownUntil).getTime() > now) {
    out.push({ kind: "breakdown", until: revealed.breakdownUntil });
  }
  return out;
}

/** Whether there is anything at all to show. The dock button reads this. */
export function knowsAnything(revealed: Revealed, now: number): boolean {
  return (
    revealed.length !== null ||
    revealed.charset !== null ||
    revealed.caseMap !== null ||
    SCAN_ROWS.some((row) => revealed.scans[row.field] !== undefined) ||
    runningNow(revealed, now).length > 0
  );
}

/** The sheet. Opened from the dock, closed the moment it has been read. */
export function KnownDialog({
  revealed,
  now,
  onClose,
}: {
  revealed: Revealed;
  now: number;
  onClose: () => void;
}) {
  return (
    <Modal
      title="What you know"
      subtitle="Everything you've paid to find out."
      icon={<Lightbulb className="size-5 text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Back to work
        </button>
      }
    >
      <KnownPanel revealed={revealed} now={now} />
    </Modal>
  );
}

export function KnownPanel({
  revealed,
  now,
}: {
  revealed: Revealed;
  /** Passed in rather than read here: rendering must not call the clock. */
  now: number;
}) {
  const scanned = SCAN_ROWS.filter((row) => revealed.scans[row.field] !== undefined);
  const running = runningNow(revealed, now);

  if (!knowsAnything(revealed, now)) {
    return (
      <p className="pb-1 text-sm text-zinc-400">
        Nothing yet. Every power-up you buy puts its answer here, and it stays
        for as long as the hunt does.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-1">
      {/* Running first. It is the only part of this screen with a deadline on
          it, and a deadline read too late is the same as not reading it. */}
      {running.length > 0 && (
        <section className="space-y-2 rounded-2xl border-2 border-mint/35 bg-mint/10 p-3">
          <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-mint">
            <Zap className="size-3.5" aria-hidden />
            Running now
          </h3>
          {running.map((one) => (
            <div key={one.kind} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  {POWER_UPS[one.kind].name}
                </span>
                <span className="block text-xs leading-snug text-zinc-400">
                  {one.kind === "second_wind"
                    ? "Every guess is free. No lives spent at all."
                    : "Every score, past and future, split into its three parts."}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-black tabular-nums text-mint">
                <Clock className="size-3.5" aria-hidden />
                {countdown(one.until, now)}
              </span>
            </div>
          ))}
        </section>
      )}

      {revealed.length !== null && (
        <Row label="Length">
          <span className="font-mono text-zinc-100">
            {plural(revealed.length, "character")}
          </span>
        </Row>
      )}

      {revealed.caseMap && (
        <Row label="Made of">
          <span className="font-mono text-xs text-zinc-300">
            {plural(revealed.caseMap.upper, "capital")} ·{" "}
            {plural(revealed.caseMap.lower, "lowercase letter")} ·{" "}
            {plural(revealed.caseMap.digits, "digit")} ·{" "}
            {plural(revealed.caseMap.specials, "symbol")}
          </span>
        </Row>
      )}

      {scanned.length > 0 && (
        <Row label="Scanned">
          <span className="flex flex-wrap gap-1.5">
            {scanned.map((row) => (
              <span
                key={row.field}
                className="rounded-md bg-white/6 px-1.5 py-0.5 font-mono text-xs text-zinc-200"
              >
                {plural(revealed.scans[row.field] ?? 0, row.noun)}
              </span>
            ))}
          </span>
        </Row>
      )}

      {revealed.charset && (
        <Row label="Built from">
          <span className="flex flex-wrap gap-1">
            {revealed.charset.map((char, i) => (
              <span
                key={`${char}-${i}`}
                className="rounded-md bg-brass/15 px-1.5 py-0.5 font-mono text-xs text-brass"
              >
                {char}
              </span>
            ))}
            <span className="self-center text-xs text-zinc-500">
              {revealed.charsetTotal && revealed.charset.length < revealed.charsetTotal
                ? `— ${revealed.charset.length} of ${revealed.charsetTotal}, in no order`
                : "— all of them, in no order"}
            </span>
          </span>
        </Row>
      )}

      {running.every((one) => one.kind !== "second_wind") && revealed.used.second_wind && (
        <Row label="Free run">
          <span className="text-xs text-zinc-500">
            Lapsed. {SECOND_WIND_HOURS === 1 ? "An hour" : `${SECOND_WIND_HOURS} hours`} at
            a time, buyable again.
          </span>
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="w-20 shrink-0 text-xs text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
