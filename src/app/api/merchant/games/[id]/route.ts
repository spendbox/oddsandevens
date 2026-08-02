import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveTier, getAuthedMerchant } from "@/lib/merchant-auth";
import { GAME_TIER_LIMITS, gameDef } from "@/lib/games/catalog";
import { sanitizeConfig, sanitizeTheme } from "@/lib/games/config";
import { parsePrizes } from "@/lib/games/prizes";

// Edit or delete one game. Prize edits replace the whole slot list, but the
// claimed counter of a slot the merchant kept (matched by id) is carried over
// so editing a live game can never re-issue stock that is already gone.

export async function PATCH(
  req: Request,
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
    .select("id, type, engine, merchant_id")
    .eq("id", id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!game) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  const def = gameDef(game.type);
  if (!def) {
    return NextResponse.json({ error: "unknown_game_type" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (title.length < 1 || title.length > 80) {
      return NextResponse.json({ error: "invalid_title" }, { status: 400 });
    }
    patch.title = title;
  }
  if (typeof body.description === "string") {
    patch.description = body.description.trim().slice(0, 300) || null;
  }
  // Going live is the one transition with a cap on it, so it goes through
  // publish_game rather than a plain update — that way resuming a paused game
  // is checked exactly like publishing a draft.
  let publishing = false;
  if (typeof body.status === "string") {
    if (!["draft", "active", "paused", "archived"].includes(body.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    if (body.status === "active") {
      publishing = true;
    } else {
      patch.status = body.status;
    }
  }
  if (body.config !== undefined) {
    const config = sanitizeConfig(def, body.config);
    if (!config) {
      return NextResponse.json({ error: "config_too_large" }, { status: 400 });
    }
    patch.config = config;
  }
  if (body.theme !== undefined) {
    patch.theme = sanitizeTheme(body.theme);
  }
  if (body.cooldownHours !== undefined) {
    const hours = Number(body.cooldownHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 720) {
      return NextResponse.json({ error: "invalid_cooldown" }, { status: 400 });
    }
    patch.cooldown_hours = Math.round(hours);
  }
  if (body.maxWinsPerPlayer !== undefined) {
    const wins = Number(body.maxWinsPerPlayer);
    if (!Number.isFinite(wins) || wins < 1 || wins > 100) {
      return NextResponse.json({ error: "invalid_max_wins" }, { status: 400 });
    }
    patch.max_wins_per_player = Math.round(wins);
  }
  if (body.seasonDays !== undefined) {
    const days = Number(body.seasonDays);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      return NextResponse.json({ error: "invalid_season" }, { status: 400 });
    }
    // The week already running keeps the length it started with; this takes
    // effect when the next one opens.
    patch.season_days = Math.round(days);
  }
  // Lives are one pool per business, so this setting belongs to the merchant.
  // The game's own column is kept in step only so old reads stay sane.
  let dailyLives: number | null = null;
  if (body.dailyLives !== undefined) {
    const lives = Number(body.dailyLives);
    if (!Number.isFinite(lives) || lives < 1 || lives > 20) {
      return NextResponse.json({ error: "invalid_lives" }, { status: 400 });
    }
    dailyLives = Math.round(lives);
    patch.daily_lives = dailyLives;
  }

  const { error: updateError } = await db
    .from("games")
    .update(patch)
    .eq("id", game.id)
    .eq("merchant_id", merchant.id);
  if (updateError) {
    console.error("[merchant games] update failed:", updateError);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  if (dailyLives !== null) {
    await db
      .from("merchants")
      .update({ daily_lives: dailyLives })
      .eq("id", merchant.id);
  }

  if (publishing) {
    const { data, error } = await db.rpc("publish_game", {
      p_merchant_id: merchant.id,
      p_game_id: game.id,
    });
    if (error) {
      console.error("[merchant games] publish_game failed:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    const result = data as { result: string; error?: string };
    if (result.result !== "published") {
      return NextResponse.json(
        { error: result.error ?? "publish_failed" },
        { status: 400 }
      );
    }
  }

  if (body.prizes !== undefined) {
    const prizes = parsePrizes(body.prizes);
    if (!prizes) {
      return NextResponse.json({ error: "invalid_prizes" }, { status: 400 });
    }
    const tier = effectiveTier(merchant);
    const realPrizes = prizes.filter((p) => p.kind === "prize").length;
    if (realPrizes > GAME_TIER_LIMITS[tier].maxPrizes) {
      return NextResponse.json({ error: "too_many_prizes" }, { status: 400 });
    }
    if (game.engine === "chance" && prizes.length < 1) {
      return NextResponse.json({ error: "no_prizes" }, { status: 400 });
    }

    const { data: existing } = await db
      .from("game_prizes")
      .select("id, claimed")
      .eq("game_id", game.id);
    const claimedById = new Map(
      (existing ?? []).map((p) => [p.id as string, p.claimed as number])
    );

    const incomingIds = (body.prizes as { id?: string }[])
      .map((p) => p?.id)
      .filter((v): v is string => typeof v === "string");

    // Slots the merchant removed: drop them only if nothing was ever claimed,
    // otherwise close them out (stock = claimed) so issued codes stay valid.
    for (const [prizeId, claimed] of claimedById) {
      if (incomingIds.includes(prizeId)) continue;
      if (claimed > 0) {
        await db
          .from("game_prizes")
          .update({ stock: claimed, weight: 0 })
          .eq("id", prizeId);
      } else {
        await db.from("game_prizes").delete().eq("id", prizeId);
      }
    }

    for (let i = 0; i < prizes.length; i++) {
      const draft = prizes[i];
      const draftId = (body.prizes as { id?: string }[])[i]?.id;
      const claimed = draftId ? (claimedById.get(draftId) ?? 0) : 0;
      const row = {
        game_id: game.id,
        kind: draft.kind,
        description: draft.description,
        details: draft.details ?? null,
        icon: draft.icon ?? null,
        expiry_days: draft.expiry_days ?? 30,
        // Never let an edit take stock below what has already gone out.
        stock: Math.max(draft.stock ?? 1, claimed),
        weight: draft.weight ?? 1,
        min_score: draft.min_score ?? 0,
        award_rank: draft.award_rank ?? null,
        position: i,
      };
      if (draftId && claimedById.has(draftId)) {
        await db.from("game_prizes").update(row).eq("id", draftId);
      } else {
        await db.from("game_prizes").insert(row);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
  const { data: plays } = await db
    .from("game_plays")
    .select("id")
    .eq("game_id", id)
    .limit(1);

  // A game people have actually played is archived, not deleted: the codes it
  // minted have to keep resolving at the counter.
  if ((plays ?? []).length > 0) {
    const { error } = await db
      .from("games")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("merchant_id", merchant.id);
    if (error) {
      console.error("[merchant games] archive failed:", error);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, archived: true });
  }

  const { error } = await db
    .from("games")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchant.id);
  if (error) {
    console.error("[merchant games] delete failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, archived: false });
}
