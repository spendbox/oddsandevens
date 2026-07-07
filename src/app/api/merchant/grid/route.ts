import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import { TIER_LIMITS } from "@/lib/constants";
import type { CreateGridResult } from "@/lib/types";

interface RewardInput {
  description: string;
  expiryHours: number;
  maxRedemptions: number;
}

// Create (or reset) the merchant's grid. Rewards are placed on random tiles
// inside the create_grid Postgres function — positions are never sent to or
// chosen by the client. Tier caps are validated here AND in the function.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const rows = Number(body?.rows);
  const cols = Number(body?.cols);
  const rewardsInput: unknown = body?.rewards;

  const limits = TIER_LIMITS[merchant.subscription_tier];
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < limits.minGrid ||
    rows > limits.maxGrid ||
    cols < limits.minGrid ||
    cols > limits.maxGrid
  ) {
    return NextResponse.json({ error: "grid_size_not_allowed" }, { status: 400 });
  }

  if (!Array.isArray(rewardsInput) || rewardsInput.length < 1) {
    return NextResponse.json({ error: "no_rewards" }, { status: 400 });
  }
  if (rewardsInput.length > limits.maxRewards) {
    return NextResponse.json({ error: "too_many_rewards" }, { status: 400 });
  }

  const rewards: RewardInput[] = [];
  for (const r of rewardsInput) {
    const description = String(r?.description ?? "").trim();
    const expiryHours = Number(r?.expiryHours ?? 48);
    const maxRedemptions = Number(r?.maxRedemptions ?? 1);
    if (
      description.length < 1 ||
      description.length > 200 ||
      !Number.isInteger(expiryHours) ||
      expiryHours < 1 ||
      expiryHours > 720 ||
      !Number.isInteger(maxRedemptions) ||
      maxRedemptions < 1
    ) {
      return NextResponse.json({ error: "invalid_reward" }, { status: 400 });
    }
    rewards.push({ description, expiryHours, maxRedemptions });
  }

  const totalRewardTiles = rewards.reduce((s, r) => s + r.maxRedemptions, 0);
  if (totalRewardTiles > rows * cols) {
    return NextResponse.json({ error: "rewards_exceed_tiles" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().rpc("create_grid", {
    p_merchant_id: merchant.id,
    p_rows: rows,
    p_cols: cols,
    p_rewards: rewards.map((r) => ({
      description: r.description,
      expiry_hours: r.expiryHours,
      max_redemptions: r.maxRedemptions,
    })),
  });
  if (error) {
    console.error("[create_grid] rpc failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  const result = data as CreateGridResult;
  if (result.result === "error") {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
