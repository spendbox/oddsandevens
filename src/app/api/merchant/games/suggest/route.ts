import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { canSuggestGames, type BusinessProfile } from "@/lib/business/profile";
import { GAMES, slugifyGameTitle } from "@/lib/games/catalog";
import { buildChanceSlots, buildScoreSlots } from "@/lib/games/slots";
import { suggestGames } from "@/lib/games/suggest";

// Writes ready-made games for a business out of what they told us about
// themselves. They land as drafts: fully configured, previewable and editable,
// invisible to players until published.
//
// Idempotent by game type — running it again after the business answers more
// questions tops up what's missing instead of duplicating what's there.

const MAX_SUGGESTIONS = 6;

export async function POST() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("merchants")
    .select("profile")
    .eq("id", merchant.id)
    .single();
  const profile = (row?.profile ?? {}) as BusinessProfile;

  if (!canSuggestGames(profile)) {
    return NextResponse.json({ error: "profile_incomplete" }, { status: 400 });
  }

  const [{ data: rewards }, { data: existing }] = await Promise.all([
    db
      .from("reward_templates")
      .select("description, details, icon, default_expiry_days")
      .eq("merchant_id", merchant.id)
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    db
      .from("games")
      .select("type, slug")
      .eq("merchant_id", merchant.id)
      .neq("status", "archived"),
  ]);

  // Don't offer a business a second copy of a game they already have.
  const haveTypes = new Set((existing ?? []).map((g) => g.type));
  const haveSlugs = new Set((existing ?? []).map((g) => g.slug));

  const blueprints = suggestGames({
    businessName: merchant.business_name,
    profile,
    rewards: rewards ?? [],
  })
    .filter((b) => !haveTypes.has(b.type))
    .slice(0, MAX_SUGGESTIONS);

  const created: { id: string; slug: string; type: string }[] = [];

  for (const blueprint of blueprints) {
    const def = GAMES[blueprint.type];
    const named = blueprint.prizes.filter((p) => p.description.trim().length > 0);
    const slots =
      def.engine === "chance"
        ? buildChanceSlots(named, blueprint.winPercent)
        : buildScoreSlots(named);
    if (def.engine === "chance" && slots.length === 0) continue;

    // Slugs are per-merchant; suffix rather than fail on a clash.
    const base = slugifyGameTitle(blueprint.title);
    let slug = base;
    for (let attempt = 1; haveSlugs.has(slug) && attempt <= 20; attempt++) {
      const suffix = `-${attempt + 1}`;
      slug = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    }

    const { data, error } = await db.rpc("create_game", {
      p_merchant_id: merchant.id,
      p_type: blueprint.type,
      p_engine: def.engine,
      p_title: blueprint.title,
      p_slug: slug,
      p_description: blueprint.description,
      p_config: blueprint.config,
      p_theme: {},
      p_prizes: slots,
      p_cooldown_hours: blueprint.cooldownHours,
      p_max_wins: blueprint.maxWins,
      p_max_score: def.maxScore,
      p_status: "draft",
      p_source: "suggested",
    });
    if (error) {
      console.error("[games suggest] create_game failed:", error);
      continue;
    }
    const result = data as { result: string; game_id?: string; error?: string };
    if (result.result !== "created" || !result.game_id) continue;

    haveSlugs.add(slug);
    haveTypes.add(blueprint.type);
    created.push({ id: result.game_id, slug, type: blueprint.type });
  }

  return NextResponse.json({ ok: true, created: created.length, games: created });
}
