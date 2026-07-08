import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  sendLoyaltyUnlockedEmail,
  sendMerchantHitEmail,
  sendRewardUnlockedEmail,
} from "@/lib/email";
import { EMAIL_REGEX } from "@/lib/constants";
import { clientIpHash } from "@/lib/ip";
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
  const gridId = String(body?.gridId ?? "");
  const row = Number(body?.row);
  const col = Number(body?.col);

  if (
    !EMAIL_REGEX.test(email) ||
    !gridId ||
    !Number.isInteger(row) ||
    !Number.isInteger(col)
  ) {
    return NextResponse.json(
      { result: "error", error: "invalid_request" },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();

  // Players must verify their email (via a code) before they can tap a tile.
  const { data: cust } = await db
    .from("customers")
    .select("email_verified")
    .eq("email", email)
    .maybeSingle();
  if (!cust || !cust.email_verified) {
    return NextResponse.json(
      { result: "error", error: "email_not_verified" },
      { status: 403 }
    );
  }

  const { data, error } = await db.rpc("play_tile", {
    p_slug: slug,
    p_grid_id: gridId,
    p_row: row,
    p_col: col,
    p_email: email,
    p_ip_hash: clientIpHash(req),
  });
  if (error) {
    console.error("[play_tile] rpc failed:", error);
    return NextResponse.json(
      { result: "error", error: "internal" },
      { status: 500 }
    );
  }

  const result = data as PlayResult;

  // Emails are best-effort; failures are logged inside the helpers and never
  // affect the already-committed game result.
  if (result.result === "hit" || result.result === "miss") {
    const { data: merchant } = await db
      .from("merchants")
      .select("id, owner_id, business_name, discount_percent, points_per_discount")
      .eq("slug", slug.toLowerCase())
      .single();
    const businessName = merchant?.business_name ?? "the merchant";

    if (result.result === "hit") {
      await sendRewardUnlockedEmail({
        to: email,
        businessName,
        slug: slug.toLowerCase(),
        description: result.description,
        code: result.code,
        expiresAt: result.expires_at,
      });

      if (merchant) {
        const { data: owner } = await db.auth.admin.getUserById(
          merchant.owner_id
        );
        if (owner?.user?.email) {
          await sendMerchantHitEmail({
            to: owner.user.email,
            businessName,
            description: result.description,
            customerEmail: email,
          });
        }
      }
    } else if (
      merchant &&
      merchant.points_per_discount > 0 &&
      result.loyalty_points > 0 &&
      result.loyalty_points % merchant.points_per_discount === 0
    ) {
      // This miss just completed a fresh discount cycle — the loyalty code is
      // now redeemable, so let the customer know with their code.
      const { data: cust } = await db
        .from("customers")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (cust) {
        const { data: cms } = await db
          .from("customer_merchant_state")
          .select("loyalty_code")
          .eq("customer_id", cust.id)
          .eq("merchant_id", merchant.id)
          .maybeSingle();
        if (cms?.loyalty_code) {
          await sendLoyaltyUnlockedEmail({
            to: email,
            businessName,
            slug: slug.toLowerCase(),
            discountPercent: merchant.discount_percent,
            code: cms.loyalty_code,
          });
        }
      }
    }
  }

  const status =
    result.result === "cooldown"
      ? 429
      : result.result === "grid_completed"
        ? 409
        : result.result !== "error"
          ? 200
          : result.error === "tile_taken"
            ? 409
            : result.error === "merchant_not_found" || result.error === "no_active_grid"
              ? 404
              : 400;

  return NextResponse.json(result, { status });
}
