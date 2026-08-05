import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BLURB_MAX, MAX_LENGTH, MIN_LENGTH, TITLE_MAX } from "@/lib/constants";
import { alphabetOf, loadSymbols, withinAlphabet } from "@/lib/game/alphabet";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { PUBLIC_BOX_COLUMNS, slugify, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { fundingIsValid, minFundingKobo, splitFunding } from "@/lib/game/rewards";
import { toDesign, type Design } from "@/lib/game/designs";
import type { OwnedBox } from "@/lib/types";

/** The contributor's own boxes, with the earnings each one has thrown off. */
export async function GET() {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contributor) return NextResponse.json({ boxes: [] });

  const db = supabaseAdmin();
  const { data } = await db
    .from("boxes")
    .select(`${PUBLIC_BOX_COLUMNS}, funding_kobo, platform_fee_kobo, created_at`)
    .eq("contributor_id", contributor.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as (BoxRow & {
    funding_kobo: number;
    platform_fee_kobo: number;
    created_at: string;
  })[];

  // Two queries for all the income, bucketed by box in memory — a box list is
  // short, and this keeps it to a fixed number of round trips however long it
  // gets. Lives count towards a box now: they're bought with that safe on
  // screen and they pay its contributor.
  const [{ data: orders }, { data: lifeOrders }] = await Promise.all([
    db
      .from("power_up_orders")
      .select("box_id, contributor_kobo")
      .eq("contributor_id", contributor.id)
      .eq("status", "paid"),
    db
      .from("life_orders")
      .select("box_id, contributor_kobo")
      .eq("contributor_id", contributor.id)
      .eq("status", "paid"),
  ]);

  type Income = { box_id: string | null; contributor_kobo: number };
  const earned = new Map<string, { kobo: number; count: number }>();
  const fold = (rows: Income[], counts: boolean) => {
    for (const order of rows) {
      if (!order.box_id) continue;
      const current = earned.get(order.box_id) ?? { kobo: 0, count: 0 };
      earned.set(order.box_id, {
        kobo: current.kobo + Number(order.contributor_kobo),
        count: current.count + (counts ? 1 : 0),
      });
    }
  };
  fold((orders ?? []) as Income[], true);
  fold((lifeOrders ?? []) as Income[], false);

  const boxes: OwnedBox[] = rows.map((row) => ({
    ...toPublicBox(row, { contributor: contributor.display_name }),
    id: row.id,
    fundingKobo: Number(row.funding_kobo),
    platformFeeKobo: Number(row.platform_fee_kobo),
    earnedKobo: earned.get(row.id)?.kobo ?? 0,
    powerUpsSold: earned.get(row.id)?.count ?? 0,
    // Anything unpublished can still be changed or thrown away. The line is
    // publication, not creation: a box awaiting a payment that never came is
    // as unplayed as a draft. Once it's live, players are spending real lives
    // against that exact password and it is permanent.
    editable: row.status === "draft" || row.status === "funding",
    createdAt: row.created_at,
    // The author wrote the password, so telling them its length reveals
    // nothing they don't already know.
    length: row.length,
  }));

  return NextResponse.json({ boxes });
}

/**
 * Start a box.
 *
 * It lands as a **draft**: invisible, editable, deletable. Nothing is charged
 * and nothing is published until the contributor funds it, which is the point
 * — a password is worth rewriting a few times before you commit money and
 * other people's weeks to it.
 */
export async function POST(req: Request) {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contributor) return NextResponse.json({ error: "no_profile" }, { status: 409 });

  const parsed = await readBoxBody(req);
  if ("error" in parsed) {
    return NextResponse.json(parsed, { status: 400 });
  }

  const split = splitFunding(parsed.fundingKobo);
  const db = supabaseAdmin();

  // The slug carries random bytes, so a clash is a fluke rather than a
  // pattern; one retry is plenty.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db
      .from("boxes")
      .insert({
        kind: "contributor",
        contributor_id: contributor.id,
        slug: slugify(parsed.title),
        title: parsed.title,
        blurb: parsed.blurb || null,
        secret: parsed.secret,
        length: parsed.secret.length,
        funding_kobo: split.fundingKobo,
        reward_kobo: split.rewardKobo,
        platform_fee_kobo: split.platformKobo,
        design: parsed.design,
        status: "draft",
      })
      .select(PUBLIC_BOX_COLUMNS)
      .single();

    if (!error) {
      return NextResponse.json({
        box: toPublicBox(data as BoxRow, { contributor: contributor.display_name }),
        boxId: (data as BoxRow).id,
      });
    }
    if (error.code !== "23505") {
      console.error("[boxes] create failed:", error);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "create_failed" }, { status: 500 });
}

export interface ParsedBox {
  title: string;
  blurb: string;
  secret: string;
  fundingKobo: number;
  design: Design;
}

/**
 * Validate a box's contents. Shared by create and edit, so a draft can never
 * be edited into a state it couldn't have been created in.
 *
 * The password is taken exactly as typed: case is part of it now, so nothing
 * here upper-cases anything. Characters outside the alphabet are rejected
 * rather than silently dropped — quietly changing somebody's password would be
 * the worst possible thing to do here.
 */
export async function readBoxBody(
  req: Request
): Promise<ParsedBox | { error: string; minFundingKobo?: number }> {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    blurb?: string;
    secret?: string;
    fundingKobo?: number;
    design?: string;
  };

  const title = (body.title ?? "").trim();
  const blurb = (body.blurb ?? "").trim();
  const secret = body.secret ?? "";
  const fundingKobo = Math.trunc(Number(body.fundingKobo ?? 0));
  // Decoration, so an unrecognised one is quietly the default rather than a
  // 400 — there is nothing here worth failing a box creation over.
  const design = toDesign(body.design);

  if (!title || title.length > TITLE_MAX) return { error: "invalid_title" };
  if (blurb.length > BLURB_MAX) return { error: "invalid_blurb" };
  if (secret.length < MIN_LENGTH || secret.length > MAX_LENGTH) {
    return { error: "invalid_length" };
  }
  // The *current* alphabet, not the guess one: a new password may only be
  // built from what is on offer today. Anything creatable is guessable, so
  // this is always the narrower of the two.
  const allowed = new Set(alphabetOf(await loadSymbols(supabaseAdmin())));
  if (!withinAlphabet(secret, allowed)) return { error: "invalid_characters" };
  if (!fundingIsValid(secret.length, fundingKobo)) {
    return { error: "funding_too_low", minFundingKobo: minFundingKobo(secret.length) };
  }

  return { title, blurb, secret, fundingKobo, design };
}
