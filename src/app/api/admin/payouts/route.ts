import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { sendPayoutSentEmail } from "@/lib/email";

/**
 * What contributors are owed, and a record of what has been sent.
 *
 * All of it passes through us now. Sales used to split themselves at
 * settlement against each contributor's Paystack subaccount, so a healthy row
 * here read zero and the ledger was for the exceptions; payouts are made by
 * hand, weekly, so every row is real work and this screen is where the week's
 * work is.
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

  const db = supabaseAdmin();
  const { error } = await db.rpc("record_contributor_payout", {
    p_contributor_id: body.contributorId,
    p_amount_kobo: amount,
    p_note: body.note ?? null,
    p_paid_by: admin.email,
  });

  if (error) {
    console.error("[payouts] record failed:", error);
    return NextResponse.json({ error: "record_failed" }, { status: 500 });
  }

  // And tell them. A transfer nobody is told about is a transfer that gets
  // chased — the dashboard shows it, but nobody refreshes a dashboard on the
  // off-chance. Never blocks the record: the money has already moved.
  await notify(db, body.contributorId, amount, body.note ?? null);

  return NextResponse.json({ result: "recorded" });
}

/**
 * Email the contributor whose share has just been sent.
 *
 * Their address can be in one of two places, because a contributor may be a
 * player who started building or an older account that signed up before the
 * two were the same thing. The player row is checked first, since that is what
 * everybody created since has.
 */
async function notify(
  db: ReturnType<typeof supabaseAdmin>,
  contributorId: string,
  amountKobo: number,
  note: string | null
): Promise<void> {
  try {
    const { data } = await db
      .from("contributors")
      .select("owner_id, player_id, payout_account_name, players(email)")
      .eq("id", contributorId)
      .maybeSingle();
    if (!data) return;

    const row = data as unknown as {
      owner_id: string | null;
      players: { email: string } | null;
      payout_account_name: string | null;
    };

    let to = row.players?.email ?? null;
    if (!to && row.owner_id) {
      const { data: user } = await db.auth.admin.getUserById(row.owner_id);
      to = user?.user?.email ?? null;
    }
    if (!to) return;

    await sendPayoutSentEmail({
      to,
      amountKobo,
      accountName: row.payout_account_name,
      note,
    });
  } catch (err) {
    console.error("[payouts] notify failed:", err);
  }
}
