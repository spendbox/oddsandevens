import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { sendRewardPaidEmail } from "@/lib/email";

interface ClaimJoin {
  id: string;
  amount_kobo: number;
  status: "unclaimed" | "submitted" | "paid";
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  created_at: string;
  paid_at: string | null;
  players: { email: string } | null;
  boxes: { title: string; slug: string } | null;
}

const COLUMNS =
  "id, amount_kobo, status, bank_name, account_number, account_name, created_at, paid_at, players(email), boxes(title, slug)";

/**
 * Prizes owed.
 *
 * Unlike the power-up split, a prize can't ride on a Paystack subaccount —
 * the winner is a stranger with no account here until they've won — so this
 * is the one place money moves by hand. Full addresses and account numbers
 * are shown, because whoever is sending the transfer needs them.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await supabaseAdmin()
    .from("reward_claims")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({
    claims: ((data ?? []) as unknown as ClaimJoin[]).map((row) => ({
      id: row.id,
      amountKobo: Number(row.amount_kobo),
      status: row.status,
      player: row.players?.email ?? "",
      boxTitle: row.boxes?.title ?? "",
      boxSlug: row.boxes?.slug ?? "",
      bankName: row.bank_name,
      accountNumber: row.account_number,
      accountName: row.account_name,
      wonAt: row.created_at,
      paidAt: row.paid_at,
    })),
  });
}

/** Mark a prize as sent, and tell the winner. */
export async function POST(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { claimId?: string };
  if (!body.claimId) return NextResponse.json({ error: "invalid_claim" }, { status: 400 });

  const db = supabaseAdmin();
  const { data } = await db
    .from("reward_claims")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", body.claimId)
    .eq("status", "submitted")
    .select(COLUMNS)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "claim_not_payable" }, { status: 409 });

  const claim = data as unknown as ClaimJoin;
  if (claim.players?.email) {
    await sendRewardPaidEmail({
      to: claim.players.email,
      title: claim.boxes?.title ?? "your spendbox",
      amountKobo: Number(claim.amount_kobo),
      accountName: claim.account_name,
    });
  }

  return NextResponse.json({ result: "paid" });
}
