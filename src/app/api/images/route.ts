import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import type { LibraryImage } from "@/lib/types";

// Free image library for the grid wizard (active images only).
export async function GET() {
  const { userId } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin()
    .from("grid_images")
    .select("id, title, url")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[images] list failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ images: (data ?? []) as LibraryImage[] });
}
