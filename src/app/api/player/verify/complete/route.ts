import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMAIL_REGEX } from "@/lib/constants";
import { verifyCode } from "@/lib/verification";
import { rememberPlayer } from "@/lib/player-session";
import { ensurePlayer, toPlayerState } from "@/lib/game/boxes";

/** Check the code, mint the session cookie, and open the player's life pool. */
export async function POST(req: Request) {
  const { email, code } = (await req.json().catch(() => ({}))) as {
    email?: string;
    code?: string;
  };
  const addr = (email ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(addr)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const ok = await verifyCode(addr, "player_verify", (code ?? "").trim());
  if (!ok) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const player = await ensurePlayer(supabaseAdmin(), addr);

  await rememberPlayer(addr);
  return NextResponse.json({
    result: "verified",
    player: toPlayerState(player, addr),
  });
}
