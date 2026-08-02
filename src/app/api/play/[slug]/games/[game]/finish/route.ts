import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendLoyaltyUnlockedEmail,
  sendMerchantHitEmail,
  sendRewardUnlockedEmail,
} from "@/lib/email";
import { notifySeasonWinners } from "@/lib/games/season-mail";
import type { GameOutcome } from "@/lib/games/types";

// Grades a play.
//
// On a leaderboard game the score simply goes on this week's board and a life
// is spent — the prizes belong to the ranks at the end of the week, and are
// handed out by close_due_game_season. On an instant-win game the old rules
// still apply.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const token = String(body?.token ?? "");
  const score = Number(body?.score ?? 0);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token) || !Number.isFinite(score)) {
    return NextResponse.json(
      { result: "error", error: "invalid_request" },
      { status: 400 }
    );
  }

  // The meta blob is the player's own record of the round (quiz answers, the
  // look they built). Capped so it stays a note.
  let meta: unknown = {};
  if (body?.meta && typeof body.meta === "object") {
    const serialized = JSON.stringify(body.meta);
    if (serialized.length <= 8192) meta = body.meta;
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("finish_game_play", {
    p_token: token,
    p_score: Math.round(Math.min(Math.max(score, 0), 100_000_000)),
    p_meta: meta,
  });
  if (error) {
    console.error("[finish_game_play] rpc failed:", error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const raw = data as Record<string, unknown>;
  const result = String(raw.result);

  if (result === "error") {
    return NextResponse.json(
      { result: "error", error: String(raw.error ?? "invalid_request") },
      { status: 400 }
    );
  }
  if (result === "no_plays") {
    return NextResponse.json({ result: "no_plays" }, { status: 429 });
  }

  const prize = (raw.prize as GameOutcome["prize"]) ?? null;
  const outcome: GameOutcome = {
    result:
      result === "win" ? "win" : result === "scored" ? "scored" : "lose",
    segmentIndex:
      typeof raw.segment_index === "number" ? raw.segment_index : null,
    prize,
    code: (raw.code as string | null) ?? null,
    expiresAt: (raw.expires_at as string | null) ?? null,
    score: Number(raw.score ?? 0),
    bestScore: Number(raw.best_score ?? 0),
    rank: raw.rank == null ? null : Number(raw.rank),
    loyaltyPoints: Number(raw.loyalty_points ?? 0),
    pointsExpireAt: (raw.points_expire_at as string | null) ?? null,
    loyaltyCode: (raw.loyalty_code as string | null) ?? null,
    canWinAgain: raw.can_win_again !== false,
    nextPlayAt: (raw.next_play_at as string | null) ?? null,
    livesLeft: Number(raw.lives_left ?? 0),
    seasonEndsAt: (raw.season_ends_at as string | null) ?? null,
  };

  const { data: merchant } = await db
    .from("merchants")
    .select(
      "id, owner_id, business_name, slug, discount_percent, points_per_discount"
    )
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  // A leaderboard round is over the moment it's on the board. Prize emails for
  // this game go out when the week closes, not now.
  if (outcome.result === "scored") {
    if (merchant) {
      // Best-effort: post any prize emails a just-closed week left pending.
      await notifySeasonWinners(db, merchant.id);
    }
    return NextResponse.json(outcome);
  }

  // ---- Instant-win games: emails as before -------------------------------
  const { data: play } = await db
    .from("game_plays")
    .select("customer_id")
    .eq("token", token)
    .maybeSingle();
  const { data: customer } = play?.customer_id
    ? await db
        .from("customers")
        .select("email")
        .eq("id", play.customer_id)
        .maybeSingle()
    : { data: null };
  const playerEmail = customer?.email ?? null;

  if (merchant && playerEmail) {
    if (outcome.result === "win" && outcome.prize && outcome.code && outcome.expiresAt) {
      await sendRewardUnlockedEmail({
        to: playerEmail,
        businessName: merchant.business_name,
        slug: merchant.slug,
        description: outcome.prize.description,
        code: outcome.code,
        expiresAt: outcome.expiresAt,
      });
      const { data: owner } = await db.auth.admin.getUserById(merchant.owner_id);
      if (owner?.user?.email) {
        await sendMerchantHitEmail({
          to: owner.user.email,
          businessName: merchant.business_name,
          description: outcome.prize.description,
          customerEmail: playerEmail,
        });
      }
    } else if (
      merchant.points_per_discount > 0 &&
      outcome.loyaltyPoints > 0 &&
      outcome.loyaltyPoints % merchant.points_per_discount === 0 &&
      outcome.loyaltyCode
    ) {
      await sendLoyaltyUnlockedEmail({
        to: playerEmail,
        businessName: merchant.business_name,
        slug: merchant.slug,
        discountPercent: merchant.discount_percent,
        code: outcome.loyaltyCode,
      });
    }
  }

  return NextResponse.json(outcome);
}
