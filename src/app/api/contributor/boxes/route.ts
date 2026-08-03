import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ALPHABET_SET,
  BLURB_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
} from "@/lib/constants";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { PUBLIC_BOX_COLUMNS, slugify, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { fundingIsValid, minFundingKobo, splitFunding } from "@/lib/game/rewards";
import { estimateAttempts } from "@/lib/game/difficulty";
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

  // One query for all the power-up income, bucketed by box in memory — a box
  // list is short, and this keeps it to two round trips however long it gets.
  const { data: orders } = await db
    .from("power_up_orders")
    .select("box_id, contributor_kobo")
    .eq("contributor_id", contributor.id)
    .eq("status", "paid");

  const earned = new Map<string, { kobo: number; count: number }>();
  for (const order of (orders ?? []) as { box_id: string; contributor_kobo: number }[]) {
    const current = earned.get(order.box_id) ?? { kobo: 0, count: 0 };
    earned.set(order.box_id, {
      kobo: current.kobo + Number(order.contributor_kobo),
      count: current.count + 1,
    });
  }

  const boxes: OwnedBox[] = rows.map((row) => ({
    ...toPublicBox(row, { contributor: contributor.display_name }),
    id: row.id,
    fundingKobo: Number(row.funding_kobo),
    platformFeeKobo: Number(row.platform_fee_kobo),
    earnedKobo: earned.get(row.id)?.kobo ?? 0,
    powerUpsSold: earned.get(row.id)?.count ?? 0,
    // Only a draft can still be changed. Once money is behind a box, players
    // are spending real lives against that exact password.
    editable: row.status === "draft",
    createdAt: row.created_at,
    // The author wrote the password, so telling them its length — and the
    // attempt estimate derived from it — reveals nothing they don't know.
    length: row.length,
    estimatedAttempts: estimateAttempts(row.length),
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
  };

  const title = (body.title ?? "").trim();
  const blurb = (body.blurb ?? "").trim();
  const secret = body.secret ?? "";
  const fundingKobo = Math.trunc(Number(body.fundingKobo ?? 0));

  if (!title || title.length > TITLE_MAX) return { error: "invalid_title" };
  if (blurb.length > BLURB_MAX) return { error: "invalid_blurb" };
  if (secret.length < MIN_LENGTH || secret.length > MAX_LENGTH) {
    return { error: "invalid_length" };
  }
  for (const ch of secret) {
    if (!ALPHABET_SET.has(ch)) return { error: "invalid_characters" };
  }
  if (!fundingIsValid(secret.length, fundingKobo)) {
    return { error: "funding_too_low", minFundingKobo: minFundingKobo(secret.length) };
  }

  return { title, blurb, secret, fundingKobo };
}
