import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendMerchantHitEmail, sendRewardUnlockedEmail } from "@/lib/email";
import { EMAIL_REGEX } from "@/lib/constants";
import type { PlayResult } from "@/lib/types";

// The click endpoint. All game rules (cooldown, single-consumption tile lock,
// reward claim cap) are enforced atomically inside the play_tile Postgres
// function — this route just validates input, relays the result, and sends
// notification emails after the transaction has committed.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const row = Number(body?.row);
  const col = Number(body?.col);

  if (!EMAIL_REGEX.test(email) || !Number.isInteger(row) || !Number.isInteger(col)) {
    return NextResponse.json(
      { result: "error", error: "invalid_request" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("play_tile", {
    p_slug: slug,
    p_row: row,
    p_col: col,
    p_email: email,
  });
  if (error) {
    console.error("[play_tile] rpc failed:", error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const result = data as PlayResult;

  if (result.result === "hit") {
    // Emails are best-effort; failures are logged inside the helpers and never
    // affect the already-committed game result.
    const { data: merchant } = await db
      .from("merchants")
      .select("owner_id, business_name")
      .eq("slug", slug.toLowerCase())
      .single();
    const businessName = merchant?.business_name ?? "the merchant";

    await sendRewardUnlockedEmail({
      to: email,
      businessName,
      slug: slug.toLowerCase(),
      description: result.description,
      code: result.code,
      expiresAt: result.expires_at,
    });

    if (merchant) {
      const { data: owner } = await db.auth.admin.getUserById(merchant.owner_id);
      if (owner?.user?.email) {
        await sendMerchantHitEmail({
          to: owner.user.email,
          businessName,
          description: result.description,
          customerEmail: email,
        });
      }
    }
  }

  const status =
    result.result === "cooldown"
      ? 429
      : result.result !== "error"
        ? 200
        : result.error === "tile_taken"
          ? 409
          : result.error === "merchant_not_found" || result.error === "no_active_grid"
            ? 404
            : 400;

  return NextResponse.json(result, { status });
}
