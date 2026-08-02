// Turning a season's plays into a standing.
//
// This lives on its own because two surfaces now draw the same board — the
// player's game page and the business's dashboard — and a leaderboard that
// disagrees with itself depending on who is looking is worse than no
// leaderboard at all. The rule is also the one `close_due_game_season` pays
// out on, so what the dashboard shows on Sunday night is who gets the code on
// Monday morning.

export interface FinishedPlay {
  customer_id: string | null;
  score: number;
  finished_at: string | null;
}

export interface RankedEntry {
  customerId: string;
  score: number;
  /** When they first reached that score. */
  at: string;
}

/**
 * One row per player: their best run of the season.
 *
 * A tie goes to whoever got there first. That matters: without it two people
 * on 4,820 would be ordered by whatever the database felt like returning, and
 * the one who has been top all week could lose the prize to someone who
 * equalled them on Sunday.
 */
export function rankSeason(plays: FinishedPlay[]): RankedEntry[] {
  const best = new Map<string, RankedEntry>();

  for (const play of plays) {
    if (!play.customer_id || !play.finished_at) continue;
    const existing = best.get(play.customer_id);
    const better =
      !existing ||
      play.score > existing.score ||
      (play.score === existing.score &&
        new Date(play.finished_at) < new Date(existing.at));
    if (better) {
      best.set(play.customer_id, {
        customerId: play.customer_id,
        score: play.score,
        at: play.finished_at,
      });
    }
  }

  return [...best.values()].sort(
    (a, b) =>
      b.score - a.score || new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}
