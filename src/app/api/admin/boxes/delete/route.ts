import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { createAndSendCode, verifyCode } from "@/lib/verification";

/**
 * Deleting a box, in two steps.
 *
 * A box is meant to be permanent. Players spend weeks against one password,
 * and the record of what they did has to outlive anybody's change of heart —
 * which is why contributors can only delete an *unpaid* box and why closing is
 * the normal remedy. This route is for the times that isn't enough: a password
 * nobody could type, something abusive in a title, a duplicate created by a
 * payment that fired twice.
 *
 * Because it is irreversible and takes other people's history with it, it is
 * confirmed out of band. Asking sends a six-digit code to the administrator's
 * own address; nothing is deleted until that code comes back. That turns a
 * mis-click into an email, and means a hijacked admin session alone is not
 * enough to erase the board.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    boxId?: string;
    code?: string;
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

  // ---- Step one: ask. -----------------------------------------------------
  if (!body.code) {
    const sent = await createAndSendCode(admin.email, "admin_delete_box");
    if (!sent) {
      return NextResponse.json({ error: "too_many_codes" }, { status: 429 });
    }
    return NextResponse.json({
      result: "code_sent",
      to: admin.email,
      box: {
        title: (box as { title: string }).title,
        slug: (box as { slug: string }).slug,
        status: (box as { status: string }).status,
        attemptsCount: Number((box as { attempts_count: number }).attempts_count),
        playersCount: Number((box as { players_count: number }).players_count),
      },
    });
  }

  // ---- Step two: confirm. -------------------------------------------------
  const ok = await verifyCode(admin.email, "admin_delete_box", body.code.trim());
  if (!ok) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

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
