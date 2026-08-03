import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DISPLAY_NAME_MAX, HANDLE_REGEX } from "@/lib/constants";
import { CONTRIBUTOR_COLUMNS, getAuthedContributor } from "@/lib/contributor-auth";
import type { ContributorProfile } from "@/lib/types";

function toProfile(row: {
  display_name: string;
  handle: string;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_account_name: string | null;
  paystack_subaccount_code: string | null;
}): ContributorProfile {
  return {
    displayName: row.display_name,
    handle: row.handle,
    payout: {
      bankName: row.payout_bank_name,
      accountNumber: row.payout_account_number,
      accountName: row.payout_account_name,
      connected: !!row.paystack_subaccount_code,
    },
  };
}

/** Who the signed-in contributor is, or null if they haven't set up yet. */
export async function GET() {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ profile: contributor ? toProfile(contributor) : null });
}

/**
 * Create or rename a contributor.
 *
 * There is no business here — no logo, no trading name, no verification. A
 * contributor is a person with a display name and a handle, and the handle
 * only exists so their share link reads like something.
 */
export async function POST(req: Request) {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    handle?: string;
  };
  const displayName = (body.displayName ?? "").trim();
  const handle = (body.handle ?? "").trim().toLowerCase();

  if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (!HANDLE_REGEX.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = contributor
    ? await db
        .from("contributors")
        .update({ display_name: displayName, handle })
        .eq("id", contributor.id)
        .select(CONTRIBUTOR_COLUMNS)
        .single()
    : await db
        .from("contributors")
        .insert({ owner_id: userId, display_name: displayName, handle })
        .select(CONTRIBUTOR_COLUMNS)
        .single();

  if (error) {
    // 23505 is the unique index on `handle`.
    if (error.code === "23505") {
      return NextResponse.json({ error: "handle_taken" }, { status: 409 });
    }
    console.error("[contributor] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ profile: toProfile(data) });
}
