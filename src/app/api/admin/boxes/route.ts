import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  BLURB_MAX,
  MAX_FUNDING_KOBO,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
} from "@/lib/constants";
import { alphabetOf, loadSymbols, withinAlphabet } from "@/lib/game/alphabet";
import { getAdminUser } from "@/lib/admin-auth";
import { toDesign } from "@/lib/game/designs";
import { PUBLIC_BOX_COLUMNS, slugify, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { applySeeding } from "@/lib/game/seeding";

/** Every box on the platform, whoever built it. */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data } = await db
    .from("boxes")
    .select(`${PUBLIC_BOX_COLUMNS}, funding_kobo, platform_fee_kobo, created_at`)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as (BoxRow & { funding_kobo: number; created_at: string })[];
  return NextResponse.json({
    boxes: rows.map((row) => ({
      ...toPublicBox(row),
      id: row.id,
      fundingKobo: Number(row.funding_kobo),
      createdAt: row.created_at,
    })),
  });
}

/**
 * Author the public box.
 *
 * The general box is free to play and funded by us, so there is nothing to
 * collect and no split to make: the reward is set outright — possibly to
 * nothing at all, which makes it a pure challenge — and the box goes live
 * immediately. Only one general box is playable at a time — the unique
 * index enforces it — so publishing a new one means retiring the old one
 * first, which this does.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    blurb?: string;
    secret?: string;
    rewardKobo?: number;
    design?: string;
    /** Seeding, all optional. See 0044 for what each of these does and doesn't. */
    attemptsCount?: number;
    playersCount?: number;
    crackedBy?: string;
    crackedAt?: string;
    hunters?: unknown;
  };

  const title = (body.title ?? "").trim();
  const blurb = (body.blurb ?? "").trim();
  // Taken exactly as typed: case is part of the password now.
  const secret = body.secret ?? "";
  const rewardKobo = Math.trunc(Number(body.rewardKobo ?? 0));
  // Decoration, so an unrecognised one is quietly the default rather than a
  // 400 — exactly as on a contributor's box.
  const design = toDesign(body.design);

  if (!title || title.length > TITLE_MAX) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (blurb.length > BLURB_MAX) {
    return NextResponse.json({ error: "invalid_blurb" }, { status: 400 });
  }
  if (secret.length < MIN_LENGTH || secret.length > MAX_LENGTH) {
    return NextResponse.json({ error: "invalid_length" }, { status: 400 });
  }
  // The live alphabet, same as a contributor's box: an admin editing the
  // symbol list edits what they can type into this field too.
  const allowed = new Set(alphabetOf(await loadSymbols(supabaseAdmin())));
  if (!withinAlphabet(secret, allowed)) {
    return NextResponse.json({ error: "invalid_characters" }, { status: 400 });
  }
  if (rewardKobo < 0 || rewardKobo > MAX_FUNDING_KOBO) {
    return NextResponse.json({ error: "invalid_reward" }, { status: 400 });
  }

  // Publishing used to close every other live platform box first, because the
  // schema allowed exactly one and "the public game" was singular. Both halves
  // of that are gone — 0032 dropped the index, and featuring decides what sits
  // at the top of the page now. A new box is a new box; the old ones keep
  // playing until somebody cracks them or an admin closes them by hand.
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("boxes")
    .insert({
      kind: "general",
      slug: slugify(title),
      title,
      blurb: blurb || null,
      secret,
      length: secret.length,
      funding_kobo: 0,
      reward_kobo: rewardKobo,
      platform_fee_kobo: 0,
      design,
      status: "live",
      published_at: new Date().toISOString(),
    })
    .select(PUBLIC_BOX_COLUMNS)
    .single();

  if (error) {
    console.error("[admin] general box create failed:", error);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // Seeding, if any was asked for. A box authored as already-cracked is one
  // request rather than two, because the second one is the one you forget.
  const created = data as BoxRow;
  const { box: seeded, changed } = await applySeeding(db, created.id, body, admin.email);

  return NextResponse.json({
    box: toPublicBox(seeded ?? created),
    seeded: changed,
  });
}

/** Withdraw a box from play. An unlocked box is already finished; leave it. */
export async function PATCH(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    boxId?: string;
    featured?: boolean;
  };
  if (!body.boxId) return NextResponse.json({ error: "invalid_box" }, { status: 400 });

  const db = supabaseAdmin();

  // ---- Featuring ----------------------------------------------------------
  // Editorial rather than structural: whichever boxes are worth the top of the
  // landing page, however many, whoever made them. Only a *live* box can be
  // featured — `claim_box` clears the flag the moment somebody cracks one, and
  // this is the other half of that rule.
  if (typeof body.featured === "boolean") {
    const { data } = await db
      .from("boxes")
      .update({ featured_at: body.featured ? new Date().toISOString() : null })
      .eq("id", body.boxId)
      .eq("status", "live")
      .select("id")
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "not_featurable" }, { status: 409 });
    }
    return NextResponse.json({ result: body.featured ? "featured" : "unfeatured" });
  }

  // ---- Closing ------------------------------------------------------------
  const { data } = await db
    .from("boxes")
    .update({ status: "closed", featured_at: null })
    .eq("id", body.boxId)
    .in("status", ["draft", "funding", "live"])
    .select("id")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "box_not_found" }, { status: 404 });
  return NextResponse.json({ result: "closed" });
}
