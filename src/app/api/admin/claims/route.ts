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
  players: {
    email: string;
    bank_name: string | null;
    account_number: string | null;
    account_name: string | null;
  } | null;
  boxes: { title: string; slug: string } | null;
}

const COLUMNS =
  "id, amount_kobo, status, bank_name, account_number, account_name, created_at, paid_at, " +
  "players(email, bank_name, account_number, account_name), boxes(title, slug)";

/**
 * Prizes owed, with the account each one is going to.
 *
 * The account is read off the *player* rather than off the claim, and that is
 * the fix for a screen that was showing nothing at all. Bank details used to
 * be collected inside a claim, so the claim carried its own copy; they live on
 * the player now, which meant every claim here had three empty columns and no
 * way to pay anybody. A claim keeps a copy only once it has been paid, because
 * at that point it is a payment record and must not move if somebody edits
 * their details afterwards.
 *
 * Full addresses and account numbers are shown, because whoever is making the
 * transfer needs them.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin()
    .from("reward_claims")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("[claims] read failed:", error);

  return NextResponse.json({
    claims: ((data ?? []) as unknown as ClaimJoin[]).map((row) => {
      // Paid claims show what they were paid to. Everything else shows where
      // it is going to be sent, which is whatever the player has on file now.
      const paid = row.status === "paid";
      const bankName = paid ? row.bank_name : row.players?.bank_name ?? null;
      const accountNumber = paid
        ? row.account_number
        : row.players?.account_number ?? null;
      const accountName = paid
        ? row.account_name
        : row.players?.account_name ?? null;

      return {
        id: row.id,
        amountKobo: Number(row.amount_kobo),
        status: row.status,
        player: row.players?.email ?? "",
        boxTitle: row.boxes?.title ?? "",
        boxSlug: row.boxes?.slug ?? "",
        bankName,
        accountNumber,
        accountName,
        /** False when there is nothing to pay to yet, which is not our fault. */
        payable: !!accountNumber,
        wonAt: row.created_at,
        paidAt: row.paid_at,
      };
    }),
  });
}

/**
 * Mark a prize as sent, and tell the winner.
 *
 * The account is copied onto the claim at this moment rather than earlier,
 * which is what makes it a record of the transfer that was actually made. A
 * claim with no account behind it cannot be marked paid at all — there would
 * be nowhere for the money to have gone.
 */
export async function POST(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { claimId?: string };
  if (!body.claimId) return NextResponse.json({ error: "invalid_claim" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("reward_claims")
    .select(COLUMNS)
    .eq("id", body.claimId)
    .maybeSingle();

  const claim = existing as unknown as ClaimJoin | null;
  if (!claim) return NextResponse.json({ error: "claim_not_found" }, { status: 404 });
  if (claim.status === "paid") {
    return NextResponse.json({ error: "already_paid" }, { status: 409 });
  }

  const account = {
    bank_code: null as string | null,
    bank_name: claim.bank_name ?? claim.players?.bank_name ?? null,
    account_number: claim.account_number ?? claim.players?.account_number ?? null,
    account_name: claim.account_name ?? claim.players?.account_name ?? null,
  };
  if (!account.account_number) {
    return NextResponse.json({ error: "no_account" }, { status: 409 });
  }

  const { data } = await db
    .from("reward_claims")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      bank_name: account.bank_name,
      account_number: account.account_number,
      account_name: account.account_name,
    })
    .eq("id", body.claimId)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "claim_not_payable" }, { status: 409 });

  if (claim.players?.email) {
    await sendRewardPaidEmail({
      to: claim.players.email,
      title: claim.boxes?.title ?? "your spendbox",
      amountKobo: Number(claim.amount_kobo),
      accountName: account.account_name,
    });
  }

  return NextResponse.json({ result: "paid" });
}
