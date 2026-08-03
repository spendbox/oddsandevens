import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ACCOUNT_NUMBER_REGEX, PLATFORM_SHARE_PERCENT } from "@/lib/constants";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { listBanks, paystackConfigured, resolveAccount, upsertSubaccount } from "@/lib/paystack";

/** The banks Paystack can settle to, for the payout form's dropdown. */
export async function GET() {
  const { userId } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!paystackConfigured()) return NextResponse.json({ banks: [] });
  return NextResponse.json({ banks: (await listBanks()) ?? [] });
}

/**
 * Point a contributor's 70% at their bank.
 *
 * Registering the account as a Paystack subaccount is what makes the split
 * real rather than a line in a report: every power-up bought against their
 * boxes is charged against that subaccount, and Paystack settles their share
 * to them directly. Nobody at Spendbox ever moves the money by hand, and it
 * never sits in our balance in the first place.
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

  // `percentageCharge` is the share the *subaccount* keeps, so it's theirs.
  const subaccount = await upsertSubaccount({
    existingCode: contributor.paystack_subaccount_code,
    businessName: contributor.display_name,
    bankCode: body.bankCode,
    accountNumber,
    percentageCharge: 100 - PLATFORM_SHARE_PERCENT,
  });
  if (!subaccount) return NextResponse.json({ error: "subaccount_failed" }, { status: 502 });

  const { error } = await supabaseAdmin()
    .from("contributors")
    .update({
      payout_bank_code: body.bankCode,
      payout_bank_name: body.bankName ?? null,
      payout_account_number: accountNumber,
      payout_account_name: resolved.accountName,
      paystack_subaccount_code: subaccount.subaccountCode,
    })
    .eq("id", contributor.id);
  if (error) {
    console.error("[payout] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({
    result: "connected",
    accountName: resolved.accountName,
    bankName: body.bankName ?? null,
  });
}
