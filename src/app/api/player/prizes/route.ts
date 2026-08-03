import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ACCOUNT_NUMBER_REGEX } from "@/lib/constants";
import { playerEmail } from "@/lib/player-session";
import { listBanks, resolveAccount } from "@/lib/paystack";

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

/** Every safe this player has opened, and where each prize has got to. */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ prizes: [], banks: [] });

  const db = supabaseAdmin();
  const { data: player } = await db.from("players").select("id").eq("email", email).maybeSingle();
  if (!player) return NextResponse.json({ prizes: [], banks: [] });

  const { data } = await db
    .from("prize_claims")
    .select(CLAIM_COLUMNS)
    .eq("player_id", player.id)
    .order("created_at", { ascending: false });

  const prizes = ((data ?? []) as unknown as ClaimRow[]).map((row) => ({
    id: row.id,
    amountKobo: Number(row.amount_kobo),
    status: row.status,
    title: row.boxes?.title ?? "A spendbox",
    slug: row.boxes?.slug ?? null,
    accountName: row.account_name,
    bankName: row.bank_name,
    wonAt: row.created_at,
    paidAt: row.paid_at,
  }));

  // Only fetch the bank list when there's actually something to claim.
  const banks = prizes.some((p) => p.status === "unclaimed") ? ((await listBanks()) ?? []) : [];

  return NextResponse.json({ prizes, banks });
}

/**
 * Tell us where to send a prize.
 *
 * The account number is resolved with the bank before it's stored, so a
 * winner who fats-fingers a digit is shown whose account they actually
 * reached rather than finding out after the transfer.
 */
export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    claimId?: string;
    bankCode?: string;
    bankName?: string;
    accountNumber?: string;
  };
  const accountNumber = (body.accountNumber ?? "").trim();
  if (!body.claimId || !body.bankCode || !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: player } = await db.from("players").select("id").eq("email", email).maybeSingle();
  if (!player) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const resolved = await resolveAccount({ accountNumber, bankCode: body.bankCode });
  if (!resolved) return NextResponse.json({ error: "account_not_found" }, { status: 400 });

  const { data, error } = await db
    .from("prize_claims")
    .update({
      status: "submitted",
      bank_code: body.bankCode,
      bank_name: body.bankName ?? null,
      account_number: accountNumber,
      account_name: resolved.accountName,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", body.claimId)
    .eq("player_id", player.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  }
  return NextResponse.json({ result: "submitted", accountName: resolved.accountName });
}
