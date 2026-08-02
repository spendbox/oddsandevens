import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/mask";
import { playerEmail } from "@/lib/player-session";
import type {
  GameSeason,
  LeaderboardEntry,
  PublicGamesHub,
} from "@/lib/games/types";

// The business's game hub: branding, every game that is live right now, and
// the top of each game's board so the shared link is a scoreboard rather than
// a menu. Prize teasers are descriptions only — never odds, never stock.

/** How many rows of each game's board the hub shows. */
const HUB_BOARD_ROWS = 3;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const { data: merchant } = await db
    .from("merchants")
    .select(
      "id, business_name, slug, logo_url, tagline, brand_color, whatsapp, contact_email, daily_lives, max_bonus_lives"
    )
    .eq("slug", slug.toLowerCase())
    .single();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: games } = await db
    .from("games")
    .select("id, slug, type, title, description, theme, plays_count, award_mode, created_at")
    .eq("merchant_id", merchant.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const live = games ?? [];
  const ids = live.map((g) => g.id);

  // Opening the hub is also when a finished week gets settled — prizes out,
  // board reset, next week open — so a shared link is never showing a stale
  // competition.
  await Promise.all(
    live
      .filter((g) => g.award_mode === "leaderboard")
      .map((g) => db.rpc("close_due_game_season", { p_game_id: g.id }))
  );

  const email = await playerEmail();
  const { data: customer } = email
    ? await db.from("customers").select("id").eq("email", email).maybeSingle()
    : { data: null };

  const [{ data: prizes }, { data: seasons }] = await Promise.all([
    ids.length
      ? db
          .from("game_prizes")
          .select("game_id, description, kind, position, award_rank")
          .in("game_id", ids)
          .eq("kind", "prize")
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as { game_id: string; description: string; award_rank: number | null }[] }),
    ids.length
      ? db
          .from("game_seasons")
          .select("id, game_id, number, starts_at, ends_at")
          .in("game_id", ids)
          .eq("status", "open")
      : Promise.resolve({ data: [] as { id: string; game_id: string; number: number; starts_at: string; ends_at: string }[] }),
  ]);

  const seasonByGame = new Map((seasons ?? []).map((s) => [s.game_id, s]));
  const seasonIds = (seasons ?? []).map((s) => s.id);

  // Every open board in one query, then best-per-player per game — the same
  // rule the game page and the payout use: highest score, ties to whoever got
  // there first.
  const { data: plays } = seasonIds.length
    ? await db
        .from("game_plays")
        .select("game_id, season_id, customer_id, score, finished_at")
        .in("season_id", seasonIds)
        .not("finished_at", "is", null)
        .not("customer_id", "is", null)
        .gt("score", 0)
        .order("score", { ascending: false })
        .limit(1000)
    : { data: [] as { game_id: string; customer_id: string; score: number; finished_at: string }[] };

  const bestByGame = new Map<string, Map<string, { score: number; at: string }>>();
  for (const play of plays ?? []) {
    const board =
      bestByGame.get(play.game_id) ??
      new Map<string, { score: number; at: string }>();
    const held = board.get(play.customer_id as string);
    const at = play.finished_at as string;
    if (
      !held ||
      play.score > held.score ||
      (play.score === held.score && new Date(at) < new Date(held.at))
    ) {
      board.set(play.customer_id as string, { score: play.score, at });
    }
    bestByGame.set(play.game_id, board);
  }

  const rankedByGame = new Map<string, [string, { score: number; at: string }][]>();
  for (const [gameId, board] of bestByGame) {
    rankedByGame.set(
      gameId,
      [...board.entries()].sort(
        (a, b) =>
          b[1].score - a[1].score ||
          new Date(a[1].at).getTime() - new Date(b[1].at).getTime()
      )
    );
  }

  // One lookup for every address that will appear on any board.
  const shown = new Set<string>();
  for (const ranked of rankedByGame.values()) {
    for (const [id] of ranked.slice(0, HUB_BOARD_ROWS)) shown.add(id);
  }
  const { data: customers } = shown.size
    ? await db.from("customers").select("id, email").in("id", [...shown])
    : { data: [] as { id: string; email: string }[] };
  const emailById = new Map((customers ?? []).map((c) => [c.id, c.email]));

  const prizeByGameRank = new Map<string, Map<number, string>>();
  for (const prize of prizes ?? []) {
    if (prize.award_rank === null) continue;
    const ranks = prizeByGameRank.get(prize.game_id) ?? new Map<number, string>();
    ranks.set(prize.award_rank, prize.description);
    prizeByGameRank.set(prize.game_id, ranks);
  }

  const hubGames = live.map((g) => {
    const ranked = rankedByGame.get(g.id) ?? [];
    const ranks = prizeByGameRank.get(g.id);
    const season = seasonByGame.get(g.id);
    const mine = customer
      ? ranked.findIndex(([id]) => id === customer.id)
      : -1;

    const leaderboard: LeaderboardEntry[] = ranked
      .slice(0, HUB_BOARD_ROWS)
      .map(([id, entry], index) => ({
        maskedEmail: maskEmail(emailById.get(id) ?? "player@unknown.com"),
        score: entry.score,
        at: entry.at,
        rank: index + 1,
        prize: ranks?.get(index + 1) ?? null,
        isYou: customer?.id === id,
      }));

    return {
      slug: g.slug,
      type: g.type,
      title: g.title,
      description: g.description,
      theme: g.theme ?? {},
      playsCount: g.plays_count,
      prizeTeasers: (prizes ?? [])
        .filter((p) => p.game_id === g.id)
        .slice(0, 3)
        .map((p) => p.description),
      leaderboard,
      season: season
        ? ({
            number: season.number,
            startsAt: season.starts_at,
            endsAt: season.ends_at,
          } satisfies GameSeason)
        : null,
      playerCount: ranked.length,
      yourRank: mine >= 0 ? mine + 1 : null,
      yourBest: mine >= 0 ? ranked[mine][1].score : 0,
    };
  });

  // The games people are actually playing come first — a busy board is the
  // reason to tap, and a game nobody has opened yet is the least interesting
  // thing on the page.
  hubGames.sort(
    (a, b) =>
      b.playerCount - a.playerCount ||
      b.playsCount - a.playsCount ||
      a.title.localeCompare(b.title)
  );

  let player: PublicGamesHub["player"] = null;
  if (customer) {
    const { data: lives } = await db.rpc("merchant_lives_left", {
      p_merchant_id: merchant.id,
      p_customer_id: customer.id,
    });
    player = {
      livesLeft: Number(lives ?? 0),
      dailyLives: merchant.daily_lives,
      maxBonusLives: merchant.max_bonus_lives,
    };
  }

  const hub: PublicGamesHub = {
    host: {
      businessName: merchant.business_name,
      slug: merchant.slug,
      logoUrl: merchant.logo_url,
      tagline: merchant.tagline,
      brandColor: merchant.brand_color,
      whatsapp: merchant.whatsapp,
      contactEmail: merchant.contact_email,
    },
    games: hubGames,
    player,
  };
  return NextResponse.json(hub);
}
