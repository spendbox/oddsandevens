import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import {
  completionItems,
  completionPercent,
  sanitizeProfile,
  type BusinessProfile,
} from "@/lib/business/profile";

// The business knowledge base: what we know about the business, and how
// complete that picture is. Saved in pieces — every field is optional, and a
// PATCH merges rather than replaces.

async function readState(merchantId: string) {
  const db = supabaseAdmin();
  const [{ data: merchant }, { count: rewardCount }, { count: gameCount }] =
    await Promise.all([
      db
        .from("merchants")
        .select(
          "profile, business_name, logo_url, tagline, brand_color, whatsapp, contact_email"
        )
        .eq("id", merchantId)
        .single(),
      db
        .from("reward_templates")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId)
        .eq("archived", false),
      db
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId)
        .neq("status", "archived"),
    ]);

  const profile = (merchant?.profile ?? {}) as BusinessProfile;
  const items = completionItems(profile, merchant ?? {}, {
    hasReward: (rewardCount ?? 0) > 0,
    hasGame: (gameCount ?? 0) > 0,
  });

  return {
    profile,
    items,
    percent: completionPercent(items),
  };
}

export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }
  return NextResponse.json(await readState(merchant.id));
}

export async function PATCH(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: current } = await db
    .from("merchants")
    .select("profile")
    .eq("id", merchant.id)
    .single();

  // Merge: the form saves a section at a time, and answering one question
  // must never wipe another.
  const merged = sanitizeProfile({
    ...((current?.profile ?? {}) as Record<string, unknown>),
    ...(body as Record<string, unknown>),
  });

  // Giveaways are rewards, not sentences: only things that exist in the
  // catalogue survive, so a prize a game hands out is always redeemable.
  const { data: catalogue } = await db
    .from("reward_templates")
    .select("description")
    .eq("merchant_id", merchant.id)
    .eq("archived", false);
  const known = new Set((catalogue ?? []).map((r) => r.description));
  merged.offers = (merged.offers ?? []).filter((offer) => known.has(offer));

  const { error } = await db
    .from("merchants")
    .update({ profile: merged, profile_updated_at: new Date().toISOString() })
    .eq("id", merchant.id);
  if (error) {
    console.error("[merchant knowledge] update failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json(await readState(merchant.id));
}
