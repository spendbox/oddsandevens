// How hard a box is, said before anyone commits to it.
//
// A player about to spend weeks of lives deserves the number up front, and
// "Brutal · ~470 attempts · about 3 weeks of free lives" is a far more useful
// thing to read than a character count — which is just as well, because the
// character count is the first thing they have to work out and can't be shown.

import { Flame } from "lucide-react";
import { daysOfFreeLives, freeTime, roughly, type Difficulty } from "@/lib/game/difficulty";

const TONES: Record<Difficulty, string> = {
  Warm: "bg-mark-green/15 text-mark-green",
  Tricky: "bg-sky-500/15 text-sky-300",
  Hard: "bg-brass/15 text-brass",
  Brutal: "bg-mark-orange/15 text-mark-orange",
  Merciless: "bg-red-500/15 text-red-300",
};

export function DifficultyBadge({
  box,
  showTime = true,
}: {
  box: { difficulty: Difficulty; estimatedAttempts: number };
  showTime?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${TONES[box.difficulty]}`}
      >
        <Flame className="size-3" aria-hidden />
        {box.difficulty}
      </span>
      <span className="text-zinc-500">
        {roughly(box.estimatedAttempts)} attempts
        {showTime && (
          <> · {freeTime(daysOfFreeLives(box.estimatedAttempts))} on free lives</>
        )}
      </span>
    </span>
  );
}
