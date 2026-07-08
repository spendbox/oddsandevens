import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import {
  REWARD_EXPIRY_DAYS_MAX,
  REWARD_EXPIRY_DAYS_MIN,
} from "@/lib/constants";
import type { RewardTemplate } from "@/lib/types";

// The merchant's reusable reward catalogue. Businesses create rewards here
// first, then pick from them when building a grid.

export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }
  const { data } = await supabaseAdmin()
    .from("reward_templates")
    .select("id, description, details, default_expiry_days, created_at")
    .eq("merchant_id", merchant.id)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  return NextResponse.json({ rewards: (data as RewardTemplate[]) ?? [] });
}

function parseBody(body: unknown): {
  description: string;
  details: string | null;
  defaultExpiryDays: number;
} | null {
  const b = body as Record<string, unknown> | null;
  const description = String(b?.description ?? "").trim();
  const details = String(b?.details ?? "").trim();
  const defaultExpiryDays = Number(b?.defaultExpiryDays);
  if (description.length < 1 || description.length > 200) return null;
  if (details.length > 300) return null;
  if (
    !Number.isInteger(defaultExpiryDays) ||
    defaultExpiryDays < REWARD_EXPIRY_DAYS_MIN ||
    defaultExpiryDays > REWARD_EXPIRY_DAYS_MAX
  ) {
    return null;
  }
  return { description, details: details || null, defaultExpiryDays };
}

export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }
  const parsed = parseBody(await req.json().catch(() => null));
  if (!parsed) {
    return NextResponse.json({ error: "invalid_reward" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin()
    .from("reward_templates")
    .insert({
      merchant_id: merchant.id,
      description: parsed.description,
      details: parsed.details,
      default_expiry_days: parsed.defaultExpiryDays,
    })
    .select("id, description, details, default_expiry_days, created_at")
    .single();
  if (error) {
    console.error("[reward-templates] insert failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ reward: data as RewardTemplate });
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
  const id = String(body?.id ?? "");
  const parsed = parseBody(body);
  if (!id || !parsed) {
    return NextResponse.json({ error: "invalid_reward" }, { status: 400 });
  }
  const { error } = await supabaseAdmin()
    .from("reward_templates")
    .update({
      description: parsed.description,
      details: parsed.details,
      default_expiry_days: parsed.defaultExpiryDays,
    })
    .eq("id", id)
    .eq("merchant_id", merchant.id);
  if (error) {
    console.error("[reward-templates] update failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { error } = await supabaseAdmin()
    .from("reward_templates")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchant.id);
  if (error) {
    console.error("[reward-templates] delete failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
