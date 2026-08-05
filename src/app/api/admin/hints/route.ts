import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { DEFAULT_HINTS, loadHints, sanitiseHints } from "@/lib/game/hints";

/**
 * The hints, as an admin sees and sets them.
 *
 * The built-in list comes back beside the live one so "what happens if I empty
 * this" has an answer on screen: it goes back to the default, and the default
 * is right there to be read — or copied back in and edited a line at a time.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    hints: await loadHints(supabaseAdmin()),
    defaults: DEFAULT_HINTS,
  });
}

export async function PUT(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { hints?: unknown };
  const hints = sanitiseHints(body.hints);

  const { error } = await supabaseAdmin().rpc("set_hint_settings", {
    p_value: { hints },
    p_by: admin.email,
  });
  if (error) {
    console.error("[hints] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // What comes back is what was stored, which may be shorter than what was
  // sent — the editor shows the result rather than the request.
  return NextResponse.json({ hints: hints.length > 0 ? hints : DEFAULT_HINTS });
}
