import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  INVITEE_BONUS_LIVES,
  INVITER_BONUS_LIVES,
  REFERRAL_MIN_LIVES,
} from "@/lib/constants";
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

  // Two counts, because they mean different things to the person reading them:
  // how many people used the link, and how many of those have actually paid
  // for anything. Only the second has earned them lives.
  const [{ count: joined }, { count: qualified }] = await Promise.all([
    db
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", player.id),
    db
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", player.id)
      .not("referral_qualified_at", "is", null),
  ]);

  const referral: ReferralState = {
    inviteCode: player.invite_code,
    joined: joined ?? 0,
    qualified: qualified ?? 0,
    bonusLivesPending: player.bonus_lives_pending ?? 0,
    minLives: REFERRAL_MIN_LIVES,
    inviterBonus: INVITER_BONUS_LIVES,
    inviteeBonus: INVITEE_BONUS_LIVES,
  };
  return NextResponse.json({ referral });
}

/**
 * Claim the code somebody arrived on.
 *
 * The browser replays whatever it stashed from a `?ref=` link the first time
 * the player is verified, which means this is called with stale, wrong and
 * already-used codes as a matter of course. `claim_invite` answers false for
 * every one of those — an unknown code, your own code, a player who already
 * has an inviter — and none of them is an error worth showing anyone. An
 * inviter, once attached, is never changed.
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

  return NextResponse.json({ claimed: data === true });
}
