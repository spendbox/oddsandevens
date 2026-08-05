import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

/**
 * Deleting a box, in two steps — but not two *emails*.
 *
 * A box is meant to be permanent. Players spend weeks against one password,
 * and the record of what they did has to outlive anybody's change of heart —
 * which is why contributors can only delete an *unpaid* box and why closing is
 * the normal remedy. This route is for the times that isn't enough: a password
 * nobody could type, something abusive in a title, a duplicate created by a
 * payment that fired twice.
 *
 * It used to require a six-digit code emailed to the administrator. The step
 * that actually prevents a mis-click is the one that stays: asking first
 * returns what the deletion would destroy — how many people played it, how
 * many attempts they made — and the dialog makes you read that and type the
 * box's name before the second call is allowed. A code in an inbox proved
 * possession of the inbox; it did not make anybody read the number of hunters
 * they were about to erase.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    boxId?: string;
    /** Set on the second call, once the dialog has been read and typed into. */
    confirm?: boolean;
    reason?: string;
  };
  const boxId = (body.boxId ?? "").trim();
  if (!boxId) return NextResponse.json({ error: "no_box" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: box } = await db
    .from("boxes")
    .select("id, title, slug, status, attempts_count, players_count")
    .eq("id", boxId)
    .maybeSingle();
  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });

  // ---- Step one: ask what it would cost. ----------------------------------
  if (!body.confirm) {
    return NextResponse.json({
      result: "confirm",
      box: {
        title: (box as { title: string }).title,
        slug: (box as { slug: string }).slug,
        status: (box as { status: string }).status,
        attemptsCount: Number((box as { attempts_count: number }).attempts_count),
        playersCount: Number((box as { players_count: number }).players_count),
      },
    });
  }

  // ---- Step two: do it. ---------------------------------------------------
  const { data, error } = await db.rpc("admin_delete_box", {
    p_box_id: boxId,
    p_actor: admin.email,
    p_reason: (body.reason ?? "").trim() || null,
  });
  if (error) {
    console.error("[admin] delete failed:", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ result: "deleted", deleted: data });
}
