import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMAIL_REGEX } from "@/lib/constants";
import { verifyCode } from "@/lib/verification";
import { rememberPlayer } from "@/lib/player-session";
import { ensurePlayer, toPlayerState } from "@/lib/game/boxes";
import { newAccountAllowed, stampSignupIp } from "@/lib/game/limits";
import { callerKey, tooMany } from "@/lib/rate-limit";

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

  // Belt to the database's braces: the per-code attempt ceiling is the real
  // limit, this only stops one machine spending it faster than a person could.
  if (tooMany(callerKey(req, "player-verify"), 20, 10 * 60_000)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const db = supabaseAdmin();

  // Asked before the code is spent. Refusing afterwards would consume
  // somebody's code to tell them no, and the answer doesn't depend on it.
  if (!(await newAccountAllowed(db, req, addr))) {
    return NextResponse.json({ error: "too_many_accounts" }, { status: 429 });
  }

  const ok = await verifyCode(addr, "player_verify", (code ?? "").trim());
  if (!ok) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const player = await ensurePlayer(db, addr);
  if (player) await stampSignupIp(db, req, player.id);

  await rememberPlayer(addr);
  return NextResponse.json({
    result: "verified",
    player: toPlayerState(player, addr),
  });
}
