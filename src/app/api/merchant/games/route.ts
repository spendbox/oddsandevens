import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveTier, getAuthedMerchant } from "@/lib/merchant-auth";
import { GAME_TIER_LIMITS, gameDef, slugifyGameTitle } from "@/lib/games/catalog";
import { sanitizeConfig, sanitizeTheme } from "@/lib/games/config";
import { parsePrizes } from "@/lib/games/prizes";
import type { GameSummary } from "@/lib/games/types";

// The merchant's games: list with lifetime stats, and create.

interface PrizeRow {
  id: string;
  game_id: string;
  kind: "prize" | "blank";
  description: string;
  details: string | null;
  icon: string | null;
  expiry_days: number;
  stock: number;
  claimed: number;
  weight: number;
  min_score: number;
  position: number;
}

export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: games, error } = await db
    .from("games")
    .select(
      "id, slug, type, engine, title, description, status, source, config, theme, cooldown_hours, max_wins_per_player, plays_count, wins_count, created_at"
    )
    .eq("merchant_id", merchant.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[merchant games] list failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const ids = (games ?? []).map((g) => g.id);
  if (ids.length === 0) return NextResponse.json({ games: [] });

  const [{ data: prizes }, { data: plays }] = await Promise.all([
    db
      .from("game_prizes")
      .select(
        "id, game_id, kind, description, details, icon, expiry_days, stock, claimed, weight, min_score, position"
      )
      .in("game_id", ids)
      .order("position", { ascending: true }),
    db
      .from("game_plays")
      .select("game_id, customer_id, unlocked_reward_id")
      .in("game_id", ids)
      .not("finished_at", "is", null),
  ]);

  // Redemption rate per game needs the status of every code those plays minted.
  const rewardIds = (plays ?? [])
    .map((p) => p.unlocked_reward_id)
    .filter((id): id is string => id !== null);
  const { data: unlocks } = rewardIds.length
    ? await db
        .from("unlocked_rewards")
        .select("id, status")
        .in("id", rewardIds)
    : { data: [] as { id: string; status: string }[] };
  const redeemed = new Set(
    (unlocks ?? []).filter((u) => u.status === "redeemed").map((u) => u.id)
  );

  const playersByGame = new Map<string, Set<string>>();
  const redeemedByGame = new Map<string, number>();
  for (const p of plays ?? []) {
    if (p.customer_id) {
      const set = playersByGame.get(p.game_id) ?? new Set<string>();
      set.add(p.customer_id);
      playersByGame.set(p.game_id, set);
    }
    if (p.unlocked_reward_id && redeemed.has(p.unlocked_reward_id)) {
      redeemedByGame.set(p.game_id, (redeemedByGame.get(p.game_id) ?? 0) + 1);
    }
  }

  const prizeRows = (prizes ?? []) as PrizeRow[];
  const result: GameSummary[] = (games ?? []).map((g) => ({
    id: g.id,
    slug: g.slug,
    type: g.type,
    engine: g.engine,
    title: g.title,
    description: g.description,
    status: g.status,
    source: g.source === "suggested" ? "suggested" : "manual",
    config: g.config ?? {},
    theme: g.theme ?? {},
    cooldownHours: g.cooldown_hours,
    maxWinsPerPlayer: g.max_wins_per_player,
    playsCount: g.plays_count,
    winsCount: g.wins_count,
    createdAt: g.created_at,
    players: playersByGame.get(g.id)?.size ?? 0,
    redeemedCount: redeemedByGame.get(g.id) ?? 0,
    prizes: prizeRows
      .filter((p) => p.game_id === g.id)
      .map((p) => ({
        id: p.id,
        kind: p.kind,
        description: p.description,
        details: p.details,
        icon: p.icon,
        expiryDays: p.expiry_days,
        stock: p.stock,
        claimed: p.claimed,
        weight: p.weight,
        minScore: p.min_score,
        position: p.position,
      })),
  }));

  return NextResponse.json({ games: result });
}

export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const def = gameDef(String((body as Record<string, unknown>)?.type ?? ""));
  if (!def) {
    return NextResponse.json({ error: "unknown_game_type" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const title = String(b.title ?? "").trim() || def.label;
  if (title.length > 80) {
    return NextResponse.json({ error: "title_too_long" }, { status: 400 });
  }
  const description = String(b.description ?? "").trim().slice(0, 300);

  const config = sanitizeConfig(def, b.config);
  if (!config) {
    return NextResponse.json({ error: "config_too_large" }, { status: 400 });
  }
  const theme = sanitizeTheme(b.theme);

  const prizes = parsePrizes(b.prizes ?? []);
  if (!prizes) {
    return NextResponse.json({ error: "invalid_prizes" }, { status: 400 });
  }

  const tier = effectiveTier(merchant);
  const realPrizes = prizes.filter((p) => p.kind === "prize").length;
  if (realPrizes > GAME_TIER_LIMITS[tier].maxPrizes) {
    return NextResponse.json({ error: "too_many_prizes" }, { status: 400 });
  }

  const cooldownHours = Number(b.cooldownHours ?? def.cooldownHours);
  const maxWins = Number(b.maxWinsPerPlayer ?? 1);

  const db = supabaseAdmin();

  // Slugs are per-merchant, so a second "Spin to Win" just gets a suffix
  // rather than an error the business has to think about.
  const base = slugifyGameTitle(String(b.slug ?? "").trim() || title);
  let slug = base;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const { data: clash } = await db
      .from("games")
      .select("id")
      .eq("merchant_id", merchant.id)
      .eq("slug", slug)
      .maybeSingle();
    if (!clash) break;
    const suffix = `-${attempt + 1}`;
    slug = `${base.slice(0, 40 - suffix.length)}${suffix}`;
  }

  const { data, error } = await db.rpc("create_game", {
    p_merchant_id: merchant.id,
    p_type: def.type,
    p_engine: def.engine,
    p_title: title,
    p_slug: slug,
    p_description: description || null,
    p_config: config,
    p_theme: theme,
    p_prizes: prizes,
    p_cooldown_hours: Number.isFinite(cooldownHours)
      ? Math.round(cooldownHours)
      : def.cooldownHours,
    p_max_wins: Number.isFinite(maxWins) ? Math.round(maxWins) : 1,
    p_max_score: def.maxScore,
  });
  if (error) {
    console.error("[merchant games] create_game failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const result = data as { result: string; error?: string; game_id?: string; slug?: string };
  if (result.result !== "created") {
    return NextResponse.json({ error: result.error ?? "invalid_game" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    gameId: result.game_id,
    slug: result.slug,
    url: `/p/${merchant.slug}/${result.slug}`,
  });
}
