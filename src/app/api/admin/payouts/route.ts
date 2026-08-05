import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";

/**
 * What contributors are owed, and a record of what has been sent.
 *
 * Most contributor money never passes through us — Paystack splits a sale
 * against their own subaccount at settlement — so a healthy row here reads
 * zero. What accumulates is everything earned *before* they connected an
 * account, plus anything whose split failed to route, and that has to be
 * transferred by hand like a prize.
 *
 * Owed is earned minus sent, computed in SQL from the split stored on each
 * order. It is not a running balance kept up to date by this route, which is
 * what makes recording a payout late, twice or partially harmless.
 */

interface BalanceRow {
  contributor_id: string;
  display_name: string;
  handle: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  has_subaccount: boolean;
  earned_kobo: number;
  paid_kobo: number;
  owed_kobo: number;
  last_paid_at: string | null;
}

export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await supabaseAdmin().rpc("contributor_balances");

  return NextResponse.json({
    payouts: ((data ?? []) as BalanceRow[]).map((row) => ({
      contributorId: row.contributor_id,
      name: row.display_name,
      handle: row.handle,
      bankName: row.bank_name,
      accountNumber: row.account_number,
      accountName: row.account_name,
      /** True when Paystack is already routing their share for them. */
      autoSettled: row.has_subaccount,
      earnedKobo: Number(row.earned_kobo),
      paidKobo: Number(row.paid_kobo),
      owedKobo: Number(row.owed_kobo),
      lastPaidAt: row.last_paid_at,
    })),
  });
}

/** Tick one off: record a transfer against a contributor. */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    contributorId?: string;
    amountKobo?: number;
    note?: string;
  };

  const amount = Math.trunc(Number(body.amountKobo ?? 0));
  if (!body.contributorId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().rpc("record_contributor_payout", {
    p_contributor_id: body.contributorId,
    p_amount_kobo: amount,
    p_note: body.note ?? null,
    p_paid_by: admin.email,
  });

  if (error) {
    console.error("[payouts] record failed:", error);
    return NextResponse.json({ error: "record_failed" }, { status: 500 });
  }
  return NextResponse.json({ result: "recorded" });
}
