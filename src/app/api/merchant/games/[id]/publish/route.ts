import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";

// Take a draft live. Drafts are free to hold, so this is where the per-tier
// live-game cap is actually enforced (inside publish_game, under a row lock).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin().rpc("publish_game", {
    p_merchant_id: merchant.id,
    p_game_id: id,
  });
  if (error) {
    console.error("[games publish] rpc failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const result = data as { result: string; error?: string; slug?: string };
  if (result.result !== "published") {
    const status = result.error === "game_not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error ?? "publish_failed" }, { status });
  }

  return NextResponse.json({
    ok: true,
    slug: result.slug,
    url: `/p/${merchant.slug}/${result.slug}`,
  });
}
