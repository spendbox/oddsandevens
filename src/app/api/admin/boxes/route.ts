import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ALPHABET_SET,
  BLURB_MAX,
  MAX_LENGTH,
  MAX_STAKE_KOBO,
  MIN_LENGTH,
  TITLE_MAX,
  guessesFor,
} from "@/lib/constants";
import { getAdminUser } from "@/lib/admin-auth";
import { PUBLIC_BOX_COLUMNS, slugify, toPublicBox, type BoxRow } from "@/lib/game/boxes";

/** Every box on the platform, whoever built it. */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data } = await db
    .from("boxes")
    .select(`${PUBLIC_BOX_COLUMNS}, stake_kobo, platform_fee_kobo, created_at`)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as (BoxRow & { stake_kobo: number; created_at: string })[];
  return NextResponse.json({
    boxes: rows.map((row) => ({
      ...toPublicBox(row),
      id: row.id,
      stakeKobo: Number(row.stake_kobo),
      createdAt: row.created_at,
    })),
  });
}

/**
 * Author the public box.
 *
 * The general box is free to play and funded by us, so there is no stake to
 * collect and no split to make: the prize is set outright and the box goes
 * live immediately. Only one general box is playable at a time — the unique
 * index enforces it — so publishing a new one means retiring the old one
 * first, which this does.
 */
export async function POST(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    blurb?: string;
    secret?: string;
    prizeKobo?: number;
  };

  const title = (body.title ?? "").trim();
  const blurb = (body.blurb ?? "").trim();
  const secret = (body.secret ?? "").trim().toUpperCase();
  const prizeKobo = Math.trunc(Number(body.prizeKobo ?? 0));

  if (!title || title.length > TITLE_MAX) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (blurb.length > BLURB_MAX) {
    return NextResponse.json({ error: "invalid_blurb" }, { status: 400 });
  }
  if (secret.length < MIN_LENGTH || secret.length > MAX_LENGTH) {
    return NextResponse.json({ error: "invalid_length" }, { status: 400 });
  }
  for (const ch of secret) {
    if (!ALPHABET_SET.has(ch)) {
      return NextResponse.json({ error: "invalid_characters" }, { status: 400 });
    }
  }
  if (prizeKobo < 0 || prizeKobo > MAX_STAKE_KOBO) {
    return NextResponse.json({ error: "invalid_prize" }, { status: 400 });
  }

  const db = supabaseAdmin();
  await db
    .from("boxes")
    .update({ status: "closed" })
    .eq("kind", "general")
    .eq("status", "live");

  const { data, error } = await db
    .from("boxes")
    .insert({
      kind: "general",
      slug: slugify(title),
      title,
      blurb: blurb || null,
      secret,
      length: secret.length,
      guesses_allowed: guessesFor(secret.length),
      stake_kobo: 0,
      prize_kobo: prizeKobo,
      platform_fee_kobo: 0,
      status: "live",
      published_at: new Date().toISOString(),
    })
    .select(PUBLIC_BOX_COLUMNS)
    .single();

  if (error) {
    console.error("[admin] general box create failed:", error);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json({ box: toPublicBox(data as BoxRow) });
}

/** Withdraw a box from play. An unlocked box is already finished; leave it. */
export async function PATCH(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { boxId?: string };
  if (!body.boxId) return NextResponse.json({ error: "invalid_box" }, { status: 400 });

  const { data } = await supabaseAdmin()
    .from("boxes")
    .update({ status: "closed" })
    .eq("id", body.boxId)
    .in("status", ["draft", "funding", "live"])
    .select("id")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "box_not_found" }, { status: 404 });
  return NextResponse.json({ result: "closed" });
}
