import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { REFERRAL_BONUS_LIVES } from "@/lib/constants";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer } from "@/lib/game/boxes";
import type { ReferralState } from "@/lib/types";

/** The player's own invite link, and what it has brought in so far. */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  // One count, now that joining *is* the qualification: everybody who used the
  // link paid both sides their lives the moment they arrived. There is no
  // second, smaller number to explain any more.
  const { count: joined } = await db
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("invited_by", player.id);

  const referral: ReferralState = {
    inviteCode: player.invite_code,
    joined: joined ?? 0,
    bonusLivesPending: player.bonus_lives_pending ?? 0,
    bonus: REFERRAL_BONUS_LIVES,
  };
  return NextResponse.json({ referral });
}

/**
 * Claim the code somebody arrived on, which is also when both sides are paid.
 *
 * The browser replays whatever it stashed from a `?ref=` link the first time
 * the player is verified, which means this is called with stale, wrong and
 * already-used codes as a matter of course. `claim_invite` answers
 * `claimed: false` for every one of those — an unknown code, your own code, a
 * player who already has an inviter — and none of them is an error worth
 * showing anyone. An inviter, once attached, is never changed, which is also
 * what stops a replayed code being paid twice.
 *
 * A true answer means lives have already landed on both accounts, so the
 * browser's job afterwards is simply to re-read the pool.
 */
export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = (body.code ?? "").trim();
  if (!code) return NextResponse.json({ claimed: false });

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  const { data } = await db.rpc("claim_invite", {
    p_player_id: player.id,
    p_code: code,
  });
  const result = (data ?? null) as { claimed?: boolean; bonus?: number } | null;

  return NextResponse.json({
    claimed: result?.claimed === true,
    bonus: result?.claimed === true ? (result.bonus ?? REFERRAL_BONUS_LIVES) : 0,
  });
}
