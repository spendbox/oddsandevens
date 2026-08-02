import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { rankSeason } from "@/lib/games/board";

// The board as the business sees it.
//
// Same ranking as the player's page — `rankSeason`, the rule the payout runs
// on — but addresses are not masked here. The business is the one who hands
// the prize over the counter, and it already sees these addresses in
// Customers; masking them would only mean a winner walks in with a code the
// owner can't match to anyone.
//
// Two things the player's page doesn't show: how many people are on the board
// but off the visible end of it, and the settled results of previous weeks
// with whether the winner's code has been redeemed yet.

const TOP_LIMIT = 50;
const PAST_SEASONS = 6;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: game } = await db
    .from("games")
    .select("id, slug, title, type, award_mode, season_days")
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!game) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  if (game.award_mode !== "leaderboard") {
    return NextResponse.json({ error: "not_a_competition" }, { status: 400 });
  }

  // Reading the board is also when a finished week gets settled, exactly as on
  // the play page — so a business checking on Monday sees the prizes gone out
  // rather than a week that ended on Sunday and never closed.
  await db.rpc("close_due_game_season", { p_game_id: game.id });

  const { data: prizes } = await db
    .from("game_prizes")
    .select("description, award_rank")
    .eq("game_id", game.id)
    .not("award_rank", "is", null);
  const prizeByRank = new Map(
    (prizes ?? []).map((p) => [p.award_rank as number, p.description as string])
  );

  // ---- This week ---------------------------------------------------------
  const { data: open } = await db
    .from("game_seasons")
    .select("id, number, starts_at, ends_at")
    .eq("game_id", game.id)
    .eq("status", "open")
    .maybeSingle();

  let season: {
    number: number;
    startsAt: string;
    endsAt: string;
  } | null = null;
  let leaderboard: {
    rank: number;
    email: string;
    score: number;
    at: string;
    prize: string | null;
  }[] = [];
  let playerCount = 0;

  if (open) {
    season = {
      number: open.number,
      startsAt: open.starts_at,
      endsAt: open.ends_at,
    };

    const { data: plays } = await db
      .from("game_plays")
      .select("customer_id, score, finished_at")
      .eq("season_id", open.id)
      .not("finished_at", "is", null)
      .not("customer_id", "is", null)
      .gt("score", 0)
      .order("score", { ascending: false })
      .limit(2000);

    const ranked = rankSeason(plays ?? []);
    playerCount = ranked.length;

    const top = ranked.slice(0, TOP_LIMIT);
    const { data: customers } = top.length
      ? await db
          .from("customers")
          .select("id, email")
          .in(
            "id",
            top.map((entry) => entry.customerId)
          )
      : { data: [] as { id: string; email: string }[] };
    const emailById = new Map((customers ?? []).map((c) => [c.id, c.email]));

    leaderboard = top.map((entry, index) => ({
      rank: index + 1,
      email: emailById.get(entry.customerId) ?? "—",
      score: entry.score,
      at: entry.at,
      prize: prizeByRank.get(index + 1) ?? null,
    }));
  }

  // ---- Weeks already settled --------------------------------------------
  const { data: closed } = await db
    .from("game_seasons")
    .select("id, number, starts_at, ends_at, closed_at")
    .eq("game_id", game.id)
    .eq("status", "closed")
    .order("ends_at", { ascending: false })
    .limit(PAST_SEASONS);

  const closedIds = (closed ?? []).map((s) => s.id);
  const { data: winners } = closedIds.length
    ? await db
        .from("game_season_winners")
        .select(
          "season_id, rank, score, customer_id, notified_at, customers(email), game_prizes(description), unlocked_rewards(redemption_code, redeemed_at, expires_at)"
        )
        .in("season_id", closedIds)
        .order("rank", { ascending: true })
    : { data: [] };

  const past = (closed ?? []).map((s) => ({
    number: s.number,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    closedAt: s.closed_at,
    winners: (winners ?? [])
      .filter((w) => w.season_id === s.id)
      .map((w) => {
        const reward = w.unlocked_rewards as unknown as {
          redemption_code: string;
          redeemed_at: string | null;
          expires_at: string | null;
        } | null;
        return {
          rank: w.rank as number,
          score: w.score as number,
          email:
            (w.customers as unknown as { email: string } | null)?.email ?? "—",
          prize:
            (w.game_prizes as unknown as { description: string } | null)
              ?.description ?? null,
          code: reward?.redemption_code ?? null,
          redeemedAt: reward?.redeemed_at ?? null,
          expiresAt: reward?.expires_at ?? null,
          emailedAt: (w.notified_at as string | null) ?? null,
        };
      }),
  }));

  return NextResponse.json({
    game: { id: game.id, slug: game.slug, title: game.title, type: game.type },
    seasonDays: game.season_days,
    season,
    playerCount,
    shown: leaderboard.length,
    leaderboard,
    past,
  });
}
