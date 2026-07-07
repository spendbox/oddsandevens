import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import {
  EMAIL_REGEX,
  HEX_COLOR_REGEX,
  LOGO_CONTENT_TYPES,
  MAX_LOGO_BYTES,
  PHONE_REGEX,
} from "@/lib/constants";

// Update the merchant's branding and loyalty settings. Multipart so the logo
// file rides along with the text fields; every field is optional.
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

  const patch: Record<string, string | number | null> = {};

  const businessName = form.get("businessName");
  if (typeof businessName === "string" && businessName.trim()) {
    const name = businessName.trim();
    if (name.length > 80) {
      return NextResponse.json({ error: "invalid_business_name" }, { status: 400 });
    }
    patch.business_name = name;
  }

  const tagline = form.get("tagline");
  if (typeof tagline === "string") {
    const t = tagline.trim();
    if (t.length > 140) {
      return NextResponse.json({ error: "invalid_tagline" }, { status: 400 });
    }
    patch.tagline = t;
  }

  const brandColor = form.get("brandColor");
  if (typeof brandColor === "string" && brandColor) {
    const c = brandColor.trim().toLowerCase();
    if (!HEX_COLOR_REGEX.test(c)) {
      return NextResponse.json({ error: "invalid_brand_color" }, { status: 400 });
    }
    patch.brand_color = c;
  }

  const whatsapp = form.get("whatsapp");
  if (typeof whatsapp === "string") {
    const w = whatsapp.trim();
    if (w && !PHONE_REGEX.test(w)) {
      return NextResponse.json({ error: "invalid_whatsapp" }, { status: 400 });
    }
    patch.whatsapp = w || null;
  }

  const contactEmail = form.get("contactEmail");
  if (typeof contactEmail === "string") {
    const c = contactEmail.trim().toLowerCase();
    if (c && !EMAIL_REGEX.test(c)) {
      return NextResponse.json({ error: "invalid_contact_email" }, { status: 400 });
    }
    patch.contact_email = c || null;
  }

  for (const [field, column] of [
    ["pointsPerDiscount", "points_per_discount"],
    ["discountPercent", "discount_percent"],
  ] as const) {
    const raw = form.get(field);
    if (typeof raw === "string" && raw) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        return NextResponse.json({ error: "invalid_loyalty_settings" }, { status: 400 });
      }
      patch[column] = n;
    }
  }

  const db = supabaseAdmin();

  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_CONTENT_TYPES[logo.type];
    if (!ext) {
      return NextResponse.json({ error: "invalid_logo_type" }, { status: 400 });
    }
    if (logo.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "logo_too_large" }, { status: 400 });
    }
    // Timestamped path: no CDN cache invalidation worries on re-upload.
    const path = `${merchant.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await db.storage
      .from("logos")
      .upload(path, await logo.arrayBuffer(), { contentType: logo.type });
    if (uploadError) {
      console.error("[merchant profile] logo upload failed:", uploadError);
      return NextResponse.json({ error: "logo_upload_failed" }, { status: 500 });
    }
    patch.logo_url = db.storage.from("logos").getPublicUrl(path).data.publicUrl;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("merchants")
    .update(patch)
    .eq("id", merchant.id)
    .select(
      "id, business_name, slug, subscription_tier, premium_expires_at, logo_url, tagline, brand_color, points_per_discount, discount_percent, whatsapp, contact_email"
    )
    .single();
  if (error) {
    console.error("[merchant profile] update failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json(data);
}
