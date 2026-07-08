import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { LOGO_CONTENT_TYPES, MAX_GRID_IMAGE_BYTES } from "@/lib/constants";

// Admin: manage the free grid-image library merchants can pick from.

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin()
    .from("grid_images")
    .select("id, title, url, is_active, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin images] list failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ images: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const title = String(form?.get("title") ?? "").trim();
  const image = form?.get("image");

  if (!title || title.length > 80) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "missing_image" }, { status: 400 });
  }
  const ext = LOGO_CONTENT_TYPES[image.type];
  if (!ext) {
    return NextResponse.json({ error: "invalid_image_type" }, { status: 400 });
  }
  if (image.size > MAX_GRID_IMAGE_BYTES) {
    return NextResponse.json({ error: "image_too_large" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const path = `library/${Date.now()}.${ext}`;
  const { error: uploadError } = await db.storage
    .from("grid-images")
    .upload(path, await image.arrayBuffer(), { contentType: image.type });
  if (uploadError) {
    console.error("[admin images] upload failed:", uploadError);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
  const url = db.storage.from("grid-images").getPublicUrl(path).data.publicUrl;

  const { data, error } = await db
    .from("grid_images")
    .insert({ title, url })
    .select("id, title, url, is_active, created_at")
    .single();
  if (error) {
    console.error("[admin images] insert failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

// Toggle an image's availability in the library.
export async function PATCH(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const isActive = Boolean(body?.isActive);
  if (!id) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { error } = await supabaseAdmin()
    .from("grid_images")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    console.error("[admin images] toggle failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Remove an image from the library entirely (grids that already use it keep
// their copy of the URL; the storage object is best-effort deleted).
export async function DELETE(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: img } = await db
    .from("grid_images")
    .select("id, url")
    .eq("id", id)
    .maybeSingle();
  if (!img) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await db.from("grid_images").delete().eq("id", img.id);
  if (error) {
    console.error("[admin images] delete failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  // Best-effort storage cleanup: the URL ends with the object path.
  const marker = "/grid-images/";
  const idx = img.url.indexOf(marker);
  if (idx !== -1) {
    const path = img.url.slice(idx + marker.length);
    await db.storage.from("grid-images").remove([path]);
  }
  return NextResponse.json({ ok: true });
}
