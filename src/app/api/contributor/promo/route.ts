import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedContributor } from "@/lib/contributor-auth";

/**
 * A promo safe: a box you don't write the password for.
 *
 * It creates the box and stops. Paying for it goes through
 * `/api/contributor/boxes/[id]/fund` like any other box — the promo price is
 * already on the row as `funding_kobo`, and the ordinary funding settlement is
 * what puts it live. There is deliberately no second payment path and no
 * second way for a box to become playable.
 */

/** What the offer is, and how much of it is left. */
export async function GET() {
  const { contributor } = await getAuthedContributor();
  if (!contributor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const [avail, mine] = await Promise.all([
    db.rpc("promo_availability"),
    db
      .from("boxes")
      .select("id, slug, title, status, reward_kobo, funding_kobo, length")
      .eq("kind", "promo")
      .eq("contributor_id", contributor.id)
      .in("status", ["funding", "live"])
      .maybeSingle(),
  ]);

  if (avail.error) {
    console.error("[promo] availability failed:", avail.error);
    if (avail.error.code === "PGRST202" || avail.error.code === "PGRST205") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const row = (Array.isArray(avail.data) ? avail.data[0] : avail.data) as
    | Record<string, unknown>
    | null;
  const current = mine.data as Record<string, unknown> | null;

  return NextResponse.json({
    enabled: Boolean(row?.enabled ?? false),
    remaining: Number(row?.remaining ?? 0),
    claimed: Number(row?.claimed ?? 0),
    maxTotal: Number(row?.max_total ?? 0),
    priceKobo: Number(row?.price_kobo ?? 0),
    potKobo: Number(row?.pot_kobo ?? 0),
    current: current
      ? {
          id: String(current.id),
          slug: String(current.slug),
          title: String(current.title),
          status: String(current.status),
          rewardKobo: Number(current.reward_kobo ?? 0),
          priceKobo: Number(current.funding_kobo ?? 0),
          length: Number(current.length ?? 0),
        }
      : null,
  });
}

/** Draw one. It lands unpaid; the client takes it to the funding checkout. */
export async function POST() {
  const { contributor } = await getAuthedContributor();
  if (!contributor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin().rpc("create_promo_box", {
    p_contributor_id: contributor.id,
  });

  if (error) {
    console.error("[promo] create failed:", error);
    if (error.code === "PGRST202" || error.code === "PGRST205") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  const verdict = (data ?? {}) as {
    result?: string;
    error?: string;
    id?: string;
    slug?: string;
    price_kobo?: number;
  };
  // Sold out, already holding one, or switched off: all ordinary answers a
  // screen has to render, not faults.
  if (verdict.result !== "created") {
    return NextResponse.json({ error: verdict.error ?? "refused" }, { status: 409 });
  }

  return NextResponse.json({
    result: "created",
    id: verdict.id,
    slug: verdict.slug,
    priceKobo: verdict.price_kobo,
  });
}
