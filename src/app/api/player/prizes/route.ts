import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";

interface ClaimRow {
  id: string;
  amount_kobo: number;
  status: "unclaimed" | "submitted" | "paid";
  account_name: string | null;
  bank_name: string | null;
  created_at: string;
  paid_at: string | null;
  boxes: { title: string; slug: string } | null;
}

const CLAIM_COLUMNS =
  "id, amount_kobo, status, account_name, bank_name, created_at, paid_at, boxes(title, slug)";

/**
 * Every safe this player has opened, where each prize has got to, and the one
 * account all of it is going to.
 *
 * The account comes back beside the prizes on purpose. It used to be collected
 * per claim — so a winner was asked for bank details they had already given on
 * the next tab, and ended up with two accounts on file and no way to tell
 * which one anything had been sent to. There is one account per player now, it
 * lives on `players`, and this reads it rather than asking again. That is also
 * why this route no longer accepts a POST: there is nothing left for a winner
 * to submit.
 *
 * A paid claim keeps its own copy of the account it went to, because that is a
 * payment record and must not move when somebody edits their details.
 */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ prizes: [], account: null });

  const db = supabaseAdmin();
  const { data: player } = await db
    .from("players")
    .select("id, bank_name, account_number, account_name")
    .eq("email", email)
    .maybeSingle();
  if (!player) return NextResponse.json({ prizes: [], account: null });

  const row = player as {
    id: string;
    bank_name: string | null;
    account_number: string | null;
    account_name: string | null;
  };

  const { data, error } = await db
    .from("reward_claims")
    .select(CLAIM_COLUMNS)
    .eq("player_id", row.id)
    .order("created_at", { ascending: false });
  if (error) console.error("[prizes] read failed:", error);

  return NextResponse.json({
    prizes: ((data ?? []) as unknown as ClaimRow[]).map((claim) => ({
      id: claim.id,
      amountKobo: Number(claim.amount_kobo),
      status: claim.status,
      title: claim.boxes?.title ?? "A spendbox",
      slug: claim.boxes?.slug ?? null,
      accountName: claim.account_name,
      bankName: claim.bank_name,
      wonAt: claim.created_at,
      paidAt: claim.paid_at,
    })),
    account: {
      accountName: row.account_name,
      bankName: row.bank_name,
      // Only the last four ever leave the server. Nothing on that screen needs
      // the whole number read back.
      accountLast4: row.account_number ? row.account_number.slice(-4) : null,
      connected: !!row.account_number,
    },
  });
}
