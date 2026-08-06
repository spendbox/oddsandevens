import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ACCOUNT_NUMBER_REGEX } from "@/lib/constants";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { listBanks, paystackConfigured, resolveAccount } from "@/lib/paystack";
import { sendAdminPayoutDueEmail } from "@/lib/email";

/** The banks Paystack can settle to, for the payout form's dropdown. */
export async function GET() {
  const { userId } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!paystackConfigured()) return NextResponse.json({ banks: [] });
  return NextResponse.json({ banks: (await listBanks()) ?? [] });
}

/**
 * Where a contributor's share is sent.
 *
 * This used to register the account as a Paystack subaccount so that every
 * sale split itself at settlement and nobody ever moved the money by hand.
 * Payouts are made by hand now — weekly, from the ledger the admin screen
 * works through — so a subaccount is a second copy of these details living
 * somewhere nothing reads, and one more thing that can silently fail to be
 * created. The account is recorded here and that is all it is for.
 *
 * The number is still checked against the bank before it is stored, because
 * the failure it prevents is unchanged: a mistyped digit that nobody notices
 * until a transfer has gone to a stranger.
 */
export async function POST(req: Request) {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contributor) return NextResponse.json({ error: "no_profile" }, { status: 409 });
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    bankCode?: string;
    bankName?: string;
    accountNumber?: string;
  };
  const accountNumber = (body.accountNumber ?? "").trim();
  if (!body.bankCode || !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400 });
  }

  const resolved = await resolveAccount({ accountNumber, bankCode: body.bankCode });
  if (!resolved) return NextResponse.json({ error: "account_not_found" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("contributors")
    .update({
      payout_bank_code: body.bankCode,
      payout_bank_name: body.bankName ?? null,
      payout_account_number: accountNumber,
      payout_account_name: resolved.accountName,
    })
    .eq("id", contributor.id);
  if (error) {
    console.error("[payout] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  /*
   * Same rule as a player's prize: an account is the half that makes a balance
   * payable. A contributor who has earned a share but never said where to send
   * it is not something an administrator can act on; one who has just told us
   * is.
   *
   * The balance is recomputed here rather than read off the dashboard's
   * response, because the dashboard is a browser and this decides whether an
   * administrator is interrupted.
   */
  const owed = await owedKobo(contributor.id);
  if (owed > 0) {
    await sendAdminPayoutDueEmail({
      kind: "contributor",
      who: contributor.display_name || "A contributor",
      amountKobo: owed,
      accountName: resolved.accountName,
      bankName: body.bankName ?? null,
    });
  }

  return NextResponse.json({
    result: "connected",
    accountName: resolved.accountName,
    bankName: body.bankName ?? null,
  });
}

/**
 * Earned minus already sent, in kobo.
 *
 * The earned half is the contributor's share written onto every paid order at
 * the moment of sale — power-ups and lives both — which is the same arithmetic
 * the dashboard does and the same the admin ledger pays against.
 */
async function owedKobo(contributorId: string): Promise<number> {
  const db = supabaseAdmin();
  const [{ data: powerUps }, { data: lives }, { data: sent }] = await Promise.all([
    db
      .from("power_up_orders")
      .select("contributor_kobo")
      .eq("contributor_id", contributorId)
      .eq("status", "paid"),
    db
      .from("life_orders")
      .select("contributor_kobo")
      .eq("contributor_id", contributorId)
      .eq("status", "paid"),
    db
      .from("contributor_payouts")
      .select("amount_kobo")
      .eq("contributor_id", contributorId),
  ]);

  const total = (rows: { contributor_kobo?: number }[] | null) =>
    (rows ?? []).reduce((sum, r) => sum + Number(r.contributor_kobo ?? 0), 0);

  const earned = total(powerUps as never) + total(lives as never);
  const paid = ((sent ?? []) as { amount_kobo: number }[]).reduce(
    (sum, r) => sum + Number(r.amount_kobo ?? 0),
    0
  );
  return Math.max(0, earned - paid);
}
