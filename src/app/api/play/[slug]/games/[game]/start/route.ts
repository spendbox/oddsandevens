import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { clientIpHash } from "@/lib/ip";
import type { StartPlayResult } from "@/lib/games/types";

// Opens a play: checks the per-game replay cooldown and the merchant's play
// allowance, then hands back a single-use token. Nothing is charged here — an
// abandoned game costs the business nothing.
//
// Who is playing comes from the signed player cookie, never from the request
// body: the address a prize is emailed to has to be one this browser proved it
// owns, and it means a returning player never sees a verification code again.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; game: string }> }
) {
  const { slug, game } = await params;
  const email = await playerEmail();

  if (!email) {
    return NextResponse.json(
      { result: "error", error: "email_not_verified" },
      { status: 403 }
    );
  }

  const db = supabaseAdmin();

  const { data, error } = await db.rpc("start_game_play", {
    p_slug: slug,
    p_game_slug: game,
    p_email: email,
    p_ip_hash: clientIpHash(req),
  });
  if (error) {
    console.error("[start_game_play] rpc failed:", error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const raw = data as Record<string, unknown>;
  const result = String(raw.result);

  if (result === "started") {
    const payload: StartPlayResult = {
      result: "started",
      token: String(raw.token),
      canWin: raw.can_win !== false,
      livesLeft: Number(raw.lives_left ?? 0),
    };
    return NextResponse.json(payload);
  }
  if (result === "cooldown") {
    return NextResponse.json(
      { result: "cooldown", nextPlayAt: raw.next_play_at },
      { status: 429 }
    );
  }
  if (result === "no_lives") {
    return NextResponse.json(
      { result: "no_lives", nextLivesAt: raw.next_lives_at },
      { status: 429 }
    );
  }
  if (result === "no_plays") {
    return NextResponse.json({ result: "no_plays" }, { status: 429 });
  }

  const errorCode = String(raw.error ?? "invalid_request");
  const status =
    errorCode === "merchant_not_found" || errorCode === "game_not_found"
      ? 404
      : errorCode === "game_paused"
        ? 403
        : 400;
  return NextResponse.json({ result: "error", error: errorCode }, { status });
}
