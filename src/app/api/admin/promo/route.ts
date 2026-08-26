import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

/**
 * Free safes, from the platform's side.
 *
 * This is the one route in the product that can read a password back, and the
 * shape of that is deliberate. The promise elsewhere — that nobody here can
 * read a password back to you — is about a password *somebody wrote*. Nobody
 * wrote these: they were drawn by `new_free_password` and returned to no one.
 * Reading one discloses nothing about any person, and the ability is what lets
 * an administrator answer "is this box actually winnable" without guessing at
 * it for a fortnight.
 *
 * The filter to free safes lives in `free_safe_secret` rather than here, so a
 * mistake in this file cannot turn into a way to read a contributor's.
 */

export async function GET(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const reveal = url.searchParams.get("reveal");

  const db = supabaseAdmin();

  if (reveal) {
    const { data, error } = await db.rpc("promo_box_secret", { p_box_id: reveal });
    if (error) {
      console.error("[admin] reveal failed:", error);
      return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }
    // Logged rather than silent. Reading a password is the one privileged act
    // here that leaves no trace in the data, so it leaves one in the log —
    // who, which box, when.
    console.warn(`[admin] promo safe password revealed: box=${reveal} by=${admin.email}`);
    if (data == null) return NextResponse.json({ error: "not_a_promo_safe" }, { status: 404 });
    return NextResponse.json({ secret: String(data) });
  }

  const [list, exposure, config] = await Promise.all([
    db
      .from("admin_promo_boxes")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(200),
    db.from("admin_promo_exposure").select("*").maybeSingle(),
    db.rpc("promo_config"),
  ]);

  const failure = list.error ?? exposure.error;
  if (failure) {
    console.error("[admin] free safes failed:", failure);
    if (failure.code === "PGRST205" || failure.code === "PGRST204") {
      return NextResponse.json({ error: "not_migrated" }, { status: 503 });
    }
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const e = (exposure.data ?? {}) as Record<string, unknown>;
  const cfg = (Array.isArray(config.data) ? config.data[0] : config.data) as
    | Record<string, unknown>
    | null;

  return NextResponse.json({
    exposure: {
      live: Number(e.live ?? 0),
      cracked: Number(e.cracked ?? 0),
      total: Number(e.total ?? 0),
      atRiskKobo: Number(e.at_risk_kobo ?? 0),
      paidOutKobo: Number(e.paid_out_kobo ?? 0),
      awaitingPayment: Number(e.awaiting_payment ?? 0),
      collectedKobo: Number(e.collected_kobo ?? 0),
      attempts: Number(e.attempts ?? 0),
    },
    config: {
      enabled: Boolean(cfg?.enabled ?? true),
      potKobo: Number(cfg?.pot_kobo ?? 0),
      // `promo_config()` returns max_total and price_kobo. Reading the wrong
      // column here did not merely display a zero — the panel sent that zero
      // straight back on the next save, which set the allocation to nothing
      // and made every promo safe report itself sold out.
      maxTotal: Number(cfg?.max_total ?? 0),
      priceKobo: Number(cfg?.price_kobo ?? 0),
      creatorSharePercent: Number(cfg?.creator_share_percent ?? 70),
    },
    safes: ((list.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      status: String(row.status),
      rewardKobo: Number(row.reward_kobo ?? 0),
      length: Number(row.length ?? 0),
      attempts: Number(row.attempts_count ?? 0),
      hunters: Number(row.players_count ?? 0),
      bestPercent: Number(row.best_percent ?? 0),
      winnerEmail: (row.winner_email as string | null) ?? null,
      fundingKobo: Number(row.funding_kobo ?? 0),
      creatorName: (row.creator_name as string | null) ?? null,
      publishedAt: row.published_at ? String(row.published_at) : null,
    })),
  });
}

/** Change what bounds the exposure, or record a payout to a creator. */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: "settings";
    enabled?: boolean;
    potKobo?: number;
    maxTotal?: number;
    creatorSharePercent?: number;
    priceKobo?: number;
  };
  const db = supabaseAdmin();

  // Sent whole, like every other settings blob here: what the screen is
  // showing is what gets stored, so clearing a field is how it goes back to
  // the built-in default.
  const value: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") value.enabled = body.enabled;
  if (typeof body.potKobo === "number") value.potKobo = Math.max(0, Math.trunc(body.potKobo));
  if (typeof body.maxTotal === "number") value.maxTotal = Math.max(0, Math.trunc(body.maxTotal));
  if (typeof body.priceKobo === "number") value.priceKobo = Math.max(0, Math.trunc(body.priceKobo));
  if (typeof body.creatorSharePercent === "number") {
    value.creatorSharePercent = Math.max(0, Math.min(100, Math.trunc(body.creatorSharePercent)));
  }

  const { error } = await db.rpc("set_promo_settings", { p_value: value, p_by: admin.email });
  if (error) {
    console.error("[admin] promo settings failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ result: "saved" });
}
