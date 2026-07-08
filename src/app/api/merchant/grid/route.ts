import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { effectiveTier, getAuthedMerchant } from "@/lib/merchant-auth";
import {
  GRID_SIZE,
  GRID_RESET_DAYS_DEFAULT,
  LOGO_CONTENT_TYPES,
  MAX_GRID_IMAGE_BYTES,
  REWARD_EXPIRY_DAYS_MAX,
  REWARD_EXPIRY_DAYS_MIN,
  TIER_LIMITS,
  TILE_SHAPES,
  type TileShape,
} from "@/lib/constants";
import type { CreateGridResult } from "@/lib/types";

interface RewardInput {
  description: string;
  details: string | null;
  expiryDays: number;
  maxRedemptions: number;
}

// Create a grid (always 7x7). Multipart form:
//   rewards (JSON array), title?, tileShape?, resetDays?,
//   imageUrl? (library pick) OR image? (custom upload, premium only).
// Rewards are placed on random tiles inside the create_grid Postgres function
// — positions are never sent to or chosen by the client. Tier caps are
// validated here AND in the function.
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const tileShape = String(form.get("tileShape") ?? "square") as TileShape;
  const resetDays = Number(form.get("resetDays") ?? GRID_RESET_DAYS_DEFAULT);
  let imageUrl: string | null = String(form.get("imageUrl") ?? "").trim() || null;
  let rewardsInput: unknown;
  try {
    rewardsInput = JSON.parse(String(form.get("rewards") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const tier = effectiveTier(merchant);
  const limits = TIER_LIMITS[tier];
  if (title.length > 80) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (!TILE_SHAPES.includes(tileShape)) {
    return NextResponse.json({ error: "invalid_tile_shape" }, { status: 400 });
  }
  if (tileShape !== "square" && tier !== "premium") {
    return NextResponse.json({ error: "shape_requires_premium" }, { status: 403 });
  }
  if (
    !Number.isInteger(resetDays) ||
    resetDays < limits.resetDaysMin ||
    resetDays > limits.resetDaysMax
  ) {
    return NextResponse.json({ error: "invalid_reset_days" }, { status: 400 });
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
    const details = String(r?.details ?? "").trim() || null;
    const expiryDays = Number(r?.expiryDays ?? 2);
    const maxRedemptions = Number(r?.maxRedemptions ?? 1);
    if (
      description.length < 1 ||
      description.length > 200 ||
      (details !== null && details.length > 300) ||
      !Number.isInteger(expiryDays) ||
      expiryDays < REWARD_EXPIRY_DAYS_MIN ||
      expiryDays > REWARD_EXPIRY_DAYS_MAX ||
      !Number.isInteger(maxRedemptions) ||
      maxRedemptions < 1
    ) {
      return NextResponse.json({ error: "invalid_reward" }, { status: 400 });
    }
    rewards.push({ description, details, expiryDays, maxRedemptions });
  }

  const totalRewardTiles = rewards.reduce((s, r) => s + r.maxRedemptions, 0);
  if (totalRewardTiles > GRID_SIZE * GRID_SIZE) {
    return NextResponse.json({ error: "rewards_exceed_tiles" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // A library pick must actually come from the active library — merchants
  // can't smuggle arbitrary URLs onto their grid via imageUrl.
  if (imageUrl) {
    const { data: libraryHit } = await db
      .from("grid_images")
      .select("id")
      .eq("url", imageUrl)
      .eq("is_active", true)
      .maybeSingle();
    if (!libraryHit) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }
  }

  const customImage = form.get("image");
  if (customImage instanceof File && customImage.size > 0) {
    if (tier !== "premium") {
      return NextResponse.json(
        { error: "custom_image_requires_premium" },
        { status: 403 }
      );
    }
    const ext = LOGO_CONTENT_TYPES[customImage.type];
    if (!ext) {
      return NextResponse.json({ error: "invalid_image_type" }, { status: 400 });
    }
    if (customImage.size > MAX_GRID_IMAGE_BYTES) {
      return NextResponse.json({ error: "image_too_large" }, { status: 400 });
    }
    const path = `custom/${merchant.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage
      .from("grid-images")
      .upload(path, await customImage.arrayBuffer(), {
        contentType: customImage.type,
      });
    if (uploadError) {
      console.error("[create grid] image upload failed:", uploadError);
      return NextResponse.json({ error: "image_upload_failed" }, { status: 500 });
    }
    imageUrl = db.storage.from("grid-images").getPublicUrl(path).data.publicUrl;
  }

  const { data, error } = await db.rpc("create_grid", {
    p_merchant_id: merchant.id,
    p_rewards: rewards.map((r) => ({
      description: r.description,
      details: r.details,
      expiry_days: r.expiryDays,
      max_redemptions: r.maxRedemptions,
    })),
    p_title: title || null,
    p_image_url: imageUrl,
    p_tile_shape: tileShape,
    p_reset_days: resetDays,
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
