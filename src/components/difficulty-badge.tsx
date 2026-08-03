// How hard a box is.
//
// Players get the tier and nothing else. The attempt estimate is a
// deterministic function of the password's length, so printing it publicly
// would hand over the exact answer to the first thing a player has to work
// out — the tier only places the length in a band of five or six.
//
// Contributors get the full reading, because they wrote the password and
// already know its length. That's what `detail` is for, and it must never be
// set on a player-facing surface.

import { Flame } from "lucide-react";
import { daysOfFreeLives, freeTime, roughly, type Difficulty } from "@/lib/game/difficulty";
import { MAX_ATTEMPTS_PER_BOX_PER_DAY } from "@/lib/constants";

const TONES: Record<Difficulty, string> = {
  Warm: "bg-mark-green/15 text-mark-green",
  Tricky: "bg-sky-500/15 text-sky-300",
  Hard: "bg-brass/15 text-brass",
  Brutal: "bg-mark-orange/15 text-mark-orange",
  Merciless: "bg-red-500/15 text-red-300",
};

export function DifficultyBadge({
  difficulty,
  detail,
}: {
  difficulty: Difficulty;
  /**
   * Contributor-only. Adds the attempt estimate and how long it represents.
   * Never pass this on a page a player can see.
   */
  detail?: { estimatedAttempts: number };
}) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${TONES[difficulty]}`}
      >
        <Flame className="size-3" aria-hidden />
        {difficulty}
      </span>
      {detail && (
        <span className="text-zinc-500">
          {roughly(detail.estimatedAttempts)} attempts ·{" "}
          {freeTime(daysOfFreeLives(detail.estimatedAttempts))} on free lives · at
          least{" "}
          {freeTime(detail.estimatedAttempts / MAX_ATTEMPTS_PER_BOX_PER_DAY)} even
          if bought
        </span>
      )}
    </span>
  );
}
