import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/mask";
import { EMAIL_REGEX } from "@/lib/constants";
import { gameDef } from "@/lib/games/catalog";
import type {
  LeaderboardEntry,
  PublicGame,
  PublicGameHost,
} from "@/lib/games/types";

const LEADERBOARD_LIMIT = 10;

// One game as the player is allowed to see it: the authored config, the prize
// labels, the high-score table — and never a draw weight or a live stock count
// for anything still winnable.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; game: string }> }
) {
  const { slug, game: gameSlug } = await params;
  const db = supabaseAdmin();

  const { data: merchant } = await db
    .from("merchants")
    .select(
      "id, business_name, slug, logo_url, tagline, brand_color, whatsapp, contact_email"
    )
    .eq("slug", slug.toLowerCase())
    .single();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: game } = await db
    .from("games")
    .select(
      "id, slug, type, engine, title, description, status, config, theme, cooldown_hours, max_wins_per_player, plays_count, wins_count"
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

  const def = gameDef(game.type);
  const { data: prizes } = await db
    .from("game_prizes")
    .select("position, kind, description, details, icon, min_score, stock, claimed")
    .eq("game_id", game.id)
    .order("position", { ascending: true });

  // The leaderboard only exists for games whose score means something.
  let leaderboard: LeaderboardEntry[] = [];
  if (def?.hasLeaderboard) {
    const { data: plays } = await db
      .from("game_plays")
      .select("customer_id, score, finished_at")
      .eq("game_id", game.id)
      .not("finished_at", "is", null)
      .not("customer_id", "is", null)
      .order("score", { ascending: false })
      .limit(200);

    // One row per player: their personal best.
    const best = new Map<string, { score: number; at: string }>();
    for (const p of plays ?? []) {
      const current = best.get(p.customer_id as string);
      if (!current || p.score > current.score) {
        best.set(p.customer_id as string, {
          score: p.score,
          at: p.finished_at as string,
        });
      }
    }
    const top = [...best.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, LEADERBOARD_LIMIT);
    const { data: customers } = top.length
      ? await db
          .from("customers")
          .select("id, email")
          .in(
            "id",
            top.map(([id]) => id)
          )
      : { data: [] as { id: string; email: string }[] };
    const emailById = new Map((customers ?? []).map((c) => [c.id, c.email]));
    leaderboard = top.map(([id, entry], index) => ({
      maskedEmail: maskEmail(emailById.get(id) ?? "player@unknown.com"),
      score: entry.score,
      at: entry.at,
      rank: index + 1,
    }));
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
      // "Sold out" is safe to publish: it can only ever make the wheel honest.
      soldOut: p.kind === "prize" && p.claimed >= p.stock,
    })),
    playsCount: game.plays_count,
    winsCount: game.wins_count,
    hasLeaderboard: def?.hasLeaderboard ?? false,
    leaderboard,
  };

  // A returning player gets their cooldown and personal best alongside.
  const email = (new URL(req.url).searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();
  let player: {
    nextPlayAt: string | null;
    bestScore: number;
    wins: number;
    canWin: boolean;
  } | null = null;
  if (EMAIL_REGEX.test(email)) {
    const { data: customer } = await db
      .from("customers")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (customer) {
      const { data: mine } = await db
        .from("game_plays")
        .select("score, won, finished_at")
        .eq("game_id", game.id)
        .eq("customer_id", customer.id)
        .not("finished_at", "is", null);
      const rows = mine ?? [];
      const wins = rows.filter((r) => r.won).length;
      const lastAt = rows.reduce<number>(
        (max, r) => Math.max(max, new Date(r.finished_at as string).getTime()),
        0
      );
      const nextAt =
        game.cooldown_hours > 0 && lastAt > 0
          ? lastAt + game.cooldown_hours * 3600_000
          : 0;
      player = {
        nextPlayAt:
          nextAt > Date.now() ? new Date(nextAt).toISOString() : null,
        bestScore: rows.reduce((max, r) => Math.max(max, r.score), 0),
        wins,
        canWin: wins < game.max_wins_per_player,
      };
    }
  }

  return NextResponse.json({ host, game: publicGame, player });
}
