import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { buildPlayView, findBox } from "@/lib/game/view";

/** One box, plus whatever this player has going on with it. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const box = await findBox(db, slug);
  if (!box || box.status === "draft" || box.status === "funding") {
    return NextResponse.json({ error: "box_not_found" }, { status: 404 });
  }

  return NextResponse.json(await buildPlayView(db, box, await playerEmail()));
}
