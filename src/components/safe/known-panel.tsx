"use client";

// Everything the player has paid to learn, in one place.
//
// Power-up results used to be a list of sentences you had to scroll back
// through. That doesn't survive a three-hundred-attempt hunt — by attempt 200
// nobody remembers that position 7 is `Q`. So the purchases are folded into a
// standing summary that sits above the field while you type.

import { Lightbulb } from "lucide-react";
import type { Revealed } from "@/lib/game/power-ups";

export function KnownPanel({ revealed }: { revealed: Revealed }) {
  const positions = Object.entries(revealed.positions).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  );
  const hasAnything =
    revealed.length !== null ||
    positions.length > 0 ||
    revealed.dead.length > 0 ||
    revealed.charset !== null ||
    revealed.caseMap !== null;

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

      {positions.length > 0 && (
        <Row label="Locked in">
          <span className="flex flex-wrap gap-1">
            {positions.map(([index, char]) => (
              <span
                key={index}
                title={`Position ${Number(index) + 1}`}
                className="flex items-center gap-1 rounded-md bg-brass/15 px-1.5 py-0.5 font-mono text-xs text-brass"
              >
                <span className="text-[10px] text-brass/60">{Number(index) + 1}</span>
                {char}
              </span>
            ))}
          </span>
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
          <span className="break-all font-mono text-xs text-zinc-200">
            {revealed.charset.join(" ")}
          </span>
        </Row>
      )}

      {revealed.dead.length > 0 && (
        <Row label="Ruled out">
          <span className="break-all font-mono text-xs text-zinc-600 line-through">
            {revealed.dead.join(" ")}
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
