import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/mask";
import { playerEmail } from "@/lib/player-session";
import { gameDef } from "@/lib/games/catalog";
import { rankSeason } from "@/lib/games/board";
import type {
  GameSeason,
  LeaderboardEntry,
  PastWinner,
  PublicGame,
  PublicGameHost,
} from "@/lib/games/types";

const LEADERBOARD_LIMIT = 20;

// One game as the player is allowed to see it: the authored config, the prize
// labels, and this week's leaderboard with every address masked. Never a draw
// weight, and never the stock of anything still winnable.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; game: string }> }
) {
  const { slug, game: gameSlug } = await params;
  const db = supabaseAdmin();

  const { data: merchant } = await db
    .from("merchants")
    .select(
      "id, business_name, slug, logo_url, tagline, brand_color, whatsapp, contact_email, weekly_lives, max_bonus_lives, profile"
    )
    .eq("slug", slug.toLowerCase())
    .single();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: game } = await db
    .from("games")
    .select(
      "id, slug, type, engine, title, description, status, config, theme, cooldown_hours, max_wins_per_player, plays_count, wins_count, award_mode, season_days"
    )
    .eq("merchant_id", merchant.id)
    .eq("slug", gameSlug.toLowerCase())
    .maybeSingle();
  if (!game || game.status === "archived") {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  if (game.status !== "active") {
    return NextResponse.json({ error: "game_paused" }, { status: 403 });
  }

  const isLeaderboard = game.award_mode === "leaderboard";

  // Reading the page is when a finished week gets settled: prizes go out, the
  // board resets, and the next week opens.
  if (isLeaderboard) {
    await db.rpc("close_due_game_season", { p_game_id: game.id });
  }

  const def = gameDef(game.type);
  const { data: prizes } = await db
    .from("game_prizes")
    .select(
      "position, kind, description, details, icon, min_score, award_rank, stock, claimed"
    )
    .eq("game_id", game.id)
    .order("position", { ascending: true });

  const prizeByRank = new Map(
    (prizes ?? [])
      .filter((p) => p.kind === "prize" && p.award_rank !== null)
      .map((p) => [p.award_rank as number, p.description as string])
  );

  // Who's asking — the signed cookie, so nobody can read another player's
  // standing (or share code) by guessing their address.
  const email = await playerEmail();
  const { data: customer } = email
    ? await db.from("customers").select("id").eq("email", email).maybeSingle()
    : { data: null };

  // ---- This week's board -------------------------------------------------
  let season: GameSeason | null = null;
  let leaderboard: LeaderboardEntry[] = [];
  let lastWinners: PastWinner[] = [];
  let playerCount = 0;
  let player: {
    email: string;
    livesLeft: number;
    bestScore: number;
    rank: number | null;
    shareCode: string | null;
    nextPlayAt: string | null;
  } | null = null;

  if (isLeaderboard) {
    const { data: current } = await db
      .from("game_seasons")
      .select("id, number, starts_at, ends_at")
      .eq("game_id", game.id)
      .eq("status", "open")
      .maybeSingle();

    if (current) {
      season = {
        number: current.number,
        startsAt: current.starts_at,
        endsAt: current.ends_at,
      };

      const { data: plays } = await db
        .from("game_plays")
        .select("customer_id, score, finished_at")
        .eq("season_id", current.id)
        .not("finished_at", "is", null)
        .not("customer_id", "is", null)
        .gt("score", 0)
        .order("score", { ascending: false })
        .limit(500);

      const ranked = rankSeason(plays ?? []);
      playerCount = ranked.length;

      const top = ranked.slice(0, LEADERBOARD_LIMIT);

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
        maskedEmail: maskEmail(
          emailById.get(entry.customerId) ?? "player@unknown.com"
        ),
        score: entry.score,
        at: entry.at,
        rank: index + 1,
        prize: prizeByRank.get(index + 1) ?? null,
        isYou: customer?.id === entry.customerId,
      }));

      if (customer && email) {
        const myIndex = ranked.findIndex((e) => e.customerId === customer.id);
        // Lives are one pool per business, so this is the same number on every
        // game the business runs.
        const [{ data: lives }, { data: shareCode }] = await Promise.all([
          db.rpc("merchant_lives_left", {
            p_merchant_id: merchant.id,
            p_customer_id: customer.id,
          }),
          db.rpc("get_or_create_referral", {
            p_game_id: game.id,
            p_customer_id: customer.id,
          }),
        ]);
        player = {
          email,
          livesLeft: Number(lives ?? 0),
          bestScore: myIndex >= 0 ? ranked[myIndex].score : 0,
          rank: myIndex >= 0 ? myIndex + 1 : null,
          shareCode: (shareCode as string | null) ?? null,
          nextPlayAt: null,
        };
      }
    }

    // How the previous week finished, so the board has some history on it.
    const { data: closed } = await db
      .from("game_seasons")
      .select("id")
      .eq("game_id", game.id)
      .eq("status", "closed")
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (closed) {
      const { data: winners } = await db
        .from("game_season_winners")
        .select("rank, score, customer_id, prize_id")
        .eq("season_id", closed.id)
        .order("rank", { ascending: true })
        .limit(5);

      const winnerIds = (winners ?? [])
        .map((w) => w.customer_id)
        .filter((id): id is string => id !== null);
      const { data: winnerCustomers } = winnerIds.length
        ? await db.from("customers").select("id, email").in("id", winnerIds)
        : { data: [] as { id: string; email: string }[] };
      const emailById = new Map(
        (winnerCustomers ?? []).map((c) => [c.id, c.email])
      );
      lastWinners = (winners ?? []).map((w) => ({
        rank: w.rank,
        maskedEmail: maskEmail(
          emailById.get(w.customer_id ?? "") ?? "player@unknown.com"
        ),
        score: w.score,
        prize: prizeByRank.get(w.rank) ?? null,
      }));
    }
  } else if (customer && email) {
    // Instant-win games keep their cooldown.
    const { data: mine } = await db
      .from("game_plays")
      .select("score, won, finished_at")
      .eq("game_id", game.id)
      .eq("customer_id", customer.id)
      .not("finished_at", "is", null);
    const rows = mine ?? [];
    const lastAt = rows.reduce<number>(
      (max, r) => Math.max(max, new Date(r.finished_at as string).getTime()),
      0
    );
    const nextAt =
      game.cooldown_hours > 0 && lastAt > 0
        ? lastAt + game.cooldown_hours * 3600_000
        : 0;
    player = {
      email,
      livesLeft: 0,
      bestScore: rows.reduce((max, r) => Math.max(max, r.score), 0),
      rank: null,
      shareCode: null,
      nextPlayAt: nextAt > Date.now() ? new Date(nextAt).toISOString() : null,
    };
  }

  const host: PublicGameHost = {
    businessName: merchant.business_name,
    slug: merchant.slug,
    logoUrl: merchant.logo_url,
    tagline: merchant.tagline,
    brandColor: merchant.brand_color,
    whatsapp: merchant.whatsapp,
    contactEmail: merchant.contact_email,
  };

  const publicGame: PublicGame = {
    slug: game.slug,
    type: game.type,
    engine: game.engine,
    title: game.title,
    description: game.description,
    config: game.config ?? {},
    theme: game.theme ?? {},
    cooldownHours: game.cooldown_hours,
    maxWinsPerPlayer: game.max_wins_per_player,
    prizes: (prizes ?? []).map((p) => ({
      position: p.position,
      kind: p.kind,
      description: p.description,
      details: p.details,
      icon: p.icon,
      minScore: p.min_score,
      awardRank: p.award_rank,
      // "Sold out" is safe to publish: it can only ever make the game honest.
      soldOut: p.kind === "prize" && p.claimed >= p.stock,
    })),
    playsCount: game.plays_count,
    winsCount: game.wins_count,
    hasLeaderboard: isLeaderboard || (def?.hasLeaderboard ?? false),
    leaderboard,
    awardMode: isLeaderboard ? "leaderboard" : "instant",
    season,
    lastWinners,
    // One pool of lives across everything this business runs.
    weeklyLives: merchant.weekly_lives,
    maxBonusLives: merchant.max_bonus_lives,
    playerCount,
  };

  return NextResponse.json({ host, game: publicGame, player });
}
