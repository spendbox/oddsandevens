import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";

// Someone arrived through a player's share link and has now played a round.
// That earns the player who shared it one extra life today.
//
// The credit is deliberately tied to *playing*, not to opening the link: a
// page view costs nothing and would be trivial to farm, whereas a round costs
// the arriving player their own time and the business a play from its
// allowance. One life per person invited, ever, capped per day by the game.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; game: string }> }
) {
  const { slug, game: gameSlug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const code = String(body?.code ?? "").trim().toUpperCase();
  // The arriving player is whoever this browser has verified — a posted
  // address would let anyone claim to have played.
  const email = await playerEmail();

  if (!/^[A-Z0-9]{6,12}$/.test(code) || !email) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: merchant } = await db
    .from("merchants")
    .select("id")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: game } = await db
    .from("games")
    .select("id")
    .eq("merchant_id", merchant.id)
    .eq("slug", gameSlug.toLowerCase())
    .maybeSingle();
  if (!game) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }

  // The arriving player must have actually finished a round on this game.
  const { data: customer } = await db
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json({ error: "not_played_yet" }, { status: 400 });
  }

  const { count } = await db
    .from("game_plays")
    .select("id", { count: "exact", head: true })
    .eq("game_id", game.id)
    .eq("customer_id", customer.id)
    .not("finished_at", "is", null);
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: "not_played_yet" }, { status: 400 });
  }

  const { data, error } = await db.rpc("claim_referral_life", {
    p_code: code,
    p_customer_id: customer.id,
  });
  if (error) {
    console.error("[refer] claim_referral_life failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const result = data as { result: string; error?: string };
  return NextResponse.json({
    ok: result.result === "granted",
    result: result.result,
  });
}
