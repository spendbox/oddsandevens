import { NextResponse } from "next/server";
import { forgetPlayer } from "@/lib/player-session";

/**
 * Sign out.
 *
 * Clearing the cookie is the whole of it: the session *is* the cookie, and
 * nothing about a player is stored client-side that the server would have to
 * trust. Their lives, boxes and rewards are untouched — signing back in picks
 * up exactly where they left off.
 */
export async function POST() {
  await forgetPlayer();
  return NextResponse.json({ result: "signed_out" });
}
