import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ALPHABET_SET,
  BLURB_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
  guessesFor,
} from "@/lib/constants";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { PUBLIC_BOX_COLUMNS, slugify, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { minStakeKobo, splitStake, stakeIsValid } from "@/lib/game/stakes";
import type { OwnedBox } from "@/lib/types";

/** The contributor's own boxes, with the earnings each one has thrown off. */
export async function GET() {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contributor) return NextResponse.json({ boxes: [] });

  const db = supabaseAdmin();
  const { data } = await db
    .from("boxes")
    .select(`${PUBLIC_BOX_COLUMNS}, stake_kobo, platform_fee_kobo, created_at`)
    .eq("contributor_id", contributor.id)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as (BoxRow & {
    stake_kobo: number;
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
    stakeKobo: Number(row.stake_kobo),
    platformFeeKobo: Number(row.platform_fee_kobo),
    earnedKobo: earned.get(row.id)?.kobo ?? 0,
    powerUpsSold: earned.get(row.id)?.count ?? 0,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ boxes });
}

/**
 * Build a spendbox.
 *
 * The box is created in `funding` and is invisible until the stake is paid —
 * a prize nobody has put money behind isn't a prize. The stake floor rises
 * with the password's length, because a longer password is a harder box and a
 * harder box has to be worth the guesses it will take.
 */
export async function POST(req: Request) {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contributor) return NextResponse.json({ error: "no_profile" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    blurb?: string;
    secret?: string;
    stakeKobo?: number;
  };

  const title = (body.title ?? "").trim();
  const blurb = (body.blurb ?? "").trim();
  const secret = (body.secret ?? "").trim().toUpperCase();
  const stakeKobo = Math.trunc(Number(body.stakeKobo ?? 0));

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
  if (!stakeIsValid(secret.length, stakeKobo)) {
    return NextResponse.json(
      { error: "stake_too_low", minStakeKobo: minStakeKobo(secret.length) },
      { status: 400 }
    );
  }

  const split = splitStake(stakeKobo);
  const db = supabaseAdmin();

  // The slug carries random bytes, so a clash is a fluke rather than a
  // pattern; one retry is plenty.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db
      .from("boxes")
      .insert({
        kind: "contributor",
        contributor_id: contributor.id,
        slug: slugify(title),
        title,
        blurb: blurb || null,
        secret,
        length: secret.length,
        guesses_allowed: guessesFor(secret.length),
        stake_kobo: split.stakeKobo,
        prize_kobo: split.prizeKobo,
        platform_fee_kobo: split.platformKobo,
        status: "funding",
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
