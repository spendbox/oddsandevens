import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PublicGamesHub } from "@/lib/games/types";

// The business's game hub: branding plus every game that is live right now.
// Prize teasers are descriptions only — never odds, never stock.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const { data: merchant } = await db
    .from("merchants")
    .select(
      "id, business_name, slug, logo_url, tagline, brand_color, whatsapp, contact_email"
    )
    .eq("slug", slug.toLowerCase())
    .single();
  if (!merchant) {
    return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
  }

  const { data: games } = await db
    .from("games")
    .select("id, slug, type, title, description, theme, plays_count")
    .eq("merchant_id", merchant.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const ids = (games ?? []).map((g) => g.id);
  const { data: prizes } = ids.length
    ? await db
        .from("game_prizes")
        .select("game_id, description, kind, position")
        .in("game_id", ids)
        .eq("kind", "prize")
        .order("position", { ascending: true })
    : { data: [] as { game_id: string; description: string }[] };

  const hub: PublicGamesHub = {
    host: {
      businessName: merchant.business_name,
      slug: merchant.slug,
      logoUrl: merchant.logo_url,
      tagline: merchant.tagline,
      brandColor: merchant.brand_color,
      whatsapp: merchant.whatsapp,
      contactEmail: merchant.contact_email,
    },
    games: (games ?? []).map((g) => ({
      slug: g.slug,
      type: g.type,
      title: g.title,
      description: g.description,
      theme: g.theme ?? {},
      playsCount: g.plays_count,
      prizeTeasers: (prizes ?? [])
        .filter((p) => p.game_id === g.id)
        .slice(0, 3)
        .map((p) => p.description),
    })),
  };
  return NextResponse.json(hub);
}
