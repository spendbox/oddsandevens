// How hard a box is: one word.
//
// It used to carry an attempt estimate and how many days of free lives that
// came to, for the contributor who wrote the password. Both are gone. They were
// two more numbers on a screen that already had plenty, and neither changed
// what anyone did next — the tier is the decision.
//
// It stays safe to show anywhere for the same reason it always was: a tier only
// places the length in a band of five or six, where the estimate it replaced
// was a deterministic function of the exact length.

import { Flame } from "lucide-react";
import type { Difficulty } from "@/lib/game/difficulty";

const TONES: Record<Difficulty, string> = {
  Warm: "bg-mark-green/15 text-mark-green",
  Tricky: "bg-sky-500/15 text-sky-300",
  Hard: "bg-brass/15 text-brass",
  Brutal: "bg-mark-orange/15 text-mark-orange",
  Merciless: "bg-red-500/15 text-red-300",
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[difficulty]}`}
    >
      <Flame className="size-3" aria-hidden />
      {difficulty}
    </span>
  );
}
