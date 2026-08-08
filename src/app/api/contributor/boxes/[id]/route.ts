import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { PUBLIC_BOX_COLUMNS, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { splitFunding } from "@/lib/game/rewards";
import { readBoxBody } from "../route";

type Db = ReturnType<typeof supabaseAdmin>;

/** The two states a box can be in before anyone has ever played it. */
const UNPUBLISHED = ["draft", "funding"];

/**
 * Has money actually reached this box?
 *
 * The status column says what the contributor *meant* to do; only a paid
 * funding order says what happened. A box can sit at 'funding' with a
 * checkout open, abandoned, forever — that's unpublished. A box with a paid
 * order behind it is funded even if the webhook hasn't flipped it live yet,
 * and neither editing nor deleting may touch it.
 */
async function isPaidFor(db: Db, boxId: string): Promise<boolean> {
  const { data } = await db
    .from("funding_orders")
    .select("id")
    .eq("box_id", boxId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Edit a box nobody has played.
 *
 * The moment a box is funded, players start spending real lives against that
 * exact password, and changing it — or even its length — would invalidate
 * every attempt anyone has made. So the checks here are the guarantee, not the
 * greyed-out button in the dashboard.
 *
 * Raising the reward on a live box is a different operation with its own
 * route, because it costs money and can only ever go up.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, contributor } = await getAuthedContributor();
  if (!userId || !contributor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  if (await isPaidFor(db, id)) {
    return NextResponse.json({ error: "box_not_editable" }, { status: 409 });
  }

  // Read before validating: what this draft already holds is its floor, so a
  // raise to the funding ladder never strands a box somebody is mid-way
  // through writing. See `readBoxBody`.
  const { data: existing } = await db
    .from("boxes")
    .select("length, funding_kobo")
    .eq("id", id)
    .eq("contributor_id", contributor.id)
    .in("status", UNPUBLISHED)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "box_not_editable" }, { status: 409 });

  const parsed = await readBoxBody(req, {
    length: Number(existing.length),
    fundingKobo: Number(existing.funding_kobo),
  });
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

  const split = splitFunding(parsed.fundingKobo);
  const { data, error } = await db
    .from("boxes")
    .update({
      title: parsed.title,
      blurb: parsed.blurb || null,
      secret: parsed.secret,
      length: parsed.secret.length,
      funding_kobo: split.fundingKobo,
      reward_kobo: split.rewardKobo,
      platform_fee_kobo: split.platformKobo,
      design: parsed.design,
      // Back to a draft. A box at 'funding' has a checkout open somewhere, and
      // that checkout was for the old password at the old price — paying it
      // after an edit would publish something nobody agreed to. Dropping the
      // status invalidates the flow and the contributor simply funds again.
      status: "draft",
    })
    .eq("id", id)
    .eq("contributor_id", contributor.id)
    .in("status", UNPUBLISHED)
    .select(PUBLIC_BOX_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[boxes] edit failed:", error);
    return NextResponse.json({ error: "edit_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "box_not_editable" }, { status: 409 });

  // And cancel the orders that edit just made meaningless.
  await db
    .from("funding_orders")
    .update({ status: "failed" })
    .eq("box_id", id)
    .eq("status", "pending");

  return NextResponse.json({
    box: toPublicBox(data as BoxRow, { contributor: contributor.display_name }),
  });
}

/**
 * Throw an unpublished box away.
 *
 * A *funded* box can never be deleted, by anyone. Somebody may have spent
 * weeks of lives on it, and the record of what they did has to outlive the
 * contributor's change of heart. Admins can withdraw a box from play; nobody
 * can erase it.
 *
 * Everything short of that is the contributor's own — a draft, or a box they
 * started funding and thought better of.
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

  const db = supabaseAdmin();
  if (await isPaidFor(db, id)) {
    return NextResponse.json({ error: "box_not_deletable" }, { status: 409 });
  }

  const { data } = await db
    .from("boxes")
    .delete()
    .eq("id", id)
    .eq("contributor_id", contributor.id)
    .in("status", UNPUBLISHED)
    .select("id")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "box_not_deletable" }, { status: 409 });
  return NextResponse.json({ result: "deleted" });
}
