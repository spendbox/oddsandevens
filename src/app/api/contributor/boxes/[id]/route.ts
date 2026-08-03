import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { PUBLIC_BOX_COLUMNS, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { splitFunding } from "@/lib/game/rewards";
import { readBoxBody } from "../route";

/**
 * Edit a draft.
 *
 * Only a draft. The moment a box is funded, players start spending real lives
 * against that exact password, and changing it — or even its length — would
 * invalidate every attempt anyone has made. So the status check here is the
 * guarantee, not the greyed-out button in the dashboard.
 *
 * Raising the reward on a live box is a different operation with its own
 * route, because it costs money.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, contributor } = await getAuthedContributor();
  if (!userId || !contributor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = await readBoxBody(req);
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

  const split = splitFunding(parsed.fundingKobo);
  const { data, error } = await supabaseAdmin()
    .from("boxes")
    .update({
      title: parsed.title,
      blurb: parsed.blurb || null,
      secret: parsed.secret,
      length: parsed.secret.length,
      funding_kobo: split.fundingKobo,
      reward_kobo: split.rewardKobo,
      platform_fee_kobo: split.platformKobo,
    })
    .eq("id", id)
    .eq("contributor_id", contributor.id)
    .eq("status", "draft")
    .select(PUBLIC_BOX_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[boxes] edit failed:", error);
    return NextResponse.json({ error: "edit_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "box_not_editable" }, { status: 409 });

  return NextResponse.json({
    box: toPublicBox(data as BoxRow, { contributor: contributor.display_name }),
  });
}

/**
 * Throw a draft away.
 *
 * A funded box can never be deleted, by anyone. Somebody may have spent weeks
 * of lives on it, and the record of what they did has to outlive the
 * contributor's change of heart. Admins can withdraw a box from play; nobody
 * can erase it.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, contributor } = await getAuthedContributor();
  if (!userId || !contributor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await supabaseAdmin()
    .from("boxes")
    .delete()
    .eq("id", id)
    .eq("contributor_id", contributor.id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "box_not_deletable" }, { status: 409 });
  return NextResponse.json({ result: "deleted" });
}
