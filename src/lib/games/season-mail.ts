// Posting the prize emails when a week closes.
//
// close_due_game_season decides the winners and mints their codes inside one
// transaction; it deliberately doesn't send anything. This is the mailer that
// drains the queue it leaves behind — rows in game_season_winners with a prize
// and no notified_at — and it is safe to call from any request that happens to
// notice a week has ended.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRewardUnlockedEmail } from "@/lib/email";

// A cap so one unlucky request never carries a huge send.
const BATCH = 25;

/**
 * Emails every unnotified winner of a merchant's games. Returns how many went
 * out. Failures are logged and left unmarked, so the next call retries them.
 */
export async function notifySeasonWinners(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  merchantId: string
): Promise<number> {
  const { data: merchant } = await db
    .from("merchants")
    .select("business_name, slug")
    .eq("id", merchantId)
    .maybeSingle();
  if (!merchant) return 0;

  const { data: games } = await db
    .from("games")
    .select("id, title")
    .eq("merchant_id", merchantId);
  const gameIds = (games ?? []).map((g: { id: string }) => g.id);
  if (gameIds.length === 0) return 0;
  const titleById = new Map(
    (games ?? []).map((g: { id: string; title: string }) => [g.id, g.title])
  );

  const { data: pending } = await db
    .from("game_season_winners")
    .select("id, game_id, customer_id, rank, score, unlocked_reward_id")
    .in("game_id", gameIds)
    .is("notified_at", null)
    .not("unlocked_reward_id", "is", null)
    .limit(BATCH);

  const rows = (pending ?? []) as {
    id: string;
    game_id: string;
    customer_id: string | null;
    rank: number;
    score: number;
    unlocked_reward_id: string;
  }[];
  if (rows.length === 0) return 0;

  const [{ data: unlocks }, { data: customers }] = await Promise.all([
    db
      .from("unlocked_rewards")
      .select("id, redemption_code, expires_at, game_prize_id")
      .in(
        "id",
        rows.map((r) => r.unlocked_reward_id)
      ),
    db
      .from("customers")
      .select("id, email")
      .in(
        "id",
        rows.map((r) => r.customer_id).filter((id): id is string => id !== null)
      ),
  ]);

  const unlockById = new Map(
    (unlocks ?? []).map(
      (u: {
        id: string;
        redemption_code: string;
        expires_at: string;
        game_prize_id: string | null;
      }) => [u.id, u]
    )
  );
  const emailById = new Map(
    (customers ?? []).map((c: { id: string; email: string }) => [c.id, c.email])
  );

  const prizeIds = [...unlockById.values()]
    .map((u) => u.game_prize_id)
    .filter((id): id is string => id !== null);
  const { data: prizes } = prizeIds.length
    ? await db
        .from("game_prizes")
        .select("id, description")
        .in("id", prizeIds)
    : { data: [] };
  const prizeById = new Map(
    ((prizes ?? []) as { id: string; description: string }[]).map((p) => [
      p.id,
      p.description,
    ])
  );

  let sent = 0;
  for (const row of rows) {
    const unlock = unlockById.get(row.unlocked_reward_id);
    const email = row.customer_id ? emailById.get(row.customer_id) : null;
    if (!unlock || !email) continue;

    const description = unlock.game_prize_id
      ? (prizeById.get(unlock.game_prize_id) ?? "Your prize")
      : "Your prize";
    const place =
      row.rank === 1 ? "1st" : row.rank === 2 ? "2nd" : row.rank === 3 ? "3rd" : `${row.rank}th`;

    await sendRewardUnlockedEmail({
      to: email,
      businessName: merchant.business_name,
      slug: merchant.slug,
      // The subject line is the prize; the placing belongs with it.
      description: `${description} — ${place} place on ${titleById.get(row.game_id) ?? "the leaderboard"}`,
      code: unlock.redemption_code,
      expiresAt: unlock.expires_at,
    });

    // Marked only after the send: a failure here leaves it queued for the
    // next caller rather than silently dropping someone's prize.
    await db
      .from("game_season_winners")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", row.id);
    sent += 1;
  }

  return sent;
}
