// How hard a box is: one word, and five flames' worth of it.
//
// It used to carry an attempt estimate and how many days of free lives that
// came to. Both are gone — two more numbers on a screen that had plenty, and
// neither changed what anyone did next. The tier is the decision.
//
// It stays safe to show anywhere for the same reason it always was: a tier only
// places the length in a band of five or six, where the estimate it replaced
// was a deterministic function of the exact length.

import type { Difficulty } from "@/lib/game/difficulty";

const TIERS: Record<Difficulty, { face: string; lip: string; pips: number }> = {
  Warm: { face: "bg-mint text-ink", lip: "var(--mint-deep)", pips: 1 },
  Tricky: { face: "bg-sky text-ink", lip: "var(--sky-deep)", pips: 2 },
  Hard: { face: "bg-brass text-ink", lip: "var(--brass-deep)", pips: 3 },
  Brutal: { face: "bg-mark-orange text-ink", lip: "#b35c05", pips: 4 },
  Merciless: { face: "bg-berry text-ink", lip: "var(--berry-deep)", pips: 5 },
};

export function DifficultyBadge({
  difficulty,
  /**
   * Drops the word below `sm`, leaving the pips.
   *
   * For the play screen's rail, where the badge shares a row with the prize,
   * the way back and the help — and where the word "Merciless" was taking
   * enough of a 320px screen to crush ₦7,000,000 down to "₦7,0…". The pips
   * carry the comparison on their own; the word is a label for it.
   */
  compact = false,
}: {
  difficulty: Difficulty;
  compact?: boolean;
}) {
  const tier = TIERS[difficulty];

  return (
    <span
      style={{ boxShadow: `inset 0 1.5px 0 rgb(255 255 255 / 0.45), 0 3px 0 ${tier.lip}` }}
      aria-label={compact ? difficulty : undefined}
      // `self-start`: inside a flex column the default is to stretch, and a
      // difficulty badge as wide as the card it sits on looks like a bug.
      className={`inline-flex w-fit shrink-0 self-start items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-black ${tier.face}`}
    >
      <span className={compact ? "hidden sm:inline" : undefined}>{difficulty}</span>
      {/* Five pips, filled to the tier. The word says it and the pips let you
          compare two boxes without reading either word. */}
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={
              "block size-1.5 rounded-full " +
              (i < tier.pips ? "bg-ink" : "bg-ink/25")
            }
          />
        ))}
      </span>
    </span>
  );
}
