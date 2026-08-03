"use client";

// Everything the player has paid to learn, in one place.
//
// Power-up results used to be a list of sentences you had to scroll back
// through. That doesn't survive a three-hundred-attempt hunt — by attempt 200
// nobody remembers what X-Ray said. So the purchases are folded into a
// standing summary that sits above the field while you type.
//
// Nothing arrives here that wasn't bought: the server builds `revealed` and
// this only lays it out.

import { Clock, Lightbulb } from "lucide-react";
import { SECOND_WIND_HOURS, type Revealed } from "@/lib/game/power-ups";
import { countdown } from "@/components/player/lives-badge";

export function KnownPanel({
  revealed,
  now,
}: {
  revealed: Revealed;
  /** Passed in rather than read here: rendering must not call the clock. */
  now: number;
}) {
  const windRunning =
    !!revealed.secondWindUntil && new Date(revealed.secondWindUntil).getTime() > now;

  const hasAnything =
    revealed.length !== null ||
    revealed.charset !== null ||
    revealed.caseMap !== null ||
    windRunning;

  if (!hasAnything) return null;

  return (
    <section className="panel space-y-3 rounded-2xl p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brass">
        <Lightbulb className="size-3.5" aria-hidden />
        What you know
      </h2>

      {revealed.length !== null && (
        <Row label="Length">
          <span className="font-mono text-zinc-100">{revealed.length} characters</span>
        </Row>
      )}

      {revealed.caseMap && (
        <Row label="Made of">
          <span className="font-mono text-xs text-zinc-300">
            {revealed.caseMap.upper} upper · {revealed.caseMap.lower} lower ·{" "}
            {revealed.caseMap.digits} digits · {revealed.caseMap.specials} symbols
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
              — half of them, in no order
            </span>
          </span>
        </Row>
      )}

      {windRunning && (
        <Row label="Free run">
          <span className="flex items-center gap-1.5 text-xs text-mark-green">
            <Clock className="size-3.5" aria-hidden />
            Guesses cost no lives for{" "}
            <span className="font-mono">
              {countdown(revealed.secondWindUntil as string, now)}
            </span>
          </span>
        </Row>
      )}

      {!windRunning && revealed.used.second_wind && (
        <Row label="Free run">
          <span className="text-xs text-zinc-500">
            Lapsed. {SECOND_WIND_HOURS === 1 ? "An hour" : `${SECOND_WIND_HOURS} hours`} at
            a time, buyable again.
          </span>
        </Row>
      )}
    </section>
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
