import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { buildPlayView, findBox } from "@/lib/game/view";

/**
 * Open an attempt, which costs a life.
 *
 * All the deciding happens inside `start_run` so that two taps on a slow
 * connection can't spend two lives: the second one finds the run the first
 * opened and resumes it.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const db = supabaseAdmin();
  const box = await findBox(db, slug);
  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });

  const { data, error } = await db.rpc("start_run", {
    p_email: email,
    p_box_id: box.id,
  });
  if (error) {
    console.error("[run] start_run failed:", error);
    return NextResponse.json({ error: "start_failed" }, { status: 500 });
  }

  const verdict = data as { result: string; error?: string; next_life_at?: string };
  if (verdict.result === "error") {
    return NextResponse.json(
      { error: verdict.error, nextLifeAt: verdict.next_life_at ?? null },
      { status: verdict.error === "no_lives" ? 402 : 409 }
    );
  }

  return NextResponse.json(await buildPlayView(db, box, email));
}
