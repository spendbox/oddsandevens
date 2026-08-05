import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { applySeeding, readSeededHunters, type SeedRequest } from "@/lib/game/seeding";
import { PUBLIC_BOX_COLUMNS, type BoxRow } from "@/lib/game/boxes";

/**
 * Editing a box's authored history.
 *
 * The same three writes the create route can make, available afterwards —
 * because the numbers that make a board look alive are exactly the numbers
 * somebody wants to nudge a week later, and re-creating a box to change its
 * hunter count would take its slug and its history with it.
 *
 * Only our own boxes. That is enforced in SQL rather than here, in all three
 * functions, because it is the rule that actually matters: a contributor's box
 * has real money behind it and a real player expecting to be able to win it.
 */
export async function GET(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const boxId = new URL(req.url).searchParams.get("boxId") ?? "";
  if (!boxId) return NextResponse.json({ error: "invalid_box" }, { status: 400 });

  const db = supabaseAdmin();
  const [{ data }, hunters] = await Promise.all([
    db.from("boxes").select(`${PUBLIC_BOX_COLUMNS}, seeded_by`).eq("id", boxId).maybeSingle(),
    readSeededHunters(db, boxId),
  ]);

  const box = data as (BoxRow & { seeded_by: string | null }) | null;
  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });

  return NextResponse.json({
    box: {
      id: box.id,
      title: box.title,
      kind: box.kind,
      status: box.status,
      attemptsCount: Number(box.attempts_count),
      playersCount: Number(box.players_count),
      crackedBy: box.unlocked_alias,
      crackedAt: box.unlocked_at,
      seededAt: box.seeded_at,
      seededBy: box.seeded_by,
      /** Only ours can be seeded, and the screen should say so rather than fail. */
      seedable: box.kind === "general",
    },
    hunters,
  });
}

export async function PUT(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as SeedRequest & { boxId?: string };
  if (!body.boxId) return NextResponse.json({ error: "invalid_box" }, { status: 400 });

  const db = supabaseAdmin();
  const { changed } = await applySeeding(db, body.boxId, body, admin.email);

  return NextResponse.json({
    result: changed.length > 0 ? "seeded" : "unchanged",
    changed,
    hunters: await readSeededHunters(db, body.boxId),
  });
}
